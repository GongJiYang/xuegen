/**
 * 开课 / 收课 的固定步骤（标题照 skills/course/SKILL.md，由 scripts/feature-steps.mjs 抽出）。
 * 改 SKILL.md 的步骤时这里要跟着改：scripts/feature-steps.test.mjs 核对两边一致。
 */
export type FlowId = "course.open" | "course.close";

export const FLOW_STEPS: Record<FlowId, { name: string; total: number; steps: Record<number, string> }> = {
  "course.open": {
    name: "开课",
    total: 8,
    steps: {
      1: "确认会话",
      2: "读课程页和偏好",
      3: "顺延排期",
      4: "查主项或辅助",
      5: "回忆",
      6: "定核心页",
      7: "出今日要点",
      8: "讲课",
    },
  },
  "course.close": {
    name: "收课",
    total: 10,
    steps: {
      0: "先看这个会话里有没有上过课",
      1: "重读课程页",
      2: "打勾",
      3: "抵消（撤销）",
      4: "标注未完成",
      5: "追加学习记录",
      6: "更新下次起点",
      7: "生成截图",
      8: "写概念页并提交",
      9: "核对与报告",
      10: "提议闪卡",
    },
  },
};
