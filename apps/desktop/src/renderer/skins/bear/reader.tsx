/**
 * Bear 总控 wide reader: slides in from the right with one turn's answer or a
 * 术语 concept page. A term page gets 上一个 / 下一个 (also ← →) through the
 * other terms of the same course, so the user can go through them in one sitting.
 */

import type { KeyboardEvent, ReactNode } from "react";
import { Dialog as RadixDialog } from "radix-ui";
import type { ChatMessage } from "@shared/protocol.js";
import type { ControlFeedView } from "../contract.js";
import { strings } from "../../core/strings.js";

export function Reader({
  feed,
  renderMessage,
}: {
  feed: ControlFeedView;
  renderMessage(message: ChatMessage, thinking: boolean): ReactNode;
}) {
  const reader = feed.reader;
  const nav = feed.readerNav;
  const text = strings.feed;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (nav === null || event.metaKey || event.ctrlKey || event.altKey) return;
    const go = event.key === "ArrowLeft" ? nav.onPrev : event.key === "ArrowRight" ? nav.onNext : null;
    if (go === null) return;
    event.preventDefault();
    go();
  };
  return (
    <RadixDialog.Root open={reader !== null} onOpenChange={(next) => !next && feed.onCloseReader()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="bear-reader-overlay" />
        <RadixDialog.Content className="bear-reader" aria-describedby={undefined} onKeyDown={onKeyDown}>
          {reader !== null && (
            <>
              <div className="bear-reader-top">
                <div>
                  <p className="bear-reader-sub">{reader.sub}</p>
                  <RadixDialog.Title className="bear-reader-title">{reader.title}</RadixDialog.Title>
                </div>
                <span className="bear-reader-acts">
                  {reader.external !== null && (
                    <a className="bear-cp-link" href={reader.external} target="_blank" rel="noreferrer">
                      {text.openInObsidian}
                    </a>
                  )}
                  <RadixDialog.Close className="bear-cp-link">{text.readerClose}</RadixDialog.Close>
                </span>
              </div>
              <div
                className={`bear-reader-body${reader.path === null ? "" : " is-page"}`}
                key={reader.path ?? "answer"}
              >
                {reader.loading && <p className="bear-cp-meta">{text.readerLoading}</p>}
                {reader.error !== null && (
                  <p className="bear-cp-meta" role="alert">
                    {reader.error}
                  </p>
                )}
                {reader.messages.map((message) => (
                  <div key={message.id}>{renderMessage(message, false)}</div>
                ))}
              </div>
              {nav !== null && (
                <nav className="bear-reader-nav">
                  <button
                    type="button"
                    className="bear-cp-link"
                    disabled={nav.onPrev === null}
                    onClick={() => nav.onPrev?.()}
                  >
                    {text.readerPrev}
                  </button>
                  <span>
                    {nav.position}
                    <small>{text.readerNavHint}</small>
                  </span>
                  <button
                    type="button"
                    className="bear-cp-link"
                    disabled={nav.onNext === null}
                    onClick={() => nav.onNext?.()}
                  >
                    {text.readerNext}
                  </button>
                </nav>
              )}
            </>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
