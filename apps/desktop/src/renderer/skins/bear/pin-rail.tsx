/**
 * Bear pin rail (design `?d=pin`): the lesson's 今日要点 and the latest round of
 * questions, pinned in the blank margin left of the column. When the margin is
 * too narrow (drawer open, small window) it folds into a chip that opens the
 * same content as a popover. Jump links scroll the transcript back to the
 * source message.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { PinBoard } from "../../core/chat/pin-board.js";
import { strings } from "../../core/strings.js";
import { markdownToHast } from "../../core/content/markdown-to-hast.js";
import { hastToReact } from "../../core/content/hast-react.js";

/** Inline Markdown with KaTeX, through the same pipeline as the transcript. */
function Inline({ text }: { text: string }) {
  const tree = useMemo(() => markdownToHast(text), [text]);
  return <span className="bear-pin-md">{hastToReact(tree)}</span>;
}

/** Rail width plus a gap, in px: the left margin must be at least this wide. */
const NEEDED = 300;

function jumpTo(pane: RefObject<HTMLElement | null>, messageId: string): void {
  const target = pane.current?.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
  target?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function Sections({
  pin,
  pane,
  onJump,
}: {
  pin: PinBoard;
  pane: RefObject<HTMLElement | null>;
  onJump?: () => void;
}) {
  const [openDefs, setOpenDefs] = useState(true);
  const [openQuestions, setOpenQuestions] = useState(true);
  const defs = pin.defs;
  const questions = pin.questions;
  const jump = (id: string): void => {
    jumpTo(pane, id);
    onJump?.();
  };
  return (
    <>
      {defs && (
        <section className="bear-pin-section">
          <button
            type="button"
            className="bear-pin-head"
            aria-expanded={openDefs}
            onClick={() => setOpenDefs((v) => !v)}
          >
            <span>{defs.title || strings.chat.pinDefs}</span>
            <span className="bear-pin-toggle">{openDefs ? "▾" : "▸"}</span>
          </button>
          {openDefs && (
            <>
              <ol className="bear-pin-defs">
                {defs.items.map((item, index) => (
                  <li key={index}>
                    {item.term && <b>{item.term}</b>}
                    <span>
                      <Inline text={item.body} />
                    </span>
                  </li>
                ))}
              </ol>
              <button type="button" className="bear-pin-jump" onClick={() => jump(defs.messageId)}>
                {strings.chat.pinJumpDefs}
              </button>
            </>
          )}
        </section>
      )}
      {questions && (
        <section className="bear-pin-section">
          <button
            type="button"
            className="bear-pin-head"
            aria-expanded={openQuestions}
            onClick={() => setOpenQuestions((v) => !v)}
          >
            <span>{strings.chat.pinQuestions}</span>
            <span className="bear-pin-toggle">{openQuestions ? "▾" : "▸"}</span>
          </button>
          {openQuestions && (
            <>
              <ol className="bear-pin-qs">
                {questions.items.map((text, index) => (
                  <li key={index}>
                    <span className="bear-pin-n">{index + 1}</span>
                    <span>
                      <Inline text={text} />
                    </span>
                  </li>
                ))}
              </ol>
              <button type="button" className="bear-pin-jump" onClick={() => jump(questions.messageId)}>
                {strings.chat.pinJumpQuestions}
              </button>
            </>
          )}
        </section>
      )}
    </>
  );
}

/** Whether the margin left of `anchor` (inside its `.bear-col`) fits the rail; follows window and drawer changes. */
function useWideMargin(anchor: RefObject<HTMLElement | null>): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const element = anchor.current;
    const column = element?.closest(".bear-col");
    if (!element || !column) return;
    const measure = (): void => {
      const left = element.getBoundingClientRect().left - column.getBoundingClientRect().left;
      setWide(left >= NEEDED);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      measure();
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    return () => observer.disconnect();
  }, [anchor]);
  return wide;
}

export function PinRail({ pin, pane }: { pin: PinBoard; pane: RefObject<HTMLElement | null> }) {
  const anchor = useRef<HTMLDivElement | null>(null);
  const wide = useWideMargin(anchor);
  const [open, setOpen] = useState(false);
  const chip = strings.chat.pinChip(pin.defs?.items.length ?? 0, pin.questions?.items.length ?? 0);
  return (
    <div ref={anchor} className="bear-pin-anchor">
      {wide ? (
        <aside className="bear-pin-rail" aria-label={strings.chat.pinDefs}>
          <Sections pin={pin} pane={pane} />
        </aside>
      ) : (
        <div className="bear-pin-chipwrap">
          <button
            type="button"
            className="bear-pin-chip"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {chip}
          </button>
          {open && (
            <div className="bear-pin-pop">
              <Sections pin={pin} pane={pane} onJump={() => setOpen(false)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
