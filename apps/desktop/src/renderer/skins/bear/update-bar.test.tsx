/**
 * Bear update bar behaviour (design `?d=update`): the offer line with its
 * notes toggle and actions, the download progress, the restart button, and
 * the states that render nothing.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpdateBar } from "./update-bar.js";
import type { UpdateBarProps } from "../contract.js";
import { strings } from "../../core/strings.js";

afterEach(cleanup);

function baseProps(overrides: Partial<UpdateBarProps> = {}): UpdateBarProps {
  return {
    status: { kind: "idle", current: "0.2.0" },
    dismissed: false,
    onDownload: vi.fn(),
    onInstall: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
}

describe("Bear update bar", () => {
  it("offers the update, toggles the notes, and wires the actions", async () => {
    const onDownload = vi.fn();
    const onDismiss = vi.fn();
    render(
      <UpdateBar
        {...baseProps({
          status: {
            kind: "available",
            current: "0.2.0",
            version: "0.3.0",
            notes: ["总进度第四版", "对话左侧钉板"],
          },
          onDownload,
          onDismiss,
        })}
      />,
    );

    expect(screen.getByText(strings.update.available("0.3.0", 2))).toBeTruthy();
    expect(screen.queryByText("总进度第四版")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: strings.update.showNotes }));
    expect(screen.getByText("总进度第四版")).toBeTruthy();
    expect(screen.getByText("对话左侧钉板")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: strings.update.hideNotes }));
    expect(screen.queryByText("总进度第四版")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: strings.update.install }));
    expect(onDownload).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: strings.update.later }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows the download percent", () => {
    render(
      <UpdateBar
        {...baseProps({
          status: { kind: "downloading", current: "0.2.0", version: "0.3.0", percent: 42 },
        })}
      />,
    );
    expect(screen.getByText(strings.update.downloading("0.3.0"))).toBeTruthy();
    expect(screen.getByText("42%")).toBeTruthy();
  });

  it("restarts on 「立即重启」 once ready", async () => {
    const onInstall = vi.fn();
    render(
      <UpdateBar
        {...baseProps({
          status: { kind: "ready", current: "0.2.0", version: "0.3.0" },
          onInstall,
        })}
      />,
    );
    expect(screen.getByText(strings.update.ready("0.3.0"))).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: strings.update.restart }));
    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  it("renders nothing while idle or after 「稍后」", () => {
    const { container, rerender } = render(<UpdateBar {...baseProps()} />);
    expect(container.innerHTML).toBe("");

    rerender(
      <UpdateBar
        {...baseProps({
          status: { kind: "available", current: "0.2.0", version: "0.3.0", notes: [] },
          dismissed: true,
        })}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
