/**
 * All user-facing copy, in one place.
 *
 * Skins are not allowed to carry their own text: every string a slot renders
 * comes from here, so switching skins never changes what the app says — only how
 * it looks. Keeping the strings typed and frozen also means a missing slot
 * string is a compile error, not a blank label.
 */

import type { CycleDayType } from "@shared/data-protocol.js";

const CYCLE_DAY_TYPE: Record<CycleDayType, string> = {
  深度: "主攻日",
  整合: "整合日",
  低强度: "低强度日",
  休息: "休息日",
};

/** The read-only day list's row lead: the lane name, main lessons need none. */
const PLAN_LANE_PREFIX = { main: "", after: "课后读 · ", guide: "导读课 · ", self: "自读 · " } as const;

export const strings = {
  app: {
    name: "Xuegen",
    nameZh: "学根",
  },
  topBar: {
    modelLabel: "模型",
    modelPlaceholder: "选择模型…",
    modelEmpty: "无可用模型",
    modelTitle: "切换当前会话使用的模型",
    newSession: "新会话",
    newSessionTitle: "开始新会话",
    sessionList: "会话列表",
    appearance: "外观",
    appearanceTitle: "切换界面皮肤",
    appearanceCurrent: "当前皮肤",
    bodyFont: "正文字体",
    bodyFontTitle: "切换消息正文字体",
    fontNames: {
      pixel: "像素",
      hei: "黑体",
      kai: "楷体",
      song: "宋体",
    },
    bodyScale: "正文字号",
    bodyScaleTitle: "调整正文大小",
    menuFile: "文件",
    menuEdit: "编辑",
    coursesAndPlans: "课程与计划",
    menuLearn: "学习",
    menuStyle: "风格",
    stylePerCourse: "按课程记住",
    menuView: "显示",
    focusMode: "专注模式",
    focusModeTitle: "收起侧窗，居中对话",
    showAllWindows: "显示全部侧窗",
    thinkingLevel: "思考强度",
    palette: "配色",
    paletteTitle: "切换配色",
    copyAnswer: "复制本条回答（Markdown）",
    selectAll: "全选",
    todayDone: "今天学到这里",
    openCourse: "打开课程页",
  },
  chat: {
    /** Chat window title when no course session is active. */
    freeSession: "自由提问",
    empty: "开始学习：描述你想理解的主题，或继续最近一次会话。",
    loginHint: "请先在终端运行 xuegen 并执行 /login。",
    dismiss: "关闭",
    copy: "复制 Markdown",
    copied: "已复制",
    copyTitle: "复制原始 Markdown",
    thinking: "正在思考",
    activitySearching: (detail: string): string => `正在查资料：${detail}`,
    activityWorking: (detail: string): string => `正在动手：${detail}`,
    activityWriting: "正在写",
    /** Elapsed time and step count next to the in-progress line: 「3 分 12 秒 · 第 6 步」. */
    activityMeta: (seconds: number, steps: number): string =>
      `${seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`}${steps > 0 ? ` · 第 ${steps} 步` : ""}`,
    pinDefs: "本课要点",
    pinQuestions: "当前题目",
    pinJumpDefs: "跳到原文 ↑",
    pinJumpQuestions: "跳到原题 ↑",
    pinChip: (defs: number, questions: number): string =>
      [defs > 0 ? `要点 ${defs}` : "", questions > 0 ? `题目 ${questions}` : ""].filter(Boolean).join(" · "),
    backToLatest: "↓ 回到最新",
    /** One line standing for all of an answer's tool steps (click to show them). */
    toolSteps: (n: number): string => `学根做了 ${n} 步操作`,
    errorDetail: "详情",
    retry: "重试",
    retryTitle: "重发上一条提问",
    /** A dropped connection that Pi is retrying on its own (no 重试 button). */
    retrying: (attempt: number, maxAttempts: number): string =>
      `连接中途断开，正在自动重试（第 ${attempt} / ${maxAttempts} 次）…`,
    /** The retry produced an answer: one soft line, no error block. */
    retried: "连接断开过一次，已自动重试",
    /** Title-bar context usage; `percent` is already an integer. */
    context: (percent: number): string => `上下文 ${percent}%`,
    contextUnknown: "上下文 —",
    /** Appended when the window is nearly full and Pi will compact soon. */
    contextSoon: " · 即将压缩",
    /** Replaces the usage label while Pi is summarizing older messages. */
    compacting: "正在压缩较早的对话…",
    /** `tokens` is null immediately after a compaction, before fresh usage. */
    contextDetail: (tokens: number | null, contextWindow: number): string =>
      `已用 ${tokens ?? "—"} / ${contextWindow} token`,
    contextUnavailable: "暂时无法读取上下文用量",
    compactNow: "立即压缩",
    /** The local transcript marker inserted where a compaction happened. */
    compactionNote: "较早的对话已压缩为摘要（课程进度保存在课程文件里，不受影响）",
    compactionFailed: (reason: string): string => `压缩失败：${reason}`,
    refreshNote: "[课程页或技能可能已更新：先重读课程页和要用的技能，以文件为准]",
    controlRefreshNote: "[技能可能已更新：先重读要用的技能（course、cycle-plan 等），以文件为准]",
    /** Rides on the next 总控 message after 「撤销这次改动」: the model did not see the undo. */
    undoneNote: "[刚撤销了上一轮的排期改动：先重读相关课程页，以文件为准]",
    checkpointPrompt:
      "[上下文快满：按 course「长会话先存档」把存档点写进课程页 Next Session（当前题目原文、我答到哪、下一步讲什么），写好后用一句话告诉我]",
    checkpointResume:
      "[接着上一个会话的存档点继续：先读课程页 Next Session 里的存档点，从那里接着上，不重新开课]",
  },
  input: {
    placeholder: "发消息…（Enter 发送，Shift+Enter 换行）",
    placeholderDisabled: "暂无可用模型，请先在终端运行 xuegen 并执行 /login",
    send: "发送",
    stop: "停止",
    /** Shown in the style row while the assistant is generating. */
    streaming: "生成中… Esc 停止",
    styleLabel: "风格：",
    slashHint: "输入 / 查看功能",
    slashEmpty: "没有匹配的功能",
    slashKeys: "↑↓ 选择 · Enter 执行 · Esc 关闭",
    placeholderShort: "问学根，或输入 / 查看功能",
    answerPlaceholder: "写下你的答案…",
    enterHint: "Enter 发送，Shift+Enter 换行",
    queueHint: "学根正在回答，可以继续输入，发出后排在这条回答之后。",
    cancelAnswer: "取消",
    /** The 「默认」 style radio in a course whose subject names a default: 「默认 · 细讲」. */
    defaultStyle: (name: string): string => `默认 · ${name}`,
  },
  commands: {
    styleDefault: "按科目的讲解偏好",
    stylePlain: "以理解概念为主",
    styleDetailed: "一次一个点",
    styleDeep: "讲到机制与边界",
    newSession: "开一个空白会话",
    sessionList: "按天找回以前的会话",
    control: "今天的安排与周期进度",
    endToday: "打勾、记录、更新下次起点",
    summarize: "把讲过的整理成今日要点和题目",
    progress: "总进度",
    calendar: "日历",
    skills: "全部技能",
    addReading: "把文章加入阅读队列",
    readingOpen: "阅读队列",
    makeCards: "起草卡片，确认后才写",
    unknown: "没有这个命令",
    skillFallback: "使用该技能",
    summarizePrompt:
      "把这次讲过的内容总结一下：1. 用一个 > [!abstract] 今日要点 框，每行写成 - **术语**：定义（一句话），覆盖这次讲过的概念；2. 把我答错或没答完的地方各出一道题，每题单独一个 > [!question] 块。只在回复里写，不改库。",
    endTodayPrompt: "今天学到这里，写进 wiki，更新计划",
  },
  /** Folded one-line labels for messages the interface sends for the user (⟦xuegen:<action>⟧). */
  actions: {
    open: "开今天的课",
    resume: "接着上次",
    "new-course": "建课",
    plan: "改计划",
    verify: "周核实",
    summary: "总结",
    cards: "制卡",
    clip: "剪藏",
    ask: "交给总控",
    close: "收课",
    "close-skip": "不记录，结束",
    checkpoint: "存档",
    continue: "从存档点接着上",
    brief: "今日简报",
    "undo-close": "撤销收课",
    accompany: "陪读",
    legacy: "旧指令",
  },
  /** The buttons a course session shows beside the composer. */
  lesson: {
    summary: "总结",
    cards: "制卡",
    close: "收课",
    label: "上课",
    /** Hover text spelling out what each button changes (HAX 16). */
    summaryHint: "把这节讲过的整理成今日要点和题目，钉在左边；不改任何文件",
    cardsHint: "按这节答对的内容起草卡片，先给你看，确认后才写",
    closeHint: "给这节打勾、写学习记录和概念页，定课后读；会改课程页，要几分钟",
    undoCloseHint: "把这次收课打的勾退回去，记录保留并注明撤销",
    /** The 「收课 ▾」 menu entries. */
    closePlain: "收课",
    closeNoWiki: "收课，不写概念页",
    closeNoRecord: "不记录，直接结束",
    closeNoWikiSuffix: "（今天不写库：这次不写概念页）",
    noRecordPrompt: "本次不记录：不写任何文件，直接结束这节课。",
    /** After a 收课 answer: offer to roll the checkmarks back. */
    undoClose: "撤销这次收课",
    undoClosePrompt:
      "撤销这次收课：用 course_close 的 undo（这门课的 slug），把这次收课改过的已有文件恢复到收课前；不要另开暂存手工改勾。新建的概念页和卡片保留，列出来问我要不要删。undo 拒绝时照它给的原因告诉我。",
  },
  tools: {
    dockLabel: "工具",
    progress: "总进度",
    reading: "阅读",
    cards: "卡片",
    calendar: "日历",
    skills: "技能",
    switchHint: "⌘1–⌘5 切换工具",
  },
  intro: {
    /** 上次学到某个已勾选任务；`date` 为 `YYYY-MM-DD`。 */
    lastDone: (done: string, date: string): string => `上次学到这里：${done}（${date}）`,
    /** 只有已勾选任务，还没有记录日期（少见，避免丢掉任务名）。 */
    lastDoneOnly: (done: string): string => `上次学到这里：${done}`,
    /** 只有日期，没有已勾选任务。 */
    lastDate: (date: string): string => `上次学习：${date}`,
    /** 既没有日期也没有任务。 */
    firstTime: "第一次学这门课",
    next: (next: string): string => `这次从这里开始：${next}`,
    nextUnset: "这次从这里开始：由学根根据课程文件决定",
    week: (done: number, total: number): string => `本周 ${done}/${total}`,
  },
  today: {
    title: "今天",
    todayPlan: "今天计划",
    todayPlanEmpty: "今天没有计划或记录。",
    tomorrowPlan: "明天",
    tomorrowPlanEmpty: "明天没有安排。",
    readingDue: "到期阅读",
    cardsPending: "待同步卡片",
    resumeTitle: "接着上次",
    resumeEmpty: "还没有学习记录。选一门课开始吧。",
    nextSession: "下次起点：",
    nextSessionUnset: "尚未设定下次起点",
    resume: "开课 →",
    backToCourse: "回到这节课 →",
    preparing: "准备中…",
    loading: "正在读取…",
  },
  cycle: {
    dayType: CYCLE_DAY_TYPE,
    typeShort: { 深度: "主", 整合: "整", 低强度: "低", 休息: "休" } as Record<CycleDayType, string>,
    headline: (week: number, weekday: string, type: CycleDayType, extra: boolean): string =>
      `第 ${week} 周 · ${weekday} · ${CYCLE_DAY_TYPE[type]}${extra ? "（加课）" : ""}`,
    minutes: "今天主攻",
    start: "开课 →",
    carried: (date: string): string => `! 原定 ${date.slice(5)}，顺延到今天`,
    missed: (name: string, id: string): string => `${name} ${id} 没学`,
    missedNote: "下次顺延",
    /** A merged missed row's `id` slot: 「3 节（最早 11-09）」 where a lesson id would be. */
    missedCount: (count: number, first: string): string => `${count} 节（最早 ${first.slice(5)}）`,
    verifyTitle: "周核实",
    verifyRow: (name: string, done: number, total: number): string => `${name}：本周 ${done}/${total}`,
    verify: "核实 →",
    light: "不上新课",
    rest: "休息",
    anki: "Anki",
    ankiDue: (count: number): string => `${count} 张待复习`,
    ankiOff: "未打开",
    tomorrow: (
      weekday: string,
      type: CycleDayType,
      lesson: string | null,
      aux: string | null = null,
    ): string =>
      `明天：${weekday} · ${CYCLE_DAY_TYPE[type]}${lesson ? ` · ${lesson}` : ""}${aux ? ` + 导读课 ${aux}` : ""}`,
    auxTag: "导读课",
    verifyPrompt: (slug: string): string =>
      `做本周周核实：按收课流程逐项提问，核对后再打勾（课程文件：wiki/courses/${slug}.md）`,
    legend: "深 · 整 · 低 · 休 ＝ 日子类型",
    slotLine: (week: number, type: CycleDayType): string => `第 ${week} 周 · ${CYCLE_DAY_TYPE[type]}`,
  },
  control: {
    title: (cycle: string): string => `总控 · ${cycle}`,
    open: "总控 →",
    /** The empty transcript under the 今日卡 before the first control message. */
    emptyToday: "今天还没跟总控说话。点「让总控说说」看今日简报，或直接问怎么安排。",
    briefPrompt: "/skill:cycle-plan 给出今天的简报（按每日简报格式），只安排、不讲课。",
    card: {
      askBrief: "让总控说说",
      foot: "想改计划，直接在右边跟总控说。",
      study: "开课 →",
      /** The button on a lesson already recorded in the course's 「完成：」 line. */
      backToLesson: "回到这节课 →",
      verify: "开始 →",
      /** A 周核实 already started today: done-looking; the click only switches back. */
      verifyBack: "回到核实 →",
      verifySub: "逐项核对本周学的",
      verifyStarted: "今天已开始",
      read: "开始读 →",
      anki: "打开 Anki →",
      /** The 今日卡's Anki row: plain, or with today's due count when Anki is open. */
      ankiRow: "Anki",
      ankiRowDue: (count: number): string => `Anki · 今天 ${count} 张`,
      afterRead: "读完了",
      /** The 讲后读 rows' shown name (the data keeps 讲后读). */
      afterReadPrefix: "课后读 · ",
      checkedLabel: "已记下",
      /** The three groups of the 今天 list (panel v2): how each kind of row gets done. */
      groups: {
        lesson: { title: "上课", note: "主课、导读课、周核实：进会话讲，讲完在会话里点「收课」才算完成" },
        read: { title: "阅读", note: "读完勾一下就记下（10 秒内可撤销）；想让学根陪着读，点「陪读 →」" },
        review: { title: "复习", note: "在 Anki 里刷，学根不记" },
      } as Record<"lesson" | "read" | "review", { title: string; note: string }>,
      /** 陪读: a 自由 session that reads the block with the learner; marks nothing done. */
      accompany: "陪读 →",
      accompanyBookPrompt: (
        title: string,
        slug: string,
        chunk: { title: string; from: number; to: number },
      ): string =>
        `/skill:reading 陪我读《${title}》（书房 ${slug}）${chunk.title} pp.${chunk.from}–${chunk.to}：` +
        "先问我读到哪、哪里卡住，再讲难点、答疑。这是陪读：不记完成，不改书页、课程页和计划（读完我会在面板上勾）。",
      accompanyAfterReadPrompt: (title: string, course: string): string =>
        `/skill:reading 陪我读「${title}」（课程 ${course} 的课后读）：` +
        "先问我读到哪、哪里卡住，再讲难点、答疑。这是陪读：不记完成，不改书页、课程页和计划（读完我会在面板上勾）。",
      /** The 「读完了」 button while its undo window runs: 「撤销 · 7」. */
      undo: (left: number): string => `撤销 · ${left}`,
      /** Row-button hover text saying what the click changes. */
      studyHint: "打开这门课今天的会话，开始讲",
      verifyHint: "打开这门课，逐项核实本周任务",
      afterReadHint: "在课程页把这行打勾（记「用户自报」），并记进书房的书页；10 秒内可撤销",
      shelfPlanned: "自读 · ",
      shelfFree: "自读（计划外）· ",
      shelfChunk: (short: string, chunk: { title: string; from: number; to: number }): string =>
        `${short} ${chunk.title} · pp.${chunk.from}–${chunk.to}`,
      shelfDay: (n: number, total: number): string => `第 ${n} / ${total} 段`,
      shelfLate: (days: number, end: string): string => `晚了 ${days} 天，读完日期顺延到 ${end.slice(5)}`,
      shelfCore: (pages: string): string => `其中 ${pages} 课后读读过，照读`,
      shelfDone: "读完这段",
      shelfDoneHint: "记下这段读完了，明天换下一段；10 秒内可撤销",
      shelfPendingSub: "已记下",
      shelfDoneSub: (next: { from: number; to: number }): string => `已记下，明天 pp.${next.from}–${next.to}`,
      shelfResumed: "今天恢复，明天接着读",
      shelfFinished: "已记下，这本读完了",
      shelfDoneFailed: "没能记进书房，请再点一次「读完这段」。",
      extract: "摘几句",
      extractHint: "存一句原文和页码进书页，不调模型",
      extracted: (n: number): string => `摘了 ${n} 句`,
      extractPage: "页码",
      extractText: "原句（粘贴或手打，一次一句）",
      extractSave: "存进书页",
      extractCancel: "取消",
      extractNote: "只存原句和页码，不调模型。做卡在「阅读」面板里一次做一批。",
      extractPageInvalid: "页码写数字，比如 11。",
      extractTextEmpty: "原句不能是空的。",
      extractFailed: "没能存进书页，请再试一次。",
      /** The fold row under the card: 「▸ 更早的对话 · 11-05 起 · 38 条」. */
      older: (count: number, since: string, open: boolean): string =>
        `${open ? "▾" : "▸"} 更早的对话 · ${since.slice(5)} 起 · ${count} 条`,
      afterReadDue: (date: string): string => ` · 原定 ${date.slice(5)}`,
      verifyRow: (name: string): string => `${name} · 周核实`,
      auxPrefix: "导读课 · ",
      readRow: (title: string, position: string): string =>
        `读书：${title}${position ? ` · 从 ${position}` : ""}`,
      /** A lesson not taken on its day: just the lesson, with a grey 「原排 …」 sub. */
      missedRow: (name: string, id: string, content: string): string => `${name} ${id} · ${content}`,
      missedSub: (date: string): string => `原排 ${date.slice(5)}`,
      /** Several such lessons of one course, merged into one row. */
      missedMany: (name: string, firstId: string, count: number): string =>
        `${name} ${firstId} 起 ${count} 节`,
      missedManySub: (first: string): string => `原排 ${first.slice(5)} 起 · 开课后后面的课次跟着挪`,
      afterReadFailed: "没能写进课程页，请在课程会话里说「课后读读完了」。",
    },
  },
  sessions: {
    title: "会话",
    newSession: "＋ 新会话",
    today: "今天",
    yesterday: "昨天",
    control: "总控",
    free: "自由",
    controlTitle: "今日简报",
    empty: "（空会话）",
    count: (n: number): string => `${n} 条`,
    dayHeading: "这天的会话",
    loading: "正在读取会话…",
    failed: "读不到会话列表。",
    none: "还没有会话。",
    tabsLabel: "今天的会话",
    tabBusy: "学根正在回答",
    /** 「＋」 popover heading for the tabs that did not fit in the strip. */
    foldedTabs: "放不下的标签",
  },
  update: {
    available: (version: string, count: number): string =>
      `学根 v${version} 可以更新${count > 0 ? ` · ${count} 项改进` : ""}`,
    showNotes: "看看改了什么",
    hideNotes: "收起",
    later: "稍后",
    install: "更新并重启",
    downloading: (version: string): string => `正在下载 v${version}`,
    ready: (version: string): string => `v${version} 已就绪，学根将关闭并重新打开（对话和进度都会保留）`,
    restart: "立即重启",
    checking: "正在检查更新…",
    latest: (version: string): string => `已是最新版本 v${version}`,
    unsupported: "开发模式不检查更新",
    close: "关闭",
  },
  plan: {
    routeLabel: "两年路线",
    routeEndLabel: "预计结束",
    routeEnd: (year: number, month: number, day: number): string => `${year} 年 ${month} 月 ${day} 日`,
    routeSub: (start: string, weeksLeft: number, bufferWeeks: number): string =>
      `${start} 开始 · 还有 ${weeksLeft} 周${bufferWeeks > 0 ? ` · 另留约 ${bufferWeeks} 周缓冲` : ""}`,
    showCycles: (count: number): string => `看 ${count} 个周期 ▸`,
    hideCycles: (count: number): string => `收起 ${count} 个周期`,
    cycleLabel: "本周期",
    week: (week: number, weeks: number): string => `第 ${week} / ${weeks} 周`,
    cycleEnd: (day: string): string => `${day} 结束`,
    cycleSub: (daysLeft: number, next: { cycle: string; start: string } | null): string =>
      `还剩 ${daysLeft} 天${next ? ` · 下个周期 ${next.cycle} 从 ${next.start.slice(5)} 开始` : ""}`,
    auxEmpty: "没排导读课",
    auxPlanned: (list: string): string => `原定 ${list}`,
    lessonTotal: (total: number): string => ` / ${total} 节`,
    courseEnd: (day: string, role: "main" | "aux" = "main"): string =>
      role === "aux" ? `预计 ${day} 学完` : `结课 ${day}`,
    nextLabel: "下一节",
    today: "今天",
    overdue: (day: string): string => `${day} 没学`,
    otherWarn: (count: number): string => `${count} 门超 14 天没学`,
    sectionDone: "已学完",
    planMaterial: "排课",
    tag: { 深度: "", 整合: "整合", 低强度: "Anki", 休息: "" } as Record<CycleDayType, string>,
    tagRecovery: "恢复",
    tagRead: "读书",
    flagStart: (cycle: string): string => `${cycle} 起`,
    flagEnd: (cycle: string): string => `${cycle} 完`,
    slotLine: (cycle: string, week: number, type: CycleDayType, last: boolean): string =>
      `${cycle} 第 ${week} 周 · ${CYCLE_DAY_TYPE[type]}${last ? ` · ${cycle} 最后一天` : ""}`,
    recoveryLine: "恢复周 · 不排新课",
    verifyItem: "两科周核实 · 汇总本周问题",
    ankiItem: "Anki",
    restItem: "休息，不排任务",
    legend: (names: string[]): string =>
      `${names.length > 0 ? `${names.join(" / ")} = 主攻课\u3000` : ""}整合 = 周核实\u3000Anki = 低强度\u3000读书 = 书房自读\u3000顶部蓝线 = 周期起止\u3000空白 = 休息`,
    legendAux:
      "上行主课 · 下行导读课　整合 = 周核实　Anki = 低强度　读书 = 书房自读　顶部蓝线 = 周期起止　空白 = 休息",
    auxTitle: "导读课",
    auxNote: "只做了解 · 不考核 · 每次 ≤ 45 分钟",
    auxProgress: (done: number, total: number): string => `${done} / ${total} 节`,
    cycleRange: (start: string, end: string, weekday: string, daysLeft: number): string =>
      `${start} → ${end}（${weekday}）· 还剩 ${daysLeft} 天`,
    days: (days: string[]): string => days.join(" · "),
    allLessons: (total: number): string => `全部 ${total} 节 ›`,
    fewerLessons: "收起",
    finished: (count: number): string => `已学完 ${count}`,
    finishedNote: (total: number): string => `${total} 节`,
    materialsShort: (count: number, unplanned: number): string =>
      `资料 ${count}${unplanned > 0 ? ` · ${unplanned} 未排课` : ""}`,
  },
  /** The planbook (PLANBOOK-1111): fixed copy of the approved day / week / month views. */
  /** What one 总控 answer changed in the schedule (marks on the grid, the banner, feed cards). */
  planChanges: {
    moved: (name: string, from: string, to: string): string => `${name} ${from} → ${to}`,
    added: (name: string, to: string): string => `新加 ${name} · ${to}`,
    removed: (name: string, from: string): string => `删掉 ${name}（原 ${from}）`,
    markFrom: (from: string): string => `从 ${from} 挪来`,
    markTo: (to: string): string => `→ ${to}`,
    markAdded: "新",
    markRemoved: "删掉",
    banner: (count: number): string => `学根刚改了 ${count} 处`,
    dismiss: "知道了",
    showAnswer: "看回答",
    undo: "撤销这次改动",
    undoing: "正在撤销…",
    undone: "已撤销",
    undoFailed: (reason: string): string => `没撤销成功：${reason}`,
  },
  /** The 总控 right column as a feed of cards, and the wide reader. */
  feed: {
    title: "动态",
    countToday: (count: number): string => `今天 · ${count} 次`,
    changed: (count: number): string => `改了 ${count} 处`,
    changedSuffix: "排期",
    more: (count: number): string => `还有 ${count} 处`,
    busy: (steps: number): string => (steps === 0 ? "正在想…" : `正在处理 · 第 ${steps} 步`),
    failed: "这次没答完",
    showAnswer: "看回答",
    showInWeek: "在周表格里看",
    empty: "问学根，或说要怎么改计划。改了排期会标在左边的周表格上。",
    readerClose: "关闭 · Esc",
    readerSteps: (steps: number): string => (steps === 0 ? "学根" : `学根 · ${steps} 步操作`),
    readerLoading: "正在读这一页…",
    openInObsidian: "在 Obsidian 打开",
    termCaption: "概念页",
    termSub: (label: string): string => `概念页 · ${label}`,
    readerPrev: "← 上一个",
    readerNext: "下一个 →",
    readerPosition: (course: string, at: number, total: number): string => `${course}术语 ${at} / ${total}`,
    readerNavHint: "← → 键翻页",
  },
  planbook: {
    views: { day: "日", week: "周", month: "月" },
    lanes: {
      /** The sub line says how the lane gets done (panel v2). */
      main: { label: "主课", sub: "要收课" },
      after: { label: "课后读", sub: "勾选完成" },
      guide: { label: "导读课", sub: "要收课" },
      self: { label: "自读", sub: "勾选完成" },
      anki: { label: "Anki", sub: "只提醒" },
    },
    legend: "✓ 做完　● 今天　○ 之后　☐ 读完勾选　↷ 挪到了后面　·　点一格看那天",
    monthFoot: "上行主课，下行导读课。自读每天都有，不在月视图里逐格列。",
    goalsCaption: "本周目标 · 来自两门主课的周核实",
    reviewCaption: "本周复盘 · 周五整合日填写",
    overdueRow: (name: string, count: number): string => `${name} 有 ${count} 节挪到了后面，开课时接着上`,
    /** A past self-reading day whose block moved on (the ↷ mark says so; the block also shows on its new day). */
    selfMissed: "",
    /** The day view's range title: 「11-11 周三」. */
    dayLabel: (date: string, weekday: string): string => `${date.slice(5)} ${weekday}`,
    /** The week view's range title inside a cycle: 「C1 W1 · 11-06 – 11-12」. */
    weekLabel: (cycle: string, week: number, start: string, end: string): string =>
      `${cycle} W${week} · ${start.slice(5)} – ${end.slice(5)}`,
    /** The week view's range title outside every cycle: 「11-09 – 11-15」. */
    plainWeekLabel: (start: string, end: string): string => `${start.slice(5)} – ${end.slice(5)}`,
    /** The month view's range title: 「2026 年 11 月」. */
    monthLabel: (year: number, month: number): string => `${year} 年 ${month} 月`,
    prev: "‹",
    next: "›",
    today: "今天",
    /** The panel's paging links, per view (panel v2): 「‹ 上一周 · 本周 · 下一周 ›」. */
    paging: {
      day: { prev: "‹ 前一天", now: "今天", next: "后一天 ›" },
      week: { prev: "‹ 上一周", now: "本周", next: "下一周 ›" },
      month: { prev: "‹ 上个月", now: "本月", next: "下个月 ›" },
    } as Record<"day" | "week" | "month", { prev: string; now: string; next: string }>,
    print: "打印",
    chatShow: "和总控聊",
    chatHide: "收起聊天",
    /** The 本周复盘 slot before the week's 整合日 (the next one after the week): who writes it and when. */
    reviewEmpty: (date: string): string => `${date.slice(5)} 周五整合日时由总控和你一起写`,
    /** The 本周复盘 slot when the week has no 整合日 after it: no date to promise. */
    reviewEmptyNoDate: "整合日时由总控和你一起写",
    /** One 本周目标 row: course short name, then the week task's label. */
    goalRow: (name: string, label: string): string => `${name} · ${label}`,
    /** The month grid's one-liner type tag for a day without lessons (休息 空着). */
    monthTypeShort: { 整合: "整合", 低强度: "低强度", 深度: "", 休息: "" } as Record<CycleDayType, string>,
    /** The week grid's Anki cell on today: 「42 张 · 打开 →」 (count-only, never a mark). */
    ankiToday: (count: number): string => `${count} 张 ·`,
    ankiOpen: "打开 →",
    /** Appended to the 总控 session title while the planbook shows: 「总控 · C1 · 计划本」. */
    titleSuffix: " · 计划本",
    /**
     * The read-only day list's row lead: 「课后读 · 」/「导读课 · 」/「自读 · 」, and
     * nothing for a main lesson (its lane is the lesson itself).
     */
    lanePrefix: (lane: "main" | "after" | "guide" | "self"): string => PLAN_LANE_PREFIX[lane],
    /** A day that is not today is read-only: actions live on today's list. */
    otherDayNote: "这天只能看；要开课或勾读完，点「回到今天」。",
    /** The one line every view shows while the data channel reads. */
    loading: "正在读取…",
    /** The 本周目标 slot when neither main course has a 周核实 task this week. */
    goalsEmpty: "本周没有周核实",
    /** The day view's caption: 「11-11 周三 · 主攻日」, or just 「11-11 周三」 outside a cycle. */
    dayCaption: (date: string, weekday: string, type: CycleDayType | null): string =>
      `${date.slice(5)} ${weekday}${type !== null ? ` · ${CYCLE_DAY_TYPE[type]}` : ""}`,
    /** The month grid's weekday headers, Monday first. */
    weekdays: ["一", "二", "三", "四", "五", "六", "日"],
  },
  progress: {
    caption: "点课程名展开；勾选由学根在「今天学到这里」时按证据写入。",
    weekProgress: "本周",
    lastRecord: "上次",
    lastRecordNone: "—",
    nextSession: "下次起点：",
    nextSessionUnset: "尚未设定",
    study: "开课 →",
    backToCourse: "回到这节课 →",
    empty: "还没有课程。用 course 技能绑定资料并制定计划。",
    newCourse: "＋ 新课程",
    newCourseHint: "课程名必填；填好后交给学根建课",
    courseTitle: "课程名",
    courseTitlePlaceholder: "课程名，如 CTM 第 7 章",
    material: "资料",
    materialPlaceholder: "库内路径或网址，可留空让学根问你",
    materialCandidates: "已有资料",
    startDate: "开始日期",
    startDatePlaceholder: "YYYY-MM-DD",
    endDate: "截止日期",
    restDays: "休息日",
    restOptions: { none: "不休息", sun: "周日", "sat,sun": "周六日" } as Record<string, string>,
    reading: "原书",
    readingOptions: { guided: "带读", "read-first": "先读后讲", "read-along": "边读边讲" } as Record<
      string,
      string
    >,
    readingHints: {
      guided: "学根讲，不安排读原文",
      "read-first": "每节先读原书 §x–y，再讲和练；阅读单独打勾",
      "read-along": "课上一起读原文段落，逐段讲",
    } as Record<string, string>,
    placementTitle: (subject: string): string => `排课 · ${subject}`,
    placementTag: (cycle: string, role: "main" | "aux"): string =>
      `${cycle} ${role === "aux" ? "导读课" : "主课"}`,
    placementLine: (days: string[], role: "main" | "aux", end: string, cycle: string): string =>
      role === "aux"
        ? `${days.join(" · ")}\u3000每节 ≤ 45 分钟\u3000不设完结`
        : `${days.join(" · ")}\u3000排到 ${end.slice(5)}（${cycle} 结束）`,
    placementHint: (role: "main" | "aux"): string =>
      role === "aux"
        ? "导读课只做了解，不出检查题；不设完结，没上的课往后顺延。"
        : "按教材章节切课次；按 7 周学时排，日期跟实际走。",
    placementSubmit: "交给学根排课",
    style: "讲解风格",
    create: "建课",
    cancel: "取消",
    editPlan: "改计划",
    editPlanPlaceholder: "想怎么改？如「截止日期改到 12 月 20 日」「周六也休息」",
    submit: "提交",
    cycleTop: (cycle: string, week: number, weeks: number): string => `${cycle} · 第 ${week} / ${weeks} 周`,
    sectionMain: "主课",
    sectionAux: "导读课",
    sectionOther: "路线外",
    sectionLearned: "已学专题",
    countCourses: (count: number): string => `${count} 门`,
    countSubjects: (count: number): string => `${count} 个科目`,
    auxEmpty: "空",
    unassigned: "未归科目",
    courseMeta: (weekDone: number, weekTotal: number, done: number, total: number): string =>
      `本周 ${weekDone}/${weekTotal} · 总 ${done}/${total}`,
    lastSeen: (date: string | null): string => (date ? `上次 ${date.slice(5)}` : "还没开始"),
    materials: (count: number, unplanned: number): string =>
      `资料 ${count}${unplanned > 0 ? ` · ${unplanned} 本未排课` : ""}`,
    materialNote: (role: string, status: string): string => `${role} · ${status}`,
    learnedNote: (count: number): string => `${count} 份资料已摄取`,
    legend: "● 在学　! 要注意　✓ 完成　○ 已排期　◌ 未排课",
  },
  reading: {
    scopeHint: "文章、论文、网页放这里；整本书在上面的书房，每天一段。",
    addCaption: "加入阅读",
    addHint: "粘贴网址或库内路径，如 raw/ctm-ch3.pdf",
    addPlaceholder: "粘贴网址或库内路径，如 raw/ctm-ch3.pdf",
    add: "加入",
    priorityLabel: "优先级",
    priorityHigh: "高",
    priorityMedium: "中",
    priorityLow: "低",
    todayCaption: "今天该读",
    queueCaption: (dueToday: number, total: number): string => `今天该读（${dueToday}）· 队列共 ${total} 篇`,
    added: (title: string, due: string): string => `已加入：${title}，${due}`,
    dueToday: "今天",
    dueOverdue: (days: number): string => `逾期 ${days} 天`,
    dueNone: "未排期",
    next: "下次接着读",
    postpone: "推迟",
    done: "读完",
    readToday: "今天就读",
    readTodayToday: "今天就读（到期日为今天）",
    positionLabel: "读到哪了",
    positionPlaceholder: "读到哪了？（页码或小节，可留空）",
    positionSave: "记录",
    empty: "队列是空的。上面粘贴一篇文章开始。",
    footnote: "读原文和跟学根学可以分开两天：这里只管读与摘录。",
    clipped: "已交给学根剪藏",
    noUrlHint: "输入库内路径，或粘贴网址交给学根剪藏。",
    notStarted: "未开始",
    readOn: "接着读",
    clip: "剪藏",
    priorityMark: "优先",
    positionAt: (position: string): string => `读到 ${position}`,
    later: "之后",
    nowEmpty: "今天没有要读的。",
    laterEmpty: "队列里没有其他文章。",
    errorNoSource: "原文必须位于 raw/ 或 clippings/ 下。",
    shelfPlanned: "书房 · 计划内",
    shelfQueue: "排队",
    shelfFree: "书房 · 计划外",
    shelfFreeEmpty: "还没有。跟总控说「我想读《…》」，学根登记这本书、切好每天一段、算出读完日期。",
    shelfArticles: "文章与摘录",
    shelfMeta: (position: number, total: number, end: string): string =>
      `已读 ${position} / ${total} 段 · 每天一段（≤ 10 页）· 预计 ${end} 读完`,
    shelfToday: (chunk: string): string => `今天：${chunk}`,
    shelfNextOn: (date: string, chunk: string): string => `下一段 ${date}：${chunk}`,
    shelfLater: "接下来几天",
    shelfCore: "课后读已读",
    shelfCoreLine: (pages: string, label: string, date: string): string =>
      `pp.${pages} · ${label} · ${date.slice(5)}`,
    shelfCoreNote: "只作参考：自读照读不跳，读到这几页时今日卡会提一句。",
    shelfExtracts: (count: number, pending: number): string =>
      `摘录 ${count} 句 · ${pending > 0 ? `${pending} 句待做卡` : "都做成卡了"}`,
    shelfCarded: (date: string): string => `已做卡 · ${date.slice(5)}`,
    shelfPending: "待做卡",
    shelfCardsHint: "学根按做卡规则出草稿，你看过再进 Anki",
    shelfCardsDone: "下次复习由 Anki 的 FSRS 安排",
    shelfCards: (n: number): string => `把 ${n} 句做成卡 →`,
    shelfQueued: (total: number, after: string | null, end: string): string =>
      `共 ${total} 段 · ${after ? `${after} 读完后开始，` : ""}预计 ${end} 读完`,
    shelfCardsPrompt: (short: string, slug: string, n: number): string =>
      `/skill:reading 书房做卡：把《${short}》（${slug}）里 ${n} 句待做卡的摘录做成卡。先在回复里列出草稿，我说可以再写进 Anki 牌组「书房::${short}」，写完用 bookshelf.mjs card 把这几句标成已做卡。`,
  },
  cards: {
    newCaption: "新卡片",
    newHint: "写进卡片页，直接同步到 Anki",
    frontPlaceholder: "正面：问题",
    backPlaceholder: "背面：答案",
    deckLabel: "牌组",
    add: "存为新卡",
    total: "卡片总数",
    unsynced: "待同步",
    syncedRatio: "进度条＝已同步比例",
    ankiNotRunning: "Anki 未打开：打开后显示今日复习",
    ankiRunning: "Anki 已连接",
    reviewedToday: "今日已复习",
    retry: "重试",
    pendingExtracts: "条摘录待制卡",
    draft: "让学根起草",
    draftPrompt: "/skill:wiki-save 从本次已核实的内容起草 3–8 张卡，只在回复里列出，我确认后再写入。",
    empty: "还没有卡片。上面存一张，或让学根起草。",
    decksCaption: "牌组",
    newCard: "＋ 新卡片",
    frontLabel: "正面",
    backLabel: "背面",
    cancel: "取消",
    syncNote: "写进卡片页后直接同步到 Anki（Anki 要开着）。",
    allSynced: "已全部同步",
    unsyncedCount: (n: number): string => `待同步 ${n}`,
    dueTodayCount: (n: number): string => `今日到期 ${n}`,
    reviewedTodayCount: (n: number): string => `今日已复习 ${n}`,
    extractsCount: (n: number): string => `${n} 条摘录待制卡`,
    saved: (deck: string): string => `已存入 ${deck}`,
  },
  calendar: {
    title: "日历",
    prevMonth: "上一月",
    nextMonth: "下一月",
    legendLearn: "● 学习",
    legendPlan: "◆ 计划",
    legendReading: "▲ 阅读到期",
    legendNote: "✎ 笔记",
    dblclickHint: "双击某天即可写入",
    dayEmpty: "这天还没有记录。",
    kindRecord: "学习记录",
    kindPlan: "计划",
    kindReading: "阅读到期",
    kindLog: "日志",
    writeNote: "写笔记",
    editNote: "修改笔记",
    saveTo: (date: string): string => `保存到 wiki/calendar/${date}.md`,
    today: "今天",
    monthTitle: (year: number, month: number): string => `${year}年${month}月`,
    legendPlainPlan: "计划",
    legendPlainDone: "已学",
    legendPlainReading: "阅读",
    legendPlainNote: "笔记",
    kindDone: "已学",
    recordLine: (heading: string): string => `学习记录 ${heading}`,
    dayEmptyHint: "这天没有安排。双击日期或点「写笔记」记一笔。",
    weekday: ["一", "二", "三", "四", "五", "六", "日"],
  },
  dayEditor: {
    title: "{date}",
    placeholder: "写下这天的安排或记录……\n- [ ] 读 CTM 第 2 章前半\n- [ ] 复习 Anki",
    save: "保存",
    cancel: "取消",
    saved: (date: string): string => `已保存 wiki/calendar/${date}.md`,
  },
  skills: {
    installCaption: "安装技能",
    installHint: "先审核再启用",
    installPlaceholder: "仓库地址，如 github.com/someone/skill",
    fetch: "获取",
    source: "来源",
    sourceBuiltin: "内置",
    sourcePersonal: "个人",
    sourcePending: "待审核",
    footnote: "关闭的技能不会被自动选用，也不出现在 / 菜单。",
    expand: "展开全文",
    collapse: "收起",
    empty: "还没有技能。",
    installed: (count: number): string => `已安装 · ${count}`,
    fetched: (names: string[]): string =>
      `已下载到待审核区：${names.join("、")}。点「审核」查看后再决定是否启用。`,
    fetchFailed: (reason: string): string => `获取失败：${reason}`,
    review: "审核",
    reviewTitle: (name: string): string => `审核技能：${name}`,
    reviewSource: "来源",
    reviewCommit: "提交",
    reviewFiles: "文件",
    reviewExecutable: "可执行脚本",
    reviewNoScripts: "没有可执行脚本。",
    reviewLint: "规范检查（仅供参考，不阻止启用）",
    reviewLintClean: "没有发现问题。",
    reviewSkillMd: "SKILL.md 全文",
    reviewEnable: "启用",
    reviewDiscard: "丢弃",
    reviewClose: "以后再说",
    reviewWarning: "启用后，学根会按这份说明行动，并可能运行其中的脚本。请确认来源可信。",
    toggled: (name: string, enabled: boolean): string => `${name} 已${enabled ? "启用" : "关闭"}`,
    rawToggle: "给学根看的说明",
    /** Chinese name and one line for the built-in skills; others fall back to their own name and first sentence. */
    known: {
      teach: ["讲课", "按诊断、推导、检验讲一个主题，管今日要点和检查理解题"],
      course: ["课程", "建课、排期、开课、收课，按证据打勾"],
      "cycle-plan": ["学习周期", "今天学什么、周五整合、周期轮换"],
      reading: ["阅读", "阅读队列、书房、摘录"],
      calendar: ["日历", "某天做了什么、写日历笔记"],
      diagram: ["画图", "把讲解画成字符图"],
      "course-board": ["课程看板", "只看课程进度，不改任何东西"],
      "wiki-save": ["存进 Wiki", "查询或整理进 Wiki、制作闪卡"],
      article: ["文章架构", "把学过的内容整理成知识架构"],
    } as Record<string, [string, string]>,
  },
  tool: {
    arguments: "参数",
    result: "结果",
    error: "错误",
    statusRunning: "运行中",
    statusSuccess: "成功",
    statusError: "失败",
    expand: "展开",
    collapse: "收起",
  },
  content: {
    mermaidError: "Mermaid 渲染失败",
    codeCopy: "复制代码",
    codeCopied: "已复制",
    tableCaption: "数据表格",
    mathLabel: "公式",
    diagramLabel: "图表",
    exerciseLabel: "检验题",
    exerciseTitle: "检查理解",
    exerciseAnswer: "我来回答",
    exerciseHint: "给点提示",
    exerciseSkip: "跳过",
    /**
     * The composer banner while answering an 「检查理解」 question. `n` is the
     * 1-based question number.
     */
    answering: (n: number): string => `正在回答：第 ${n} 题`,
    /** The prompt sent to 学根 when the learner asks for a hint. */
    exerciseAnswerPrefix: (index: number, text: string): string => `第 ${index} 题：${text}`,
    exerciseHintPrompt: (n: number): string => `给我第 ${n} 题的提示`,
    /** The prompt sent to 学根 when the learner skips a question. */
    exerciseSkipPrompt: (n: number): string => `跳过第 ${n} 题`,
    noticeLabel: "提示",
    warningLabel: "警告",
  },
  notice: {
    agentStarting: "正在启动会话…",
    agentRestarting: "会话中断，正在重启…",
    agentCrashed: "会话已中断。",
    agentStopped: "会话已停止。",
    skinFallback: "皮肤加载失败，已回退到 Bare。",
    unknownSkin: "未知皮肤，已回退到 Bare。",
    staleSession: (day: string, title: string): string => `这是 ${day} 的「${title}」会话。`,
    staleSessionAction: "开今天的课 →",
    checkpoint: (percent: number): string =>
      `这节课的上下文已用 ${percent}%。先把当前进度存档，再开新会话接着上。`,
    checkpointAction: "先存档 →",
    checkpointSaved: "存档好了：开一个新会话，从存档点接着上。",
    checkpointSavedAction: "开新会话接着上 →",
    actionTitle: "提示",
  },
  /** The confirm a shell shows when a session switch is held mid-answer. */
  switchGuard: {
    text: "学根还在回答，切走会中断这次回答。",
    confirm: "切换",
    cancel: "等它说完",
  },
  panels: {
    boardTitle: "课程看板",
    boardEmpty: "课程看板将在第 2 批接入：显示当前周、本周活动与下次起点。",
    notesTitle: "笔记",
    notesEmpty: "笔记面板将在第 3 批接入：在此编辑纯 Markdown 并实时预览。",
  },
  /** The 总控面板 tiles and 书房 rows (PANEL-PLAN `docs/desktop/PANEL-PLAN.md`). */
  panel: {
    /**
     * The last line of every 书房 button's prompt: 总控 shows the change in the
     * chat first and writes only after the user agrees (PANEL-PLAN 规则 9).
     */
    askConfirm: "先在聊天里告诉我你要改哪几行、改成什么，等我说可以再写文件；我只想先看看。",
    tileCycle: (cycle: string, week: number): string => `${cycle} · 第 ${week} 周`,
    /** Only the projection (panel v2): the planned end lives in 总进度's last line, not here. */
    tileCycleSub: (end: string): string => `预计 ${end.slice(5)} 收尾`,
    tileNoCycle: "不在周期内",
    tileItems: (done: number, total: number): string => `${done} / ${total} 项`,
    /** 「主攻日 · 先上 离散 D5」；日子类型空着（周期外）时只写先上那节。 */
    tileTodaySub: (typeName: string, next: string): string =>
      `${typeName === "" ? "" : `${typeName} · `}先上 ${next}`,
    /** 整合日 with 周核实 still to do: 「整合日 · 先做两门周核实」. */
    tileTodayVerify: (typeName: string, count: number): string => {
      const courses = count === 1 ? "" : count <= 4 ? `${"  两三四"[count]}门` : ` ${count} 门`;
      return `${typeName} · 先做${courses}周核实`;
    },
    tileAllDone: "今天的都做完了",
    tileWeekLeft: (count: number): string => (count === 0 ? "本周的都做完了" : `还剩 ${count} 项`),
    tileShelf: (count: number): string => `${count} 本在读`,
    tileShelfEnd: (short: string, end: string): string => `${short} 预计 ${end.slice(5)} 读完`,
    tileAnkiOff: "没开",
    tileAnkiOffSub: "打开 Anki 后显示今天的张数",
    tileAnki: (count: number): string => `${count} 张`,
    tileAnkiSub: "今天到期 · Anki 已打开",
    tileCards: (count: number): string => (count === 0 ? "全部已同步" : `${count} 张待同步`),
    tileCardsSub: (total: number, decks: number): string => `共 ${total} 张 · ${decks} 个牌组`,
    tileCardsBroken: (total: number, broken: number): string => `共 ${total} 张 · ${broken} 张格式不全`,
    /** The mode tag a 书房 row shows next to its progress. */
    shelfModes: { "after-self": "课后读 + 自读", self: "自读", guide: "导读课" } as Record<
      "after-self" | "self" | "guide",
      string
    >,
    /** A reading book's meta: 「预计 01-30 读完 · 目标 01-15，会晚 15 天」. */
    bookMeta: (end: string, target: string | null): string =>
      `预计 ${end.slice(5)} 读完` +
      // Two plain dates (panel v2): the learner compares them; no 「会晚 N 天」.
      (target === null ? "" : ` · 目标 ${target.slice(5)}`),
    bookPaused: (position: number): string => `已暂停 · 读到第 ${position} 段`,
    /** A queued book's meta: 「排在 Epp 后面 · 预计 02-10 读完」. */
    bookQueued: (after: string | null, end: string): string =>
      [after === null ? "" : `排在 ${after} 后面`, end === "" ? "" : `预计 ${end.slice(5)} 读完`]
        .filter((part) => part !== "")
        .join(" · "),
    /** A 带读 row's meta: 「周一、周三 · 预计 12-23 读完」. */
    guideMeta: (days: string[], end: string): string =>
      [days.join("、"), end === "" ? "" : `预计 ${end.slice(5)} 读完`]
        .filter((part) => part !== "")
        .join(" · "),
    /** Block headings (design `?d=dash`). */
    tileLabels: {
      cycle: "周期",
      today: "今天",
      week: "本周",
      shelf: "书房",
      anki: "Anki",
      cards: "卡片",
    } as Record<"cycle" | "today" | "week" | "shelf" | "anki" | "cards", string>,
    blockToday: "今天",
    blockWeek: "本周",
    blockMonth: "本月",
    blockProgress: "总进度",
    blockProgressCaption: "只算主课",
    blockShelf: "书房",
    blockShelfCaption: "书房排期 · 不设完结",
    blockCards: "卡片",
    blockUnplanned: "已登记、没排",
    blockTerms: "术语",
    blockTermsCaption: "最近两周存进 wiki 的 · 先背熟再刷 Anki",
    termsCount: (count: number): string => `${count} 个`,
    termsAll: "全部",
    termsEmpty: "最近两周的课还没存概念页。",
    termsFailed: "术语没读出来。",
    /** Hover text for a term whose page file is gone. */
    termsMissing: "页面不在了",
    /** 「离散 D3 · 11-12」 for one lesson's row. */
    termsLesson: (name: string, lesson: string | null, date: string): string =>
      `${lesson === null ? name : `${name} ${lesson}`} · ${date.slice(5)}`,
    blockLoading: "正在读…",
    /** Empty and failure copy per block. */
    shelfEmpty: "还没有在读的书。",
    shelfAdd: "加一本书",
    shelfQueuedNote: "排队",
    unplannedNone: "没有登记过、还没排的资料",
    cardsDeckHead: "牌组",
    cardsNew: "新卡片",
    cardsCount: "张数",
    cardsSync: "待同步",
    cardsDue: "今天到期",
    deckOther: (count: number): string => `其余 ${count} 个牌组`,
    /** Today-block lines and actions. */
    todayNone: "今天没有安排",
    actionOpen: "开课 →",
    actionResume: "接着上次 →",
    actionRead: "读完这段",
    actionOpenAnki: "打开 →",
    lastRecordCaption: "今天学过",
    todayLearnedNone: "今天学过：还没有",
    todayPrint: "打印",
    todaySettings: "技能与设置",
    bookRead: "读完这段",
    bookPause: "暂停",
    bookResume: "恢复",
    bookTarget: "设目标日期",
    bookMode: "改读法",
    bookTargetChange: "改目标",
    targetSave: "确定",
    targetClear: "清除目标",
    targetInvalid: "日期要写成 2027-01-15 这样（年-月-日）。",
    targetLabel: (short: string): string => `《${short}》的目标日期`,
    /** 总进度 sub lines under each main course. */
    progressNext: (id: string, date: string, isToday: boolean): string =>
      isToday ? `今天 ${id}` : `下一节 ${id} · ${date.slice(5)}`,
    progressLate: (id: string, date: string): string => `下一节 ${id} · 原排 ${date.slice(5)}`,
    /** 总进度's last-but-one line: the projection, with the planned end beside it when they differ. */
    progressCycle: (cycle: string, end: string, plannedEnd: string): string =>
      `${cycle} 按现在的进度 ${end.slice(5)} 收尾${plannedEnd !== "" && plannedEnd !== end ? `（原计划 ${plannedEnd.slice(5)}）` : ""}`,
    progressEnd: (date: string): string => `最后一节预计 ${date.slice(5)}`,
    progressFinished: "这个周期的课都上完了",
    progressNext2: (cycle: string, start: string): string => `下个周期 ${cycle} 预计 ${start.slice(5)} 开始`,
    progressRoute: (end: string): string => `整条路线预计 ${end} 结束`,
    cardsBroken: (count: number): string => `${count} 张格式不全（缺 END），不会同步`,
    /** 加一本书: the small form under the 书房 head. */
    addTitle: "书名",
    addModes: { self: "自读", guide: "导读课" } as Record<"self" | "guide", string>,
    addTargetOptional: "目标日期（可不填）",
    addSend: "交给总控",
    addCancel: "取消",
    addTitleMissing: "先写书名。",
    dialogClose: "关闭",
    backToToday: "回到今天",
  },
  data: {
    errorTitle: "数据操作失败",
    errorUnknown: "操作失败。",
    /** Copy for each failure code the data channel returns. */
    errors: {
      "vault-missing": "未配置知识库。请先在终端运行 xuegen 并完成初始化。",
      "script-failed": "读取知识库失败。",
      "invalid-request": "请求格式非法。",
      "skill-exists": "待审核技能已存在，请先删除或改名。",
      "skill-invalid": "技能未通过校验，已丢弃。",
      "skill-url": "只支持 https 仓库地址。",
      unknown: "操作失败。",
    },
    /** Label for each teaching style; kept in sync with TEACHING_STYLE_LABELS. */
    styles: {
      default: "默认",
      plain: "大白话",
      detailed: "细讲",
      deep: "深度",
    },
    ankiRunning: "Anki 已连接",
    ankiNotRunning: "Anki 未打开（卡片同步需要先启动 Anki 并安装 AnkiConnect）。",
    cardsDraft: "让学根起草",
    calendarWriteHint: "双击某天可写入当天笔记。",
  },
  gallery: {
    title: "皮肤画廊",
    description: "用固定样例渲染每个插槽与内容类型，供视觉审查与截图。",
    skinParam: "皮肤",
  },
} as const;

export type Strings = typeof strings;
