/**
 * The Shell's session tabs: the pure `sessionTabs` list plus the switches.
 *
 * Every switch goes through `guardSwitch`, like the session list, so a running
 * answer still asks first. A course tab reopens that course's remembered file
 * with the course role; 「总控」 goes through `openControl`; the tab of a
 * transcript opened from 「＋」 is always the open one, so picking it does nothing.
 */

import { useCallback, useMemo } from "react";
import type { DesktopSettings } from "@shared/protocol.js";
import type { SessionTabsView } from "../../skins/contract.js";
import type { ChatController } from "../chat/useChat.js";
import { todayKey } from "../today.js";
import { sessionTabs } from "./session-tabs.js";
import type { ControlSession } from "./use-control-session.js";
import type { CycleResource } from "./use-cycle.js";
import type { SessionListController } from "./use-session-list.js";

export interface SessionTabsDeps {
  controller: ChatController;
  settings: DesktopSettings;
  control: ControlSession;
  cycle: CycleResource;
  cycleId: string | null;
  sessionList: SessionListController;
  /** Course slug → full title, for courses the cycle has no short name for. */
  courseTitles: Record<string, string>;
  currentTitle: string | null;
  setActiveCourse(slug: string | null): void;
}

export function useSessionTabs(deps: SessionTabsDeps): SessionTabsView | null {
  const {
    controller,
    settings,
    control,
    cycle,
    cycleId,
    sessionList,
    courseTitles,
    currentTitle,
    setActiveCourse,
  } = deps;
  const day = cycle.today.state.status === "ready" ? cycle.today.state.value : null;
  const month = cycle.month.state.status === "ready" ? cycle.month.state.value : null;
  const groups = sessionList.view.groups;

  const tabs = useMemo(
    () =>
      sessionTabs({
        cycleId,
        isControl: control.isControl,
        currentFile: controller.sessionFile,
        today: todayKey(),
        courseSessions: settings.courseSessions,
        courseStartedOn: settings.courseStartedOn,
        rows: groups.flatMap((group) => group.rows),
        names: { ...courseTitles, ...(month?.names ?? {}), ...(day?.names ?? {}) },
        day,
        currentTitle,
        streaming: controller.streaming,
      }),
    [
      cycleId,
      control.isControl,
      controller.sessionFile,
      controller.streaming,
      settings.courseSessions,
      settings.courseStartedOn,
      groups,
      courseTitles,
      month,
      day,
      currentTitle,
    ],
  );

  const onPick = useCallback(
    (key: string) => {
      const picked = tabs.find((item) => item.key === key);
      if (!picked || picked.active) return;
      if (picked.kind === "control") {
        control.openControl();
        return;
      }
      const { file, slug } = picked;
      if (file === null) return;
      controller.guardSwitch(() => {
        setActiveCourse(slug);
        void controller.openSession(file, slug === null ? { kind: "free" } : { kind: "course", slug });
      });
    },
    [tabs, control, controller, setActiveCourse],
  );

  return useMemo(
    () =>
      cycleId === null
        ? null
        : {
            items: tabs.map(({ key, label, active, busy }) => ({ key, label, active, busy })),
            onPick,
          },
    [cycleId, tabs, onPick],
  );
}
