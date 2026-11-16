/**
 * 「技能与设置」的「学根」一行（logic-ui-1116.html A ②）：版本号和点「检查更新」后的结果。
 */

import type { UpdateStatus } from "@shared/update.js";
import { strings } from "../strings.js";

export interface AboutView {
  /** 当前版本（「0.15.0」）；还不知道时为 ""。 */
  version: string;
  /** 「检查更新」下面那一行；还没点过、或状态与检查无关时为 null。 */
  line: string | null;
  /** 正在检查：按钮禁用。 */
  checking: boolean;
}

/** What the 学根 row shows; `asked` = 这个弹框里点过「检查更新」. */
export function aboutView(status: UpdateStatus, asked: boolean): AboutView {
  return {
    version: status.current,
    line: asked ? lineFor(status) : null,
    checking: status.kind === "checking",
  };
}

function lineFor(status: UpdateStatus): string | null {
  switch (status.kind) {
    case "checking":
      return strings.update.checking;
    case "latest":
      return strings.update.latest(status.current);
    case "unsupported":
      return strings.update.unsupported;
    case "available":
      return strings.about.available(status.version);
    case "downloading":
      return strings.update.downloading(status.version);
    case "ready":
      return strings.update.ready(status.version);
    case "error":
      return status.message;
    case "idle":
      return null;
  }
}
