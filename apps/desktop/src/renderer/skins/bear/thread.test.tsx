/**
 * Bear Thread empty state.
 *
 * A 总控 session folds today's messages away, so the transcript can be empty
 * under the 今日卡 (the `header` slot). The generic 「开始学习…」 line is for a
 * course/free session; the 总控 case points at the card and the composer.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { Thread } from "./slots.js";
import { SAMPLE_CONTROL_CARD } from "../../gallery/panel-samples.js";
import { strings } from "../../core/strings.js";

afterEach(cleanup);

function renderThread(header: ReactNode | null, noModels = false): void {
  const headerNode = header === null ? null : <section aria-label="今日卡">{header}</section>;
  render(
    <Thread
      header={headerNode}
      messages={[]}
      thinking={false}
      noModels={noModels}
      modelsReason={noModels ? strings.chat.loginHint : null}
      intro={null}
      systemNotes={[]}
      activity={null}
      pin={null}
      renderMessage={() => null}
    />,
  );
}

describe("Bear Thread 空列表", () => {
  it("有今日卡时提示今天还没跟总控说话", () => {
    renderThread(<p>{SAMPLE_CONTROL_CARD.headline}</p>);
    expect(screen.getByText(strings.control.emptyToday)).toBeTruthy();
    expect(screen.queryByText(strings.chat.empty)).toBeNull();
  });

  it("没有今日卡时仍用通用空态文案", () => {
    renderThread(null);
    expect(screen.getByText(strings.chat.empty)).toBeTruthy();
    expect(screen.queryByText(strings.control.emptyToday)).toBeNull();
  });

  it("没有可用模型且没有今日卡时先提示登录", () => {
    renderThread(null, true);
    expect(screen.getByText(strings.chat.loginHint)).toBeTruthy();
  });
});
