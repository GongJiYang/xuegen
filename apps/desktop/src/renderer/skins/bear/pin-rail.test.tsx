import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { PinRail } from "./pin-rail.js";
import { strings } from "../../core/strings.js";
import type { PinBoard } from "../../core/chat/pin-board.js";

afterEach(cleanup);

const PIN: PinBoard = {
  defs: {
    title: "今日要点 · 离散 D1",
    items: [{ term: "量词顺序", body: "写在前面的先定。" }],
    messageId: "a1",
  },
  questions: { items: ["第一题", "第二题"], messageId: "a2" },
};

describe("Bear pin rail", () => {
  it("folds into a chip when there is no margin, and opens the pinned content", async () => {
    render(
      <div data-skin="bear" className="bear-col">
        <div className="bear-thread-wrap">
          <PinRail pin={PIN} pane={createRef()} />
        </div>
      </div>,
    );
    const chip = screen.getByRole("button", { name: strings.chat.pinChip(1, 2) });
    await userEvent.click(chip);
    expect(screen.getByText("今日要点 · 离散 D1")).toBeTruthy();
    expect(screen.getByText("量词顺序")).toBeTruthy();
    expect(screen.getByText("第二题")).toBeTruthy();
    expect(screen.getByRole("button", { name: strings.chat.pinJumpQuestions })).toBeTruthy();
  });
});
