/**
 * 「讲解偏好」的状态：挂载时读列表，删一行后重读（logic-ui-1116.html A ⑥）。
 * 一次只删一行；删掉不弹确认，失败了在那组下面写原因。
 */

import { useCallback, useEffect, useState } from "react";
import type { SubjectPrefs } from "@shared/data-protocol.js";
import type { SkillsPanelProps } from "../../skins/contract.js";
import * as client from "../client.js";
import { prefsView } from "./prefs-view.js";

export function usePrefs(): NonNullable<SkillsPanelProps["prefs"]> {
  const [list, setList] = useState<SubjectPrefs[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    void client.data({ kind: "prefs.list" }).then((loaded) => {
      if (loaded.ok) setList(loaded.data);
      else setLoadError(loaded.error);
    });
  }, []);

  useEffect(load, [load]);

  const onRemove = useCallback(
    (subject: string, text: string) => {
      if (pendingKey !== null) return;
      setPendingKey(`${subject}\n${text}`);
      setErrors((current) => {
        const next = { ...current };
        delete next[subject];
        return next;
      });
      void client
        .data({ kind: "prefs.remove", subject, text })
        .then((removed) => {
          if (removed.ok) load();
          else setErrors((current) => ({ ...current, [subject]: removed.error }));
        })
        .finally(() => setPendingKey(null));
    },
    [pendingKey, load],
  );

  return { ...prefsView(list, pendingKey, errors, loadError), onRemove };
}
