/**
 * The update bar's state: the latest status the main process pushed, the
 * user's 「稍后」 for the current offer, and the actions.
 */

import { useCallback, useEffect, useState } from "react";
import type { UpdateStatus } from "@shared/update.js";
import * as client from "../client.js";

export interface UpdateBarState {
  status: UpdateStatus;
  /** True after 「稍后」 until the next status change. */
  dismissed: boolean;
  onDownload(): void;
  onInstall(): void;
  onDismiss(): void;
}

export function useUpdate(): UpdateBarState {
  const [status, setStatus] = useState<UpdateStatus>({ kind: "idle", current: "" });
  const [dismissed, setDismissed] = useState(false);
  useEffect(
    () =>
      client.subscribe((event) => {
        if (event.type !== "update-status") return;
        setStatus(event.status);
        setDismissed(false);
      }),
    [],
  );
  const call = useCallback((kind: "update.download" | "update.install") => {
    void client.data({ kind }).then((result) => {
      if (result.ok) setStatus(result.data);
    });
  }, []);
  return {
    status,
    dismissed,
    onDownload: () => call("update.download"),
    onInstall: () => call("update.install"),
    onDismiss: () => setDismissed(true),
  };
}
