/**
 * Xuegen session factory.
 *
 * Builds a Pi `AgentSession` whose configuration matches the CLI (`bin/xuegen.mjs`):
 * no automatic discovery of extensions, skills, prompt templates, themes, or
 * context files; only the repository `skills/` directory; `instructions.md`
 * appended to the system prompt; MCP and tool-search extensions enabled; project
 * trust declined (the CLI's `--no-approve`).
 *
 * Pi captures filesystem paths from the environment when its modules load, so
 * this module applies the isolation first and then imports Pi dynamically.
 * The `import type` above is erased at compile time and loads nothing at
 * runtime, so it does not violate that ordering; only value imports must stay
 * dynamic. Never top-level-import a Pi *value* in a module this one depends on;
 * call `createXuegenSession()` instead.
 */

import { applyXuegenEnvironment, repoRoot } from "./environment.js";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { CommandInfo, ModelInfo } from "../shared/protocol.js";

/** The repository `skills/` directory, resolved from the repo root (not copied). */
export const skillsDir = join(repoRoot, "skills");

/**
 * Skill directories the agent loads: the repository `skills/` plus the user's
 * `~/.xuegen/skills/` when it exists. Kept in the order Pi should resolve name
 * clashes (builtin first).
 */
export function skillPaths(home: string): string[] {
  const personal = join(home, "skills");
  return existsSync(personal) ? [skillsDir, personal] : [skillsDir];
}

/** The append-system-prompt source, matching `bin/xuegen.mjs --append-system-prompt`. */
export const instructionsPath = join(repoRoot, "instructions.md");

/** Read the repository `instructions.md` that becomes the appended system prompt. */
export function readInstructions(): string {
  return readFileSync(instructionsPath, "utf8");
}

export interface CreateXuegenSessionOptions {
  /**
   * Continue the most recent session for `cwd` (equivalent to `xuegen -c`).
   * Defaults to true, matching the desktop default of resuming on launch.
   */
  continueRecent?: boolean;
  /**
   * Open this earlier session file instead (a course's own session). Ignored
   * unless it is an existing `.jsonl` under `<home>/sessions/`; a missing or
   * foreign path falls back to a new session.
   */
  sessionFile?: string;
}

export interface XuegenSessionBundle {
  session: AgentSession;
  cwd: string;
  home: string;
  /** Warning when a restored session ran on a different model than saved. */
  modelFallbackMessage?: string;
}

/**
 * Create a Pi agent session configured exactly like the CLI's Xuegen session.
 *
 * The returned session has extensions bound, so the MCP extension connects its
 * servers. Callers own the session and must `dispose()` it.
 */
export async function createXuegenSession(
  options: CreateXuegenSessionOptions = {},
): Promise<XuegenSessionBundle> {
  const { home, cwd } = applyXuegenEnvironment();

  const {
    createAgentSession,
    createMcpExtension,
    createToolSearchExtension,
    DefaultResourceLoader,
    SessionManager,
    SettingsManager,
  } = await import("@earendil-works/pi-coding-agent");

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: home,
    // Equivalent to the CLI flags --no-extensions/--no-skills/... : start from
    // nothing, then add back exactly what Xuegen wants. The CLI loads only the
    // `builtin:mcp` and `builtin:tool-search` extensions; codemode is not loaded.
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    additionalSkillPaths: skillPaths(home),
    appendSystemPrompt: [readInstructions()],
    // Named inline extensions so the startup diagnostics (and the smoke test)
    // show `<inline:tool-search>` / `<inline:mcp>` instead of opaque indices.
    extensionFactories: [
      { name: "tool-search", factory: createToolSearchExtension() },
      { name: "mcp", factory: createMcpExtension() },
    ],
  });
  await resourceLoader.reload();

  // `projectTrusted: false` is the SDK equivalent of the CLI's `--no-approve`:
  // protected project resources (`.pi/*`, project settings) are skipped. MCP
  // servers and the deferred-exposure tools they expose still come from the
  // agent directory (`home`), not the project.
  const settingsManager = SettingsManager.create(cwd, home, { projectTrusted: false });

  const sessionManager = options.sessionFile
    ? isOwnSessionFile(home, options.sessionFile)
      ? SessionManager.open(options.sessionFile)
      : SessionManager.create(cwd)
    : options.continueRecent === false
      ? SessionManager.create(cwd)
      : SessionManager.continueRecent(cwd);

  const { session, modelFallbackMessage } = await createAgentSession({
    cwd,
    agentDir: home,
    resourceLoader,
    settingsManager,
    sessionManager,
  });

  // Emits session_start, which connects the MCP servers in the background and
  // lets the MCP extension activate tool_search for deferred-exposure servers.
  await session.bindExtensions({});

  return modelFallbackMessage === undefined
    ? { session, cwd, home }
    : { session, cwd, home, modelFallbackMessage };
}

/**
 * List models usable with the configured credentials.
 *
 * `getAvailable()` resolves provider auth, but Pi marks a provider as
 * "configured" from static config alone (a fallback/placeholder status) before a
 * real credential is resolved, so a provider with no usable credential can still
 * appear (B6: the menu listed a dozen Claude models while only DeepSeek was
 * logged in). We drop any provider whose auth status has no real source, and
 * report a reason when the filtered list is empty.
 */
export async function listAvailableModels(
  session: AgentSession,
): Promise<{ models: ModelInfo[]; reason?: string }> {
  const available = await session.modelRuntime.getAvailable();
  const usable = new Set(
    [...new Set(available.map((model) => model.provider))].filter((provider) =>
      hasUsableAuth(session, provider),
    ),
  );
  const models = available
    .filter((model) => usable.has(model.provider))
    .map((model) => ({ provider: model.provider, id: model.id, name: model.name }));
  return models.length === 0 ? { models, reason: "未配置任何凭据或模型。" } : { models };
}

/**
 * True when a provider has a real credential, not merely a config placeholder.
 *
 * Pi exposes the auth source: `stored` (a saved login), `runtime` (an API key
 * set this run), `environment`, `models_json_key`, and `models_json_command` are
 * all real; `fallback` and an absent status mean "no credential yet".
 */
function hasUsableAuth(session: AgentSession, provider: string): boolean {
  const status = session.modelRuntime.getProviderAuthStatus(provider);
  if (status.source === undefined || status.source === "fallback") return false;
  return status.configured;
}

/** Find a configured model by provider and id, or undefined when absent. */
export function findModel(session: AgentSession, provider: string, id: string) {
  return session.modelRuntime.getModel(provider, id);
}

/**
 * List the loaded skills as command-menu entries, excluding disabled ones.
 *
 * Sourced from the resource loader so a `/` entry always corresponds to a skill
 * the agent can actually invoke. Disabled skills are filtered here (not at load
 * time) so toggling one only needs a fresh `list-commands` call.
 */
export function listCommands(session: AgentSession, disabledSkills: string[]): CommandInfo[] {
  const disabled = new Set(disabledSkills);
  return session.resourceLoader
    .getSkills()
    .skills.filter((skill) => !disabled.has(skill.name))
    .map((skill) => ({ name: skill.name, description: skill.description ?? "", source: "skill" as const }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** True for an existing session transcript inside this home's `sessions/` tree. */
function isOwnSessionFile(home: string, file: string): boolean {
  const root = `${resolve(home, "sessions")}${sep}`;
  const full = resolve(file);
  return full.startsWith(root) && full.endsWith(".jsonl") && existsSync(full);
}
