/**
 * Skin-agnostic glue that renders a message through a skin's slots.
 *
 * A skin's `Thread` receives a `renderMessage` callback; this module implements
 * it. It is the only place that knows how a `ChatMessage` maps onto the
 * UserMessage/AssistantMessage/ToolActivity slots, so every skin gets the same
 * wiring and only changes the markup. Content is classified once here via the
 * core pipeline and handed to the skin's content renderers.
 */

import { strings } from "../strings.js";
import { useMemo, useState, type ReactNode } from "react";
import type { ChatMessage, ToolCallView } from "@shared/protocol.js";
import { parseContent } from "../content/parse-content.js";
import { activityOf } from "./activity.js";
import { actionLabel, legacyCommandLabel, splitActionMarker } from "./action-marker.js";
import { splitStyleTag } from "./style-prefix.js";
import type { ContentNode } from "../content/nodes.js";
import type { ContentRenderers, SkinSlots } from "../../skins/contract.js";

interface MessageRendererProps {
  slots: SkinSlots;
  content: ContentRenderers;
  message: ChatMessage;
  thinking: boolean;
  /** Resend the last user message; shown on the answer's 重试 button. */
  onRetry: () => void;
  /** Focus the composer and mark question `index` as being answered (B10). */
  onExerciseAnswer(index: number): void;
  /** Ask 学根 for a hint on question `index`. */
  onExerciseHint(index: number): void;
  /** Skip question `index`. */
  onExerciseSkip(index: number): void;
}

/** Render one message using the active skin's slots. */
export function MessageRenderer({
  slots,
  content,
  message,
  thinking,
  onRetry,
  onExerciseAnswer,
  onExerciseHint,
  onExerciseSkip,
}: MessageRendererProps): ReactNode {
  const nodes = useMemo(() => parseContent(message.markdown), [message.markdown]);
  const [copied, setCopied] = useState(false);

  const onCopy = (): void => {
    void copyMarkdown(message.markdown, () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  const renderContent = (node: ContentNode, streaming: boolean): ReactNode => (
    <content.Node node={node} streaming={streaming} />
  );

  const renderToolCall = (call: ToolCallView): ReactNode => <slots.ToolActivity call={call} />;

  // A `question` callout is a first-class Exercise, not generic content: route it
  // to the Exercise slot so a skin can present it as a graded prompt. Questions
  // are numbered within the message (1-based) so the banner and the hint/skip
  // prompts name the same one. The numbers are precomputed (not counted during
  // render) so the render callback stays pure.
  const questionIndexes = useMemo(() => {
    const indexes = new Map<ContentNode, number>();
    let next = 0;
    for (const node of nodes) {
      if (node.kind === "callout" && node.calloutType === "question") {
        next += 1;
        indexes.set(node, next);
      }
    }
    return indexes;
  }, [nodes]);

  const renderNode = (node: ContentNode, streaming: boolean): ReactNode => {
    if (node.kind === "callout" && node.calloutType === "question") {
      const index = questionIndexes.get(node) ?? 1;
      return (
        <slots.Exercise
          title={node.title}
          body={node.body}
          nodes={parseContent(node.body)}
          renderContent={(inner) => <content.Node node={inner} />}
          index={index}
          onAnswer={() => onExerciseAnswer(index)}
          onHint={() => onExerciseHint(index)}
          onSkip={() => onExerciseSkip(index)}
        />
      );
    }
    return renderContent(node, streaming);
  };

  if (message.role === "user") {
    const { body: styled, styleTag } = splitStyleTag(message.markdown);
    // The 「先重读课程页 / 先重读技能」 note is an instruction to 学根, not something the user wrote.
    const note = [strings.chat.refreshNote, strings.chat.controlRefreshNote].find((candidate) =>
      styled.startsWith(candidate),
    );
    const marked = splitActionMarker(note ? styled.slice(note.length).trimStart() : styled);
    const label = marked.action ? actionLabel(marked.action, marked.courseTitle) : legacyCommandLabel(marked.body);
    return <slots.UserMessage message={message} body={marked.body} styleTag={styleTag} actionLabel={label} />;
  }

  return (
    <slots.AssistantMessage
      message={message}
      thinking={thinking}
      activity={activityOf(message, thinking)}
      onCopy={onCopy}
      copied={copied}
      onRetry={onRetry}
      nodes={nodes}
      streaming={message.streaming}
      renderContent={renderNode}
      renderToolCall={renderToolCall}
    />
  );
}

/** Copy text to the clipboard, tolerating a denied permission or a missing API. */
function copyMarkdown(markdown: string, onDone: () => void): Promise<void> {
  if (!navigator.clipboard) return Promise.resolve();
  return navigator.clipboard
    .writeText(markdown)
    .then(onDone)
    .catch(() => {
      // Clipboard access can be denied; leave the button usable for a retry.
    });
}
