/**
 * The planbook's chat column: open on wide windows, collapsed on narrow ones.
 *
 * The initial state reads the 900px breakpoint once. A later crossing follows
 * the width *only while the user has not toggled the column* — a manual 「收起
 * 聊天」/「和总控聊」 wins over the window size from then on (the design's
 * narrow default is a starting point, not a lock).
 */

import { useEffect, useRef, useState } from "react";

const NARROW_QUERY = "(max-width: 900px)";

export function useChatColumn(): { open: boolean; toggle(): void } {
  const [open, setOpen] = useState(() => !window.matchMedia(NARROW_QUERY).matches);
  const manual = useRef(false);
  useEffect(() => {
    const media = window.matchMedia(NARROW_QUERY);
    const onChange = (event: MediaQueryListEvent): void => {
      if (!manual.current) setOpen(!event.matches);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return {
    open,
    toggle: () => {
      manual.current = true;
      setOpen((value) => !value);
    },
  };
}
