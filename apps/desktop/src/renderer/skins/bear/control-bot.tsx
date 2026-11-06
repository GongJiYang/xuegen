/**
 * The small grokbot avatar Bear draws: in the 总控 title (22px) and on the line
 * that says what 学根 is doing (24px). Ink body, paper eyes, so it never competes
 * with the one accent colour. Decorative: the text beside it says the same thing.
 *
 * The engine needs a 2D canvas; where there is none (jsdom in tests) the avatar
 * keeps its space but draws nothing.
 */

import type { BotMood } from "../../core/board/bot-state.js";
import type { ActivityMood } from "../../core/chat/activity.js";
import { GrokBotView } from "./vendor/grokbot-web/grokbot-web.js";

const INK = { bodyColor: "#1f2124", eyeColor: "#fbfbfa", badgeColor: "#1f2124", particleColor: "#1aa3ff" };

/** True where a 2D canvas exists (Electron), false in jsdom. */
function canDraw(): boolean {
  return typeof CanvasRenderingContext2D !== "undefined";
}

export function MiniBot({ mood, size }: { mood: BotMood | ActivityMood; size: number }) {
  return (
    <span className="bear-bot" aria-hidden="true" style={{ width: size, height: size }}>
      {canDraw() && <GrokBotView state={mood} shape="blob" size={size} autoExpression theme={INK} />}
    </span>
  );
}

export function ControlBot({ mood }: { mood: BotMood }) {
  return <MiniBot mood={mood} size={22} />;
}
