/**
 * Skin contract test.
 *
 * For every registered skin: load it, render each slot with the fixed samples,
 * and assert that the load does not throw and that the critical interactive roles
 * are present (buttons, a text input, a select/combobox, an alert). A new slot or
 * a missing implementation fails here, which is what keeps `bare` in sync.
 */

import { contextUsageView } from "../core/chat/context-usage.js";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { SKINS } from "./registry.js";
import { MessageRenderer } from "../core/chat/message-renderer.js";
import { strings } from "../core/strings.js";
import { toolDescriptors } from "./chicago/icons.js";
import type { ContentNode } from "../core/content/nodes.js";
import type { SkinModule } from "./contract.js";
import { SAMPLE_PANELS } from "../gallery/panel-samples.js";
import {
  SAMPLE_ASSISTANT_MESSAGE,
  SAMPLE_COURSE_INTRO,
  SAMPLE_ERROR_MESSAGE,
  SAMPLE_MODELS,
  SAMPLE_STREAMING_MESSAGE,
  SAMPLE_TOOL_ERROR,
  SAMPLE_TOOL_RUNNING,
  SAMPLE_TOOL_SUCCESS,
  SAMPLE_USER_MESSAGE,
} from "../gallery/samples.js";

/** The render strategy for the Thread slot, using the real core glue. */
function renderMessage(skin: SkinModule, message: typeof SAMPLE_USER_MESSAGE, thinking = false): ReactNode {
  return (
    <MessageRenderer
      slots={skin.slots}
      content={skin.content}
      message={message}
      thinking={thinking}
      onRetry={noop}
      onExerciseAnswer={noop}
      onExerciseHint={noop}
      onExerciseSkip={noop}
    />
  );
}

const noop = (): void => undefined;
const skinChoices = SKINS.map((entry) => ({ id: entry.id, name: entry.name }));

