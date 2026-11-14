/**
 * Session-tab shortcuts (tabs.html): ⌃Tab / ⌃⇧Tab step to the next / previous
 * tab, wrapping around; ⌘0 (Ctrl+0 off macOS) jumps to 「总控」. While the tabs
 * show, ⌘0 is no longer the body-scale reset: the listener runs in the capture
 * phase and marks the event handled, which the body-scale shortcut skips.
 */

import { useEffect } from "react";
import type { SessionTabsView } from "../contract.js";
import { neighbourTab } from "../../core/board/session-tabs.js";

export function useTabShortcuts(tabs: SessionTabsView | null): void {
  useEffect(() => {
    if (tabs === null) return;
    const items = tabs.items;
    const onPick = tabs.onPick;
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key === "0") {
        event.preventDefault();
        const control = items[0];
        if (control !== undefined && !control.active) onPick(control.key);
        return;
      }
      if (!event.ctrlKey || event.metaKey || event.key !== "Tab") return;
      event.preventDefault();
      const target = neighbourTab(items, event.shiftKey ? -1 : 1);
      if (target !== null && !target.active) onPick(target.key);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [tabs]);
}
