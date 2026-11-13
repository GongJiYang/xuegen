/**
 * The `/`-command dispatcher's effectful half.
 *
 * `commandEffect` (pure, tested in `run-command.test.ts`) resolves the picked
 * command to an effect; this hook routes that effect to the right action —
 * the wiring that used to sit inline in `App`.
 */

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ToolId } from "../../skins/contract.js";
import type { useChat } from "../chat/useChat.js";
import type { useControlSession } from "../board/use-control-session.js";
import type { SessionStyle } from "../chat/use-session-style.js";
import type { SlashCommand } from "./commands.js";
import { commandEffect, type ToolFocus } from "./run-command.js";
import type { useSlash } from "./use-slash.js";

export interface RunCommandInput {
  slash: ReturnType<typeof useSlash>;
  selectStyle: SessionStyle["select"];
  /** `setActiveTool`: open the named tool window. */
  setActiveTool: Dispatch<SetStateAction<ToolId | null>>;
  /** `setPendingFocus`: a tool field to focus once its window opens (`/加入阅读`). */
  setPendingFocus: Dispatch<SetStateAction<ToolFocus | null>>;
  /** 继续学习: resume the most recent course. */
  resume(): void;
  /** 新会话: start a fresh free-chat session. */
  newSession(): void;
  /** 会话列表: open the session browser. */
  openSessions(): void;
  controller: ReturnType<typeof useChat>;
  control: ReturnType<typeof useControlSession>;
}

export function useRunCommand(input: RunCommandInput): (command: SlashCommand) => void {
  const {
    slash,
    selectStyle,
    setActiveTool,
    setPendingFocus,
    resume,
    newSession,
    openSessions,
    controller,
    control,
  } = input;
  return useCallback(
    (command: SlashCommand) => {
      slash.update("");
      slash.close();
      const effect = commandEffect(command.command);
      switch (effect.kind) {
        case "style":
          return selectStyle(effect.style);
        case "tool": {
          setActiveTool(effect.tool);
          // A command that names a field (e.g. /加入阅读) focuses it once the
          // window is open, so the user can type immediately.
          if (effect.focus) setPendingFocus(effect.focus);
          return;
        }
        case "resume":
          return resume();
        case "new-session":
          return newSession();
        case "sessions":
          return openSessions();
        case "control":
          return control.openControl();
        case "prompt":
          // A `/` command's own text is the whole instruction: send it without the
          // session style prefix (B9).
          return controller.sendCommand(effect.text);
        case "insert":
          // The composer inserts a `/skill:` command into its own field.
          return;
        default:
          return;
      }
    },
    [slash, selectStyle, setActiveTool, setPendingFocus, resume, newSession, openSessions, controller, control],
  );
}
