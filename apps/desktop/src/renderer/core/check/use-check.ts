/**
 * 「库检查」的状态：挂载时读上次结果，点按钮才重新跑（logic-ui-1116.html A ③）。
 * 结果留在弹框里，不进顶部状态行。
 */

import { useCallback, useEffect, useState } from "react";
import type { CheckResult } from "@shared/data-protocol.js";
import type { SkillsPanelProps } from "../../skins/contract.js";
import * as client from "../client.js";
import { checkView } from "./check-view.js";

export function useCheck(): Omit<NonNullable<SkillsPanelProps["check"]>, "onAsk"> & {
  result: CheckResult | null;
} {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void client.data({ kind: "check.last" }).then((loaded) => {
      if (loaded.ok) setResult(loaded.data);
    });
  }, []);

  const onRun = useCallback(() => {
    if (running) return;
    setRunning(true);
    setError(null);
    void client
      .data({ kind: "check.run" })
      .then((ran) => {
        if (ran.ok) setResult(ran.data);
        else setError(ran.error);
      })
      .finally(() => setRunning(false));
  }, [running]);

  return { ...checkView(result, running, error), onRun, result };
}
