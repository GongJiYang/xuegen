/**
 * The answer-in-progress line, with elapsed time and step count.
 *
 * While `streaming` is true a one-second timer ticks the elapsed time; the pure
 * `withTurnMeta` decides what the meta reads (nothing before the first second,
 * 「太久了」 styling past three minutes). The timer lives here — the imperative
 * shell — so `activity.ts` stays pure.
 */

import { useEffect, useState } from "react";
import type { ChatMessage } from "@shared/protocol.js";
import { turnActivity, turnSteps, withTurnMeta, type Activity } from "./activity.js";

export function useTurnActivity(messages: ChatMessage[], streaming: boolean, thinking: boolean): Activity | null {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!streaming) return;
    const start = Date.now();
    const tick = (): void => setSeconds(Math.floor((Date.now() - start) / 1000));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [streaming]);
  return withTurnMeta(turnActivity(messages, streaming, thinking), turnSteps(messages), streaming ? seconds : 0);
}
