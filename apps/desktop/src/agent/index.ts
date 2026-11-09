/**
 * Agent process: owns one Xuegen Pi session and translates its events into the
 * `shared/` protocol.
 *
 * Runs inside an Electron `utilityProcess`, so a crash here never takes down the
 * window; the main process restarts it. It talks to the host by posting
 * `AgentToHostMessage` values on the process messaging channel and receives
 * `HostToAgentMessage` values on it.
 *
 * The event -> protocol mapping is pure (see `event-mapper.ts`); this module is
 * the stateful shell around it, owning the session and the transport.
 */

import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type {
  AgentToHostEvent,
  AgentToHostMessage,
  HostToAgentMessage,
  ModelListPayload,
  SessionRole,
  SessionStatePayload,
  ThinkingLevel,
} from "../shared/protocol.js";
import { assertNever, sessionRoleOrFree } from "../shared/protocol.js";
import { createXuegenSession, findModel, listAvailableModels, listCommands } from "./session.js";
import { createEventMapperState, mapPiEvent, type EventMapperState } from "./event-mapper.js";
import { historyFromEntries, type HistoryReplay } from "./history.js";
import { sessionState } from "./snapshot.js";
import { withSessionId } from "./session-request.js";
import { runSessionRequest, type TurnDeps } from "./turn.js";

/**
 * Electron `utilityProcess` global, present only inside the agent process.
 * `parentPort` is added by Electron and is not part of the Node typings.
 */
declare const process: NodeJS.Process & {
  parentPort: {
    postMessage(message: AgentToHostMessage): void;
    on(event: "message", listener: (message: { data: HostToAgentMessage }) => void): void;
  };
};

/** Post a message that belongs to no session (startup and crash reports). */
function post(message: AgentToHostMessage): void {
  process.parentPort.postMessage(message);
}

class AgentHost {
  private session: AgentSession | null = null;
  private unsubscribe: (() => void) | null = null;
  private idCounter = 0;
  private mapperState: EventMapperState = createEventMapperState();
  private cwd = "";
  private models: ModelListPayload = { models: [] };
  private history: HistoryReplay = { messages: [], notes: [] };
  private role: SessionRole = { kind: "free" };

  /** Post an event stamped with the session it belongs to. */
  private post(message: AgentToHostEvent): void {
    post(withSessionId(message, this.session?.sessionId ?? null));
  }

  async start(): Promise<void> {
    const { session, cwd, role, modelFallbackMessage } = await createXuegenSession({ continueRecent: true });
    this.session = session;
    this.cwd = cwd;
    this.role = role;
    this.unsubscribe = session.subscribe((event) => this.handleEvent(event));

    const { models, reason } = await listAvailableModels(session);
    this.models = reason === undefined ? { models } : { models, reason };
    this.history = historyFromEntries(session.sessionManager.getBranch(), this.nextId("session"));

    this.broadcast();
    this.emitContextUsage();
    this.post({ type: "agent-status", status: "ready" });

    // Warnings are user-facing; post them after the ready snapshot so the UI has state.
    if (modelFallbackMessage) this.post({ type: "error", error: `会话以不同模型恢复：${modelFallbackMessage}` });
    if (models.length === 0) {
      this.post({ type: "error", error: "未登录或无可用模型。请先在终端运行 xuegen 并执行 /login。" });
    }
  }

  /** Send the full current snapshot, so late subscribers lose nothing. */
  private broadcast(): void {
    this.post({
      type: "ready",
      state: this.snapshot(),
      models: this.models,
    });
    this.post({ type: "history", messages: this.history.messages, notes: this.history.notes });
  }

  private snapshot(): SessionStatePayload {
    return sessionState({
      session: this.session,
      cwd: this.cwd,
      role: this.role,
      queuedFollowUps: this.mapperState.queuedFollowUps,
    });
  }

  private emitState(): void {
    this.post({ type: "state", state: this.snapshot() });
  }

  private nextId = (prefix: string): string => {
    this.idCounter += 1;
    return `${prefix}-${Date.now()}-${this.idCounter}`;
  };

  private refreshHistory(): void {
    if (!this.session) return;
    this.history = historyFromEntries(this.session.sessionManager.getBranch(), this.nextId("session"));
  }

  /** Report the session's current estimated context usage, when available. */
  private emitContextUsage(): void {
    const usage = this.session?.getContextUsage();
    if (!usage) return;
    this.post({
      type: "context-usage",
      tokens: usage.tokens,
      contextWindow: usage.contextWindow,
      percent: usage.percent,
    });
  }

  private handleEvent(event: AgentSessionEvent): void {
    const mapped = mapPiEvent(this.mapperState, event, this.nextId);
    this.mapperState = mapped.state;
    for (const message of mapped.messages) this.post(message);
    if (mapped.stateChanged) this.emitState();
    // A turn just settled, or a compaction changed what counts against the
    // window: refresh the usage the title bar shows.
    if (event.type === "agent_settled" || event.type === "compaction_end") this.emitContextUsage();
  }

