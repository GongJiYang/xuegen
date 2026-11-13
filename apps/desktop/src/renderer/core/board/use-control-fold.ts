/**
 * The 总控 fold state: the transcript stays folded to today until the learner
 * opens the 「更早的对话」 row. Outside the 总控 session nothing folds.
 */

import { useCallback, useMemo, useState } from "react";
import type { ChatMessage } from "@shared/protocol.js";
import type { ThreadNote } from "../../skins/contract.js";
import { foldEarlier, type ControlFold } from "./control-fold.js";
import { dateKey } from "./use-calendar.js";
import { todayKey } from "../today.js";

export function useControlFold(
  isControl: boolean,
  messages: ChatMessage[],
  systemNotes: ThreadNote[],
): ControlFold & { open: boolean; toggle(): void } {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  const fold = useMemo(
    () =>
      isControl
        ? foldEarlier({
            messages,
            systemNotes,
            today: todayKey(),
            localDay: (iso) => dateKey(new Date(iso)),
            open,
          })
        : { messages, systemNotes, older: null },
    [isControl, messages, systemNotes, open],
  );
  return { ...fold, open: isControl && open, toggle };
}
