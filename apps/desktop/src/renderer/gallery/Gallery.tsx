/**
 * Skin gallery.
 *
 * A development-only view (`?gallery&skin=<id>`) that renders every slot and
 * every content kind with fixed samples, so a skin can be reviewed and
 * screenshotted without a model request. It reuses the real skin slots and the
 * core message renderer, so what the gallery shows is exactly what the app shows.
 */

import type { ChatMessage } from "@shared/protocol.js";
import type { NoticeItem, ShellProps, SkinSlots } from "../skins/contract.js";
import type { ContentRenderers } from "../skins/contract.js";
import { MessageRenderer } from "../core/chat/message-renderer.js";
import { parseContent } from "../core/content/parse-content.js";
import { strings } from "../core/strings.js";
import { MODEL_ERROR_SUMMARIES } from "../core/chat/model-error.js";
import { allCommands, filterCommands, groupCommands } from "../core/commands/commands.js";
import { toolDescriptors } from "../skins/chicago/icons.js";
import { SAMPLE_PANELS } from "./panel-samples.js";
import {
  SAMPLE_ASSISTANT_MESSAGE,
  SAMPLE_ERROR_MESSAGE,
  SAMPLE_MARKDOWN,
  SAMPLE_MODELS,
  SAMPLE_STREAMING_MESSAGE,
  SAMPLE_TOOL_ERROR,
  SAMPLE_TOOL_RUNNING,
  SAMPLE_TOOL_SUCCESS,
  SAMPLE_USER_MESSAGE,
} from "./samples.js";

export interface GalleryProps {
  slots: SkinSlots;
  content: ContentRenderers;
  skinChoices: { id: string; name: string }[];
  activeSkin: string;
  onSelectSkin(id: string): void;
  bodyScale: number;
  onBodyScale(value: number): void;
  skinOptions: Record<string, string>;
  onSkinOption(key: string, value: string): void;
  onWindowBackground(color: string): void;
}

const GALLERY_NOTICES: NoticeItem[] = [
  { tone: "info", text: strings.chat.empty },
  { tone: "error", text: strings.notice.agentCrashed },
  {
    tone: "error",
    text: MODEL_ERROR_SUMMARIES.auth,
    detail: '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
  },
];

const SLASH = filterCommands(allCommands([]), "");

/** Render one message through the real core renderer. */
function Message({
  slots,
  content,
  message,
  thinking = false,
}: {
  slots: SkinSlots;
  content: ContentRenderers;
  message: ChatMessage;
  thinking?: boolean;
}) {
  return (
    <MessageRenderer
      slots={slots}
      content={content}
      message={message}
      thinking={thinking}
      onRetry={() => undefined}
      onExerciseAnswer={() => undefined}
      onExerciseHint={() => undefined}
      onExerciseSkip={() => undefined}
    />
  );
}