describe.each(SKINS)("skin contract: $id", (definition) => {
  it("loads without throwing", async () => {
    const skin = await definition.load();
    expect(skin.slots).toBeTruthy();
    expect(skin.motion).toBeTruthy();
    expect(skin.content.Node).toBeTruthy();
    expect(definition.id).toBe(definition.id.toLowerCase());
    expect(definition.version.length).toBeGreaterThan(0);
  });

  it("renders every slot with the mandatory roles present", async () => {
    const skin = await definition.load();
    const {
      Shell,
      Thread,
      Exercise,
      Composer,
      ModelPicker,
      Notice,
      BoardPanel,
      NotesPanel,
      TodayPanel,
      ProgressPanel,
      ReadingPanel,
      CardsPanel,
      CalendarPanel,
      SkillsPanel,
      DayEditor,
      SlashMenu,
      CourseIntroCard,
    } = skin.slots;

    render(
      <Shell
        sessionTitle={null}
        control={null}
        contextUsage={contextUsageView(null, false, () => {})}
        skins={skinChoices}
        activeSkin={definition.id}
        onSelectSkin={noop}
        bodyFont="pixel"
        onBodyFont={noop}
        bodyScale={1}
        onBodyScale={noop}
        skinOptions={{}}
        onSkinOption={noop}
        onWindowBackground={noop}
        models={SAMPLE_MODELS}
        currentModel={SAMPLE_MODELS[0] ?? null}
        onSelectModel={noop}
        thinkingLevel="medium"
        thinkingLevels={["low", "medium", "high"]}
        onSelectThinking={noop}
        onNewSession={noop}
        onContinueSession={noop}
        agentStatus="ready"
        notices={[{ tone: "info", text: strings.chat.empty }]}
        onDismissNotice={noop}
        tools={toolDescriptors()}
        activeTool="progress"
        onOpenTool={noop}
        focusMode={false}
        onToggleFocus={noop}
        style="plain"
        onSelectStyle={noop}
        styleCourse={null}
        onPrompt={noop}
        panels={SAMPLE_PANELS}
      >
        <Thread
          messages={[SAMPLE_USER_MESSAGE, SAMPLE_ASSISTANT_MESSAGE]}
          thinking={false}
          noModels={false}
          modelsReason={null}
          intro={{ card: SAMPLE_COURSE_INTRO, beforeIndex: 1 }}
          systemNotes={[{ beforeIndex: 1, text: "note" }]}
          activity={null}
          renderMessage={(message, thinking) => renderMessage(skin, message, thinking)}
        />
        <Thread
          messages={[]}
          thinking={false}
          noModels
          modelsReason={strings.chat.loginHint}
          intro={null}
          systemNotes={[]}
          activity={null}
          renderMessage={() => null}
        />
        <CourseIntroCard card={SAMPLE_COURSE_INTRO} />
        <Exercise
          title="检验题"
          body="当 a>0 时开口朝上？"
          nodes={[{ kind: "markdown", markdown: "当 a>0 时开口朝上？" }]}
          renderContent={(node) => <skin.content.Node node={node} />}
          index={1}
          onAnswer={noop}
          onHint={noop}
          onSkip={noop}
        />
        <Composer
          streaming={false}
          disabled={false}
          onSend={noop}
          onStop={noop}
          style="plain"
          onStyle={noop}
          commandsOpen={false}
          commandGroups={[]}
          commands={[]}
          selectedCommand={0}
          onSelectCommand={noop}
          onRunCommand={noop}
          onCloseCommands={noop}
          onInput={noop}
          answering={null}
          focusRequest={0}
        />
        <ModelPicker models={SAMPLE_MODELS} current={SAMPLE_MODELS[0] ?? null} onSelect={noop} disabled={false} />
        <Notice notice={{ tone: "error", text: strings.notice.agentCrashed }} onDismiss={noop} />
        <BoardPanel empty />
        <NotesPanel empty />
        <TodayPanel {...SAMPLE_PANELS.today} />
        <ProgressPanel {...SAMPLE_PANELS.progress} tool="progress" />
        <ReadingPanel {...SAMPLE_PANELS.reading} tool="reading" />
        <CardsPanel {...SAMPLE_PANELS.cards} tool="cards" />
        <CalendarPanel {...SAMPLE_PANELS.calendar} tool="calendar" />
        <SkillsPanel {...SAMPLE_PANELS.skills} tool="skills" />
        <DayEditor date="2026-11-05" title="11月5日 周四" initialText="" savePath="2026-11-05" onSave={noop} onCancel={noop} />
        <SlashMenu groups={[]} commands={[]} selected={0} onSelect={noop} onRun={noop} />
      </Shell>,
    );

    // Interactive roles every skin must expose.
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it("renders each content kind without throwing", async () => {
    const skin = await definition.load();
    const Node = skin.content.Node;
    const nodes: ContentNode[] = [
      { kind: "markdown", markdown: "text" },
      { kind: "code", language: "typescript", code: "const x = 1;" },
      { kind: "math-block", latex: "E = mc^2" },
      { kind: "table", header: ["a", "b"], rows: [["1", "2"]] },
      { kind: "callout", calloutType: "note", title: "提示", body: "内容" },
      { kind: "mermaid", code: "graph TD\n  A-->B" },
      { kind: "diagram", code: "┌──┐\n│ab│\n└──┘" },
    ];

    for (const node of nodes) {
      expect(() => render(<Node node={node} />)).not.toThrow();
      document.body.innerHTML = "";
    }
  });

  it("renders tool activity in every status and an errored message", async () => {
    const skin = await definition.load();
    const { ToolActivity } = skin.slots;
    for (const call of [SAMPLE_TOOL_RUNNING, SAMPLE_TOOL_SUCCESS, SAMPLE_TOOL_ERROR]) {
      expect(() => render(<ToolActivity call={call} />)).not.toThrow();
      document.body.innerHTML = "";
    }
    expect(() => render(renderMessage(skin, SAMPLE_ERROR_MESSAGE))).not.toThrow();
    document.body.innerHTML = "";
  });

  it("renders a streaming assistant message", async () => {
    const skin = await definition.load();
    expect(() => render(renderMessage(skin, SAMPLE_STREAMING_MESSAGE, true))).not.toThrow();
    document.body.innerHTML = "";
  });
});
