/**
 * Bear session tabs: the title bar's 「总控 · C1」「离散 D4」… strip plus 「＋」.
 *
 * The open tab is underlined in the accent; the one 学根 is answering in carries
 * a small blue dot. 「＋」 is the old session list (today / yesterday / …,
 * ＋新会话). When the strip runs out of room the tabs that do not fit fold into
 * 「＋」 (总控 and the open tab always stay), listed above the session list.
 */

import { useLayoutEffect, useRef, useState } from "react";
import type { SessionsView, SessionTabsView, SessionTabView } from "../contract.js";
import { fitTabs } from "../../core/board/session-tabs.js";
import { strings } from "../../core/strings.js";
import { SessionsButton } from "./sessions-popover.js";

function TabFace({ tab }: { tab: SessionTabView }) {
  return (
    <>
      <span className="bear-stab-name">{tab.label}</span>
      {tab.busy && <span className="bear-stab-dot" aria-label={strings.sessions.tabBusy} />}
    </>
  );
}

/** Keys of the tabs that fold into 「＋」, re-fitted when the bar resizes or the tabs change. */
function useFoldedTabs(tabs: SessionTabsView) {
  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [folded, setFolded] = useState<string[]>([]);
  const signature = tabs.items.map((tab) => `${tab.key}\u0000${tab.label}\u0000${tab.busy}\u0000${tab.active}`).join("\u0001");

  useLayoutEffect(() => {
    const nav = navRef.current;
    const measure = measureRef.current;
    if (nav === null || measure === null) return;
    const fit = (): void => {
      const widths = Array.from(measure.children, (child) => (child as HTMLElement).offsetWidth);
      const more = nav.querySelector<HTMLElement>(".bear-stab-more")?.offsetWidth ?? 0;
      const next = fitTabs(tabs.items, widths, nav.clientWidth, more);
      setFolded((prev) => (prev.join("\u0001") === next.join("\u0001") ? prev : next));
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(nav);
    return () => observer.disconnect();
    // `signature` stands for `tabs.items`, which is a fresh array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return { navRef, measureRef, folded };
}

export function SessionTabs({ tabs, sessions }: { tabs: SessionTabsView; sessions: SessionsView }) {
  const { navRef, measureRef, folded } = useFoldedTabs(tabs);
  const overflow = tabs.items.filter((tab) => folded.includes(tab.key));
  return (
    <nav ref={navRef} className="bear-tabsbar" aria-label={strings.sessions.tabsLabel}>
      {tabs.items.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`bear-stab${tab.active ? " is-on" : ""}`}
          aria-current={tab.active ? "page" : undefined}
          title={tab.label}
          hidden={folded.includes(tab.key)}
          onClick={() => tabs.onPick(tab.key)}
        >
          <TabFace tab={tab} />
        </button>
      ))}
      <SessionsButton
        sessions={sessions}
        control={null}
        title={null}
        plus
        overflow={overflow.length > 0 ? { items: overflow, onPick: tabs.onPick } : null}
      />
      {/* Every tab at its natural width, off-screen, so folded ones can be measured too. */}
      <span ref={measureRef} className="bear-tabsbar-measure" aria-hidden="true">
        {tabs.items.map((tab) => (
          <span key={tab.key} className={`bear-stab${tab.active ? " is-on" : ""}`}>
            <TabFace tab={tab} />
          </span>
        ))}
      </span>
    </nav>
  );
}
