/** 「技能与设置」里「讲解偏好」一块的文案（logic-ui-1116.html A ⑥）。core/strings.ts 已到上限，所以单放。 */
export const prefsStrings = {
  title: "讲解偏好",
  hint: "课上说「以后讲 … 都 …」时记下的",
  loading: "正在读…",
  empty: "还没有记下的偏好。课上说「以后讲 … 都 …」时会记在这里。",
  style: "默认风格",
  remove: "删掉",
  removing: "正在删…",
  failed: (error: string): string => `没删掉：${error}`,
  note: "删掉后下节课起不再照它讲；新的偏好仍在课上说。",
  loadFailed: (error: string): string => `读不到偏好：${error}`,
};