export function Gallery({
  slots,
  content,
  skinChoices,
  activeSkin,
  onSelectSkin,
  bodyScale,
  onBodyScale,
  skinOptions,
  onSkinOption,
  onWindowBackground,
}: GalleryProps) {
  const shellProps: ShellProps = {
    children: null,
    sessionTitle: "CTM 7 周学习计划",
    skins: skinChoices,
    activeSkin,
    onSelectSkin,
    bodyScale,
    onBodyScale,
    skinOptions,
    onSkinOption,
    onWindowBackground,
    models: SAMPLE_MODELS,
    currentModel: SAMPLE_MODELS[0] ?? null,
    onSelectModel: () => undefined,
    thinkingLevel: "medium",
    thinkingLevels: ["low", "medium", "high"],
    onSelectThinking: () => undefined,
    onNewSession: () => undefined,
    onContinueSession: () => undefined,
    agentStatus: "ready",
    notices: [],
    onDismissNotice: () => undefined,
    tools: toolDescriptors(),
    activeTool: "progress",
    onOpenTool: () => undefined,
    focusMode: false,
    onToggleFocus: () => undefined,
    style: "plain",
    onSelectStyle: () => undefined,
    styleCourse: null,
    onPrompt: () => undefined,
    panels: SAMPLE_PANELS,
  };

  const allNodes = parseContent(SAMPLE_MARKDOWN);
  const emptyState = { status: "loading" as const };
  const groups = groupCommands(SLASH);

  return (
    <slots.Shell {...shellProps}>
      <main data-slot="gallery">
        <h1>{strings.gallery.title}</h1>
        <p>{strings.gallery.description}</p>

        <section>
          <h2>Thread / UserMessage / AssistantMessage</h2>
          <slots.Thread
            messages={[SAMPLE_USER_MESSAGE, SAMPLE_ASSISTANT_MESSAGE]}
            thinking={false}
            noModels={false}
            modelsReason={null}
            renderMessage={(message, thinking) => (
              <Message slots={slots} content={content} message={message} thinking={thinking} />
            )}
          />
        </section>

        <section>
          <h2>Streaming（思考中 + 流式文本）</h2>
          <slots.Thread
            messages={[SAMPLE_STREAMING_MESSAGE]}
            thinking={false}
            noModels={false}
            modelsReason={null}
            renderMessage={(message, thinking) => (
              <Message slots={slots} content={content} message={message} thinking={thinking} />
            )}
          />
          <slots.Thinking label={strings.chat.thinking} />
        </section>

        <section>
          <h2>错误 / 空对话 / 未登录</h2>
          <Message slots={slots} content={content} message={SAMPLE_ERROR_MESSAGE} />
          <slots.Thread messages={[]} thinking={false} noModels={false} modelsReason={null} renderMessage={() => null} />
          <slots.Thread
            messages={[]}
            thinking={false}
            noModels
            modelsReason={strings.chat.loginHint}
            renderMessage={() => null}
          />
        </section>

        <section>
          <h2>ToolActivity（运行中 / 成功 / 失败）</h2>
          <slots.ToolActivity call={SAMPLE_TOOL_RUNNING} />
          <slots.ToolActivity call={SAMPLE_TOOL_SUCCESS} />
          <slots.ToolActivity call={SAMPLE_TOOL_ERROR} />
        </section>

        <section>
          <h2>Content（每个内容类型）</h2>
          {allNodes.map((node, index) => (
            <div key={index}>
              <content.Node node={node} streaming={false} />
            </div>
          ))}
        </section>

        <section>
          <h2>Composer / ModelPicker</h2>
          <slots.Composer
            streaming={false}
            disabled={false}
            onSend={() => undefined}
            onStop={() => undefined}
            style="plain"
            onStyle={() => undefined}
            commandsOpen={false}
            commandGroups={[]}
            commands={[]}
            selectedCommand={0}
            onSelectCommand={() => undefined}
            onRunCommand={() => undefined}
            onCloseCommands={() => undefined}
            onInput={() => undefined}
            answering={null}
            focusRequest={0}
          />
          <slots.Composer
            streaming
            disabled={false}
            onSend={() => undefined}
            onStop={() => undefined}
            style="detailed"
            onStyle={() => undefined}
            commandsOpen
            commandGroups={groups}
            commands={SLASH}
            selectedCommand={0}
            onSelectCommand={() => undefined}
            onRunCommand={() => undefined}
            onCloseCommands={() => undefined}
            onInput={() => undefined}
            answering={1}
            focusRequest={0}
          />
          <slots.ModelPicker models={SAMPLE_MODELS} current={SAMPLE_MODELS[0] ?? null} onSelect={() => undefined} disabled={false} />
          <slots.ModelPicker models={[]} current={null} onSelect={() => undefined} disabled />
        </section>

        <section>
          <h2>Notice</h2>
          {GALLERY_NOTICES.map((notice, index) => (
            <slots.Notice key={index} notice={notice} onDismiss={() => undefined} />
          ))}
        </section>

        <section>
          <h2>ToolDock / SlashMenu / DayEditor</h2>
          <slots.ToolDock
            tools={toolDescriptors()}
            active="reading"
            onOpen={() => undefined}
            todayActive={false}
            onOpenToday={() => undefined}
          />
          <slots.SlashMenu groups={groups} commands={SLASH} selected={1} onSelect={() => undefined} onRun={() => undefined} />
          <slots.DayEditor
            date="2026-11-05"
            title="11月5日 周四"
            initialText="- [ ] 读 CTM 第 2 章前半\n- [ ] 复习 Anki"
            savePath="2026-11-05"
            onSave={() => undefined}
            onCancel={() => undefined}
          />
        </section>

        <section>
          <h2>TodayPanel</h2>
          <slots.TodayPanel {...SAMPLE_PANELS.today} />
        </section>

        <section>
          <h2>ProgressPanel（就绪 / 加载中 / 出错）</h2>
          <slots.ProgressPanel {...SAMPLE_PANELS.progress} tool="progress" />
          <slots.ProgressPanel {...SAMPLE_PANELS.progress} tool="progress" courses={emptyState} />
          <slots.ProgressPanel
            {...SAMPLE_PANELS.progress}
            tool="progress"
            courses={{ status: "error", code: "vault-missing", message: strings.data.errors["vault-missing"] }}
          />
        </section>

        <section>
          <h2>ReadingPanel</h2>
          <slots.ReadingPanel {...SAMPLE_PANELS.reading} tool="reading" />
          <slots.ReadingPanel {...SAMPLE_PANELS.reading} tool="reading" queue={{ status: "ready", value: [] }} />
          <slots.ReadingPanel {...SAMPLE_PANELS.reading} tool="reading" queue={{ status: "loading" }} />
          <slots.ReadingPanel {...SAMPLE_PANELS.reading} tool="reading" queue={{ status: "error", code: "script-failed", message: "读取知识库失败。" }} />
        </section>

        <section>
          <h2>CardsPanel（Anki 未打开）</h2>
          <slots.CardsPanel {...SAMPLE_PANELS.cards} tool="cards" />
          <slots.CardsPanel {...SAMPLE_PANELS.cards} tool="cards" anki={{ status: "ready", value: { running: false } }} />
        </section>

        <section>
          <h2>CalendarPanel</h2>
          <slots.CalendarPanel {...SAMPLE_PANELS.calendar} tool="calendar" />
        </section>

        <section>
          <h2>SkillsPanel（含待审核）</h2>
          <slots.SkillsPanel {...SAMPLE_PANELS.skills} tool="skills" />
        </section>

        <section>
          <h2>BoardPanel / NotesPanel</h2>
          <slots.BoardPanel empty />
          <slots.NotesPanel empty />
        </section>
      </main>
    </slots.Shell>
  );
}
