/** 总进度里「停用 / 恢复一门课」的文案（logic-ui-1116.html B）。core/strings.ts 已到上限，所以单放。 */
export const courseStopStrings = {
  more: (name: string): string => `「${name}」的更多操作`,
  stop: "停用这门课…",
  dialogTitle: (name: string): string => `停用 ${name}？`,
  dialogBody1: "停用后不再排课，也不出现在今天、周表格和总进度里。",
  dialogBody2: "学习记录、概念页、卡片都保留；随时可以在「已停用」里恢复，恢复后从下一个上课日接着排。",
  cancel: "取消",
  confirm: "停用",
  summary: (names: string[]): string => `已停用 ${names.length} 门 · ${names.join("、")}`,
  on: (date: string): string => `停用于 ${date}`,
  resume: "恢复",
  resuming: "正在恢复…",
  stopping: "正在停用…",
  failed: (error: string): string => `没做成：${error}`,
};