  /** The dependencies a session-scoped request needs from the host. */
  private turnDeps(): TurnDeps {
    return {
      session: this.session,
      post: (event) => this.post(event),
      nextId: this.nextId,
      appendUserMessage: (message) => {
        this.history = { ...this.history, messages: [...this.history.messages, message] };
      },
      emitState: () => this.emitState(),
    };
  }

  async handle(message: HostToAgentMessage): Promise<void> {
    switch (message.type) {
      case "init": {
        // A renderer (re)load asks for the transcript: rebuild it from the
        // session, since replies streamed since startup are not in the cache.
        this.refreshHistory();
        this.broadcast();
        this.emitContextUsage();
        return;
      }
      case "prompt":
      case "compact":
      case "abort": {
        await runSessionRequest(this.turnDeps(), message);
        return;
      }
      case "new-session": {
        await this.restart({ continueRecent: false, role: sessionRoleOrFree(message.role) });
        return;
      }
      case "continue-session": {
        await this.restart({ continueRecent: true });
        return;
      }
      case "open-session": {
        // An absent role is not passed down: the guard then infers the role
        // from the session file's own hints (opening marker, remembered maps).
        await this.restart(
          message.sessionFile
            ? { continueRecent: false, sessionFile: message.sessionFile, role: message.role }
            : { continueRecent: false, role: message.role },
        );
        this.post({
          type: "session-opened",
          requestId: message.requestId,
          sessionFile: this.session?.sessionFile ?? null,
        });
        return;
      }
      case "set-model": {
        await this.setModel(message.provider, message.id);
        return;
      }
      case "set-thinking-level": {
        this.setThinkingLevel(message.level);
        return;
      }
      case "list-models": {
        if (!this.session) return;
        await this.refreshModels();
        this.post({ type: "models", models: this.models });
        return;
      }
      case "list-commands": {
        if (!this.session) return;
        // Filter at query time so a toggled skill is reflected on the next call;
        // the renderer sends the current `disabledSkills` with each request.
        this.post({ type: "commands", commands: listCommands(this.session, message.disabledSkills) });
        return;
      }
      default:
        assertNever(message);
    }
  }

  /** Fetch the full model list, with a reason when it is empty (B6). */
  private async refreshModels(): Promise<void> {
    if (!this.session) return;
    const { models, reason } = await listAvailableModels(this.session);
    this.models = reason === undefined ? { models } : { models, reason };
  }

  private async setModel(provider: string, id: string): Promise<void> {
    if (!this.session) throw new Error("会话尚未就绪");
    const model = await findModel(this.session, provider, id);
    if (!model) {
      this.post({ type: "error", error: `找不到模型 ${provider}/${id}` });
      return;
    }
    // `persist: true` writes the choice to Pi's default provider/model, so the
    // next session starts on it (B4: the user's model choice must be remembered).
    await this.session.setModel(model, { persist: true });
    this.emitState();
  }

  /** Set the thinking level and remember it as the global default (B4). */
  private setThinkingLevel(level: ThinkingLevel): void {
    if (!this.session) return;
    this.session.setThinkingLevel(level, { persist: true });
    this.emitState();
  }

  /** Replace the active session: new, or continue the most recent. */
  private async restart(options: {
    continueRecent: boolean;
    sessionFile?: string;
    role?: SessionRole | undefined;
  }): Promise<void> {
    this.unsubscribe?.();
    this.session?.dispose();
    this.session = null;
    this.mapperState = createEventMapperState();

    const { session, cwd, role } = await createXuegenSession({
      continueRecent: options.continueRecent,
      ...(options.sessionFile !== undefined ? { sessionFile: options.sessionFile } : {}),
      ...(options.role !== undefined ? { role: options.role } : {}),
    });
    this.session = session;
    this.cwd = cwd;
    this.role = role;
    this.unsubscribe = session.subscribe((event) => this.handleEvent(event));

    this.post({ type: "models-changed" });
    await this.refreshModels();
    this.refreshHistory();
    this.post({ type: "models", models: this.models });
    this.post({ type: "history", messages: this.history.messages, notes: this.history.notes });
    this.emitState();
    this.emitContextUsage();
  }

  dispose(): void {
    this.unsubscribe?.();
    this.session?.dispose();
  }
}

const host = new AgentHost();

process.parentPort.on("message", (event) => {
  void host.handle(event.data).catch((error) => {
    post({ type: "fatal", error: error instanceof Error ? error.message : String(error) });
  });
});

host.start().catch((error) => {
  post({ type: "fatal", error: error instanceof Error ? error.message : String(error) });
});

process.on("uncaughtException", (error) => {
  post({ type: "fatal", error: error.message });
});
