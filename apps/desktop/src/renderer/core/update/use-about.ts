/**
 * The 「学根」 row's state (logic-ui-1116.html A ②): the version the main process
 * last reported, plus whether this dialog asked for a check (so the result line
 * only appears after the user clicked, not from a background check).
 */

import { useCallback, useEffect, useState } from "react";
import type { UpdateStatus } from "@shared/update.js";
import type { SkillsPanelProps } from "../../skins/contract.js";
import * as client from "../client.js";
import { aboutView } from "./about.js";

export function useAbout(): NonNullable<SkillsPanelProps["about"]> {
  const [status, setStatus] = useState<UpdateStatus>({ kind: "idle", current: "" });
  const [asked, setAsked] = useState(false);
  useEffect(
    () =>
      client.subscribe((event) => {
        if (event.type !== "update-status") return;
        setStatus(event.status);
      }),
    [],
  );
  const onCheck = useCallback(() => {
    setAsked(true);
    void client.data({ kind: "update.check" }).then((result) => {
      if (result.ok) setStatus(result.data);
    });
  }, []);
  return { ...aboutView(status, asked), onCheck };
}
