/**
 * Keep a transcript pane pinned to its bottom.
 *
 * A terminal-style transcript should follow the newest content: streaming text,
 * a tool row expanding, a new message. But it must not fight the reader — once
 * the user scrolls up to re-read, following stops until they return to the
 * bottom (by hand or via a "回到最新" button the skin renders when
 * {@link FollowBottom.atBottom} is false).
 *
 * The scroll offset is the only source of intent: within {@link NEAR_BOTTOM_PX}
 * of the bottom the pane is "following", above it the user has taken over. This
 * hook owns that state machine and does the DOM work; the skin only lays out the
 * button. The companion `useScrollMemory` remembers the offset across skin
 * switches, so a paused reader keeps their place when the skin changes.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** How close to the bottom still counts as "following". */
export const NEAR_BOTTOM_PX = 48;

export interface FollowBottom {
  /** True when the pane is pinned to the bottom (or has no overflow to follow). */
  atBottom: boolean;
  /** Jump to the bottom and resume following. */
  scrollToBottom(): void;
}

/**
 * Follow a scroll container's bottom as its content grows.
 *
 * @param paneRef The scrollable transcript container (the same one passed to
 *   `useScrollMemory`).
 */
export function useFollowBottom(paneRef: RefObject<HTMLElement | null>): FollowBottom {
  const [atBottom, setAtBottom] = useState(true);
  // Mirror the state in a ref so the observers read the latest value without
  // being re-created (which would drop them mid-stream).
  const atBottomRef = useRef(true);

  const setFollowing = useCallback((value: boolean) => {
    atBottomRef.current = value;
    setAtBottom(value);
  }, []);

  const distanceFromBottom = (element: HTMLElement): number =>
    element.scrollHeight - element.scrollTop - element.clientHeight;

  const scrollToBottom = useCallback(() => {
    const element = paneRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    setFollowing(true);
  }, [paneRef, setFollowing]);

  useEffect(() => {
    const element = paneRef.current;
    if (!element) return;

    // A programmatic or user scroll both land here: decide "following" from the
    // resulting offset. Content growth below the fold keeps the offset, so it
    // reads as "moved up" only when the user actually left the bottom.
    const onScroll = (): void => {
      setFollowing(distanceFromBottom(element) <= NEAR_BOTTOM_PX);
    };

    // Content growth (streaming deltas, a tool row expanding) changes
    // `scrollHeight`; while following, chase it down. Resize/mutation on the
    // scroll container's subtree cover both cases.
    const follow = (): void => {
      if (!atBottomRef.current) return;
      element.scrollTop = element.scrollHeight;
    };
    const resizeObserver = new ResizeObserver(follow);
    const mutationObserver = new MutationObserver(follow);
    const content = element.firstElementChild;
    if (content) {
      resizeObserver.observe(content);
    }
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
  }, [paneRef, setFollowing]);

  return { atBottom, scrollToBottom };
}
