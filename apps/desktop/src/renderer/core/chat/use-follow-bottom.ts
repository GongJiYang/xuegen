/**
 * Keep a transcript pane anchored to a new answer without chasing it forever.
 *
 * A terminal-style transcript should show the newest answer, but a growing
 * answer makes "follow the bottom" fight the reader: the moment the first lines
 * arrive the rest is already below the fold. Instead, when a new assistant block
 * starts streaming, the pane scrolls that block's start to the top of the
 * viewport once and then stops; the user reads from the beginning and scrolls
 * down at their own pace. Growth still follows normally when no answer is
 * pinned (history loads, tool rows, a resumed reading position).
 *
 * The scroll offset is the only source of intent: within {@link NEAR_BOTTOM_PX}
 * of the bottom the pane is "following", above it the user has taken over. This
 * hook owns that state machine and does the DOM work; the skin only lays out the
 * button. The companion `useScrollMemory` remembers the offset across skin
 * switches, so a paused reader keeps their place when the skin changes.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";

/** How close to the bottom still counts as "following". */
export const NEAR_BOTTOM_PX = 48;

/** The start of the newest answer: a stable key plus the element to pin. */
export interface AnswerStart {
  /** Changes whenever a new assistant block begins. */
  key: string;
  /** The element that marks the answer's beginning. */
  elementRef: RefObject<HTMLElement | null>;
}

export interface FollowBottomOptions {
  /** The newest answer, or null when the last message is not an answer. */
  answer?: AnswerStart | null;
  /** True while that answer is streaming; false clears the pin. */
  answerStreaming?: boolean;
}

export interface FollowBottom {
  /** True when the pane is pinned to the bottom (or has no overflow to follow). */
  atBottom: boolean;
  /** Jump to the bottom, resume following, and clear any answer pin. */
  scrollToBottom(): void;
}

/** Distance between the current offset and the pane's bottom. */
function distanceFromBottom(element: HTMLElement): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

/**
 * Pin a newly started answer's opening line to the viewport top, once.
 *
 * Skipped when the reader has deliberately scrolled up: the pane must not yank
 * someone who is re-reading. The pin is cleared when the answer stops streaming.
 */
function usePinAnswer(
  paneRef: RefObject<HTMLElement | null>,
  answer: AnswerStart | null,
  answerStreaming: boolean,
  atBottomRef: MutableRefObject<boolean>,
  pinnedRef: MutableRefObject<boolean>,
  setFollowing: (value: boolean) => void,
): void {
  const key = answer?.key ?? null;
  const elementRef = answer?.elementRef ?? null;

  useEffect(() => {
    if (!key || !answerStreaming || !elementRef) {
      pinnedRef.current = false;
      return;
    }
    if (!atBottomRef.current) return;
    const pane = paneRef.current;
    const anchor = elementRef.current;
    if (!pane || !anchor) return;
    pinnedRef.current = true;
    const offset = anchor.getBoundingClientRect().top - pane.getBoundingClientRect().top;
    pane.scrollTop = Math.max(0, pane.scrollTop + offset);
    setFollowing(distanceFromBottom(pane) <= NEAR_BOTTOM_PX);
  }, [key, answerStreaming, elementRef, paneRef, atBottomRef, pinnedRef, setFollowing]);
}

/**
 * Chase content growth while the pane is following and no answer is pinned.
 *
 * Resize/mutation on the scroll container's subtree covers streaming deltas and
 * expanding tool rows. A programmatic or user scroll both decide "following"
 * from the resulting offset, so growth below the fold reads as "moved up" only
 * when the user actually left the bottom.
 */
function useFollowGrowth(
  paneRef: RefObject<HTMLElement | null>,
  atBottomRef: MutableRefObject<boolean>,
  pinnedRef: MutableRefObject<boolean>,
  setFollowing: (value: boolean) => void,
): void {
  useEffect(() => {
    const element = paneRef.current;
    if (!element) return;
    const onScroll = (): void => {
      setFollowing(distanceFromBottom(element) <= NEAR_BOTTOM_PX);
    };
    const follow = (): void => {
      if (pinnedRef.current || !atBottomRef.current) return;
      element.scrollTop = element.scrollHeight;
    };
    const resizeObserver = new ResizeObserver(follow);
    const mutationObserver = new MutationObserver(follow);
    const content = element.firstElementChild;
    if (content) resizeObserver.observe(content);
    mutationObserver.observe(element, { childList: true, subtree: true, characterData: true });

    element.addEventListener("scroll", onScroll, { passive: true });
    // Start from the current offset, so a restored reading position decides
    // whether following begins on or off.
    onScroll();
    return () => {
      element.removeEventListener("scroll", onScroll);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [paneRef, atBottomRef, pinnedRef, setFollowing]);
}

/**
 * Follow a scroll container's bottom as its content grows.
 *
 * @param paneRef The scrollable transcript container (the same one passed to
 *   `useScrollMemory`).
 * @param options The newest answer to anchor to, if any.
 */
export function useFollowBottom(
  paneRef: RefObject<HTMLElement | null>,
  options: FollowBottomOptions = {},
): FollowBottom {
  const [atBottom, setAtBottom] = useState(true);
  // Mirror the state in refs so the observers read the latest values without
  // being re-created (which would drop them mid-stream).
  const atBottomRef = useRef(true);
  const pinnedRef = useRef(false);

  const setFollowing = useCallback((value: boolean) => {
    atBottomRef.current = value;
    setAtBottom(value);
  }, []);

  const scrollToBottom = useCallback(() => {
    const element = paneRef.current;
    if (!element) return;
    pinnedRef.current = false;
    element.scrollTop = element.scrollHeight;
    setFollowing(true);
  }, [paneRef, setFollowing]);

  usePinAnswer(paneRef, options.answer ?? null, options.answerStreaming ?? false, atBottomRef, pinnedRef, setFollowing);
  useFollowGrowth(paneRef, atBottomRef, pinnedRef, setFollowing);

  return { atBottom, scrollToBottom };
}
