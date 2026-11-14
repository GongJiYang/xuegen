/**
 * 跨处一致性：同一份数据进几个视图，显示的事实相同。
 *
 * `CHECK-PROCESS-1111.md` 第 2 项：11-11 的 bug 都是同一件事在几处显示、各算各的
 * （今日卡说没完成、总进度说已完成；今日卡写张数、右侧面板不写；讲后读行带内部词）。
 * 现在四处都从同一份数据算（`CycleLesson.done`、`ankiDueCount`、`calendar.mjs` 的
 * 讲后读标题），这个文件把 `consistency-fixture.ts` 那一天同时喂给四处，断言四处
 * 说同一件事，防止以后又分叉。
 *
 * 视图函数（都是纯函数，输入数据、输出要显示的东西）：
 * - 今日卡：`controlCard`（`control-card.ts`）；
 * - 右侧今天面板：`cycleTodayView`（标题 / focus / aux）+ `ankiDueCount`（`cycle-today.ts`），
 *   按 bear `CycleToday` 的读法翻成它显示的文字（✓ = 已完成，`ankiDue` 的数字）；
 * - 总进度：`courseCards` + `auxRows`（`plan-view.ts`）；
 * - 日历当天详情：`dayLessons`（`plan-view.ts`），bear 与 chicago 的 `DayDetail` 都读它；
 *   讲后读一行读 `CalendarMonth.days[date].readingDue[].title`；
 * - 排程本（planbook）：`buildDay` / `buildWeek`（`planbook.ts`），今日卡的自读行与它的
 *   今天自读行必须是同一段。
 *
 * 断言失败时不要改这里去迎合产品代码，也不要放宽断言：先查是哪一处算错了。
 */

import { describe, expect, it } from "vitest";
import type { CycleMonth } from "@shared/data-protocol.js";
import { strings } from "../strings.js";
import { controlCard, type ControlCardRow } from "./control-card.js";
import {
  AFTER_READ_DATE,
  AFTER_READ_RANGE,
  AFTER_READ_TITLE,
  ANKI,
  CALENDAR_MONTH,
  COURSE_A,
  COURSE_B,
  COURSE_C,
  CYCLE_DAY,
  CYCLE_MONTH,
  OVERVIEW,
  QUEUE,
  SHELF,
  SHELF_LIST,
  TODAY,
} from "./consistency-fixture.js";
import { ankiDueCount, cycleTodayView } from "./cycle-today.js";
import { auxRows, courseCards, dayLessons } from "./plan-view.js";
import { buildDay, buildWeek, type PlanDay, type PlanItem, type PlanWeek } from "./planbook.js";
import { shelfPanel } from "./shelf-view.js";

/** 今日卡（总控）。 */
const CARD = controlCard({
  today: TODAY,
  day: CYCLE_DAY,
  calendar: CALENDAR_MONTH,
  queue: QUEUE,
  shelf: SHELF,
  anki: ANKI,
});

/** The 今日卡 rows that open a course session (the lesson rows). */
function cardLessonRows(): ControlCardRow[] {
  return (CARD?.rows ?? []).filter((row) => row.action?.kind === "study");
}

function cardRowFor(slug: string): ControlCardRow {
  const row = cardLessonRows().find((item) => item.action?.kind === "study" && item.action.slug === slug);
  if (!row)
    throw new Error(
      `今日卡没有 ${slug} 这一节：${JSON.stringify(cardLessonRows().map((item) => item.text))}`,
    );
  return row;
}

/** 右侧今天面板：今天的视角（focus 是当天的第一门主项课）。 */
const PANEL = cycleTodayView(CYCLE_DAY, null);

/**
 * 右侧面板的视角，其中 `slug` 这节课排在当天课表最前面。
 *
 * 面板只把当天第一门主项课画在最上面（其余主项课它不画），所以 A、B 各要轮流当一
 * 次第一节课，才能都过一遍同一个视图函数。改的只是顺序：课次行连同 `done` 仍是同一
 * 份 `CycleDay.lessons`。
 */
function panelViewFor(slug: string) {
  const lessons = [...CYCLE_DAY.lessons].sort((left, right) =>
    left.course === slug ? -1 : right.course === slug ? 1 : 0,
  );
  return cycleTodayView({ ...CYCLE_DAY, course: slug, lessons }, null);
}

/** The lesson row the 右侧面板 puts on screen for `slug`, or null when it shows none. */
function panelLesson(view: typeof PANEL, slug: string): { id: string; done: boolean } | null {
  const focus = view?.focus;
  const fromFocus = focus?.kind === "lesson" && focus.lesson.course === slug ? focus.lesson : null;
  const fromAux = view?.aux?.lesson.course === slug ? view.aux.lesson : null;
  const lesson = fromFocus ?? fromAux;
  return lesson ? { id: lesson.id, done: lesson.done === true } : null;
}

/** 日历当天详情（bear / chicago 的 `DayDetail` 读它）。 */
const CALENDAR_LESSONS = dayLessons(CYCLE_MONTH, TODAY);

function calendarLesson(slug: string): { id: string; done: boolean; aux: boolean } {
  const name = CYCLE_MONTH.names[slug];
  const lesson = CALENDAR_LESSONS.find((item) => item.name === name);
  if (!lesson) throw new Error(`日历当天详情没有 ${slug}：${JSON.stringify(CALENDAR_LESSONS)}`);
  return { id: lesson.id, done: lesson.done, aux: lesson.aux };
}

/** 总进度（课程卡 + 带读行）。 */
const CARDS = courseCards(OVERVIEW, TODAY);
const AUX_ROWS = auxRows(OVERVIEW);

function progressCard(slug: string) {
  const card = CARDS.find((item) => item.slug === slug);
  if (!card) throw new Error(`总进度没有 ${slug}`);
  return card;
}

/**
 * One place's user-facing text, as that place renders it today.
 *
 * A label is only included when the component would actually draw it (an aux tag
 * only when there is an aux row), so scanning these lists for 带读 / 辅助 says
 * something about the screen rather than about `strings.ts`.
 */
function textsOf(place: "card" | "panel" | "progress" | "calendar"): string[] {
  if (place === "card") {
    return [
      ...(CARD ? [CARD.headline] : []),
      ...(CARD?.rows ?? []).flatMap((row) => [row.text, row.sub ?? "", row.button ?? ""]),
    ];
  }
  if (place === "panel") {
    const aux = PANEL?.aux;
    return [
      PANEL?.headline ?? "",
      PANEL && PANEL.focus.kind === "lesson" ? PANEL.focus.name : "",
      ...(PANEL?.missed ?? []).map((row) => row.name),
      PANEL?.tomorrow ?? "",
      ...(aux ? [strings.cycle.auxTag, aux.name, aux.lesson.id, aux.lesson.content] : []),
      ANKI.running && ankiDueCount(ANKI) !== null
        ? strings.cycle.ankiDue(ankiDueCount(ANKI) ?? 0)
        : strings.cycle.ankiOff,
    ];
  }
  if (place === "progress") {
    return [
      ...(AUX_ROWS.length > 0 ? [strings.plan.auxTitle, strings.plan.auxNote] : []),
      ...AUX_ROWS.flatMap((row) => [row.label, row.subjectName]),
      ...CARDS.flatMap((card) => [card.name, card.subject, card.next?.text ?? ""]),
    ];
  }
  return CALENDAR_LESSONS.flatMap((lesson) => [
    lesson.name,
    lesson.id,
    lesson.content,
    lesson.aux ? strings.cycle.auxTag : "",
  ]);
}

/** Every integer a rendered string shows. */
function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d+/g)].map((match) => Number(match[0]));
}

describe("同一份数据进四处视图", () => {
  it("这一天在今日卡上：A、B、C 三节各一行", () => {
    expect(CARD).not.toBeNull();
    expect(cardLessonRows().map((row) => row.text)).toEqual([
      "CTM D2 · Ch2 §2.1 递归与迭代",
      "离散 D5 · Ch3 §3.1 谓词与量词",
      "导读课 · Effective C D3 · Ch3 资源管理",
    ]);
  });

  it("完成状态（A 已收课）：今日卡 = 右侧面板 = 日历，总进度也算进去", () => {
    // 今日卡：✓ 记号 + 「回到这节课 →」。
    expect(cardRowFor(COURSE_A).mark).toBe("done");
    expect(cardRowFor(COURSE_A).button).toBe(strings.control.card.backToLesson);

    // 右侧今天面板：focus.lesson.done → CycleToday 画 ✓、按钮换「回到这节课 →」。
    expect(panelLesson(panelViewFor(COURSE_A), COURSE_A)).toEqual({ id: "D2", done: true });

    // 日历当天详情：lesson.done → DayDetail 画 ✓。
    expect(calendarLesson(COURSE_A)).toEqual({ id: "D2", done: true, aux: false });

    // 总进度：A 的已完成数包含今天这节。
    const card = progressCard(COURSE_A);
    expect(card.lessons.find((lesson) => lesson.id === "D2")?.done).toBe(true);
    expect(card.done).toBe(2);
    expect(card.lessons.filter((lesson) => lesson.done).map((lesson) => lesson.id)).toEqual(["D1", "D2"]);
  });

  it("完成状态（B 未上）：今日卡 = 右侧面板 = 日历，三处都不算完成", () => {
    expect(cardRowFor(COURSE_B).mark).not.toBe("done");
    expect(cardRowFor(COURSE_B).button).toBe(strings.control.card.study);

    expect(panelLesson(panelViewFor(COURSE_B), COURSE_B)).toEqual({ id: "D5", done: false });

    expect(calendarLesson(COURSE_B)).toEqual({ id: "D5", done: false, aux: false });
  });

  it("完成状态（C 导读课已收课）：今日卡 = 右侧面板 = 日历，三处都是完成", () => {
    expect(cardRowFor(COURSE_C).mark).toBe("done");
    expect(cardRowFor(COURSE_C).button).toBe(strings.control.card.backToLesson);

    expect(panelLesson(panelViewFor(COURSE_C), COURSE_C)).toEqual({ id: "D3", done: true });
    expect(PANEL?.aux?.lesson.course).toBe(COURSE_C);

    expect(calendarLesson(COURSE_C)).toEqual({ id: "D3", done: true, aux: true });
  });

  it("Anki 张数：今日卡文字里的数字 = 右侧面板的数字 = 42", () => {
    const expected = 20 + 22;

    const cardRow = (CARD?.rows ?? []).find((row) => row.action?.kind === "anki");
    expect(cardRow).toBeDefined();
    const cardText = cardRow?.text ?? "";
    expect(cardText).toBe(strings.control.card.ankiRowDue(expected));

    // 右侧今天面板：CycleToday 的 ankiMeta。
    const panelDue = ankiDueCount(ANKI);
    expect(panelDue).toBe(expected);
    const panelText = panelDue === null ? strings.cycle.ankiOff : strings.cycle.ankiDue(panelDue);
    expect(panelText).toBe(strings.cycle.ankiDue(expected));

    // 比的是两处文字里各自显示的数字，不是直接比 42。
    expect(numbersIn(cardText)).toEqual([expected]);
    expect(numbersIn(cardText)).toEqual(numbersIn(panelText));
  });

  it("课后读：今日卡与日历当天详情都不含「核心页」，都含「§1.1–1.4」", () => {
    // 今日卡：数据里还是「讲后读」，给人看的是「课后读 · 离散 §1.1–1.4」（课程简称 + 范围，
    // 面板 v2）；过期的那一行下面只多一行灰字「原排 11-10」。
    const cardRow = (CARD?.rows ?? []).find((row) =>
      row.text.startsWith(strings.control.card.afterReadPrefix),
    );
    const cardText = cardRow?.text ?? "";
    expect(cardText).toBe(`${strings.control.card.afterReadPrefix}离散 ${AFTER_READ_RANGE}`);
    expect(cardText).toContain(AFTER_READ_RANGE);
    expect(cardText).not.toContain("核心页");
    expect(cardRow?.sub).toBe(strings.control.card.missedSub(AFTER_READ_DATE));

    // 今日卡的「读完了」写回课程页时用的 label，就是从日历标题里解析出的范围（不是标题原文）。
    const action = cardRow?.action;
    expect(action?.kind).toBe("afterRead");
    expect(action?.kind === "afterRead" ? action.labels : null).toEqual([AFTER_READ_RANGE]);

    // 日历当天详情：讲后读列在它原定的那天（bear / chicago 的 DayDetail 读 readingDue.title）。
    const calendarReading = CALENDAR_MONTH.days[AFTER_READ_DATE]?.readingDue.map((item) => item.title) ?? [];
    expect(calendarReading).toEqual([AFTER_READ_TITLE]);
    expect(calendarReading[0]).toContain(AFTER_READ_RANGE);
    expect(calendarReading.filter((title) => title.includes("核心页"))).toEqual([]);
  });

  it("导读课叫法：四处的标签都是「导读课」，任何一处都不出现「带读」「辅助」", () => {
    // 给人看的名字是「导读课」（panel v2 改名，设计稿第四节）；数据里的 `aux` 不变。
    const aux = "导读课";
    expect(strings.cycle.auxTag).toBe(aux);
    expect(strings.plan.auxTitle).toBe(aux);
    expect(strings.control.card.auxPrefix).toBe("导读课 · ");

    // 一处一处地看它实际画的标签。
    expect(cardRowFor(COURSE_C).text.startsWith(strings.control.card.auxPrefix)).toBe(true);
    expect(PANEL?.aux).not.toBeNull();
    expect(AUX_ROWS.some((row) => row.course?.slug === COURSE_C)).toBe(true);
    expect(calendarLesson(COURSE_C).aux).toBe(true);

    for (const place of ["card", "panel", "progress", "calendar"] as const) {
      const texts = textsOf(place);
      expect(
        texts.some((text) => text.includes(aux)),
        `${place} 没有「导读课」`,
      ).toBe(true);
      expect(
        texts.filter((text) => text.includes("带读") || text.includes("辅助")),
        `${place} 出现了旧叫法`,
      ).toEqual([]);
    }
  });

  it("自读今天的段：今日卡 = 排程本今天，`position: 3` 的书写今天读第 4 段 pp.28–36", () => {
    // 今日卡：`shelf.today` 给的那一段（后 3 段已读，今天读第 4 段）。
    const cardRow = (CARD?.rows ?? []).find((row) => row.action?.kind === "shelfDone");
    expect(cardRow?.text).toBe(
      strings.control.card.shelfPlanned +
        strings.control.card.shelfChunk("HTSP", { title: "第 4 段", from: 28, to: 36 }),
    );

    // 排程本：`shelf.list` 今天的自读行（`missed` 的过去行不算今天）。
    const planbookInput = {
      today: TODAY,
      cycleMonths: [CYCLE_MONTH],
      calendarMonths: [CALENDAR_MONTH],
      shelf: SHELF_LIST,
      overview: OVERVIEW,
      courses: [],
      anki: ANKI,
    };
    const selfOf = (day: PlanDay): PlanItem[] => day.items.filter((item) => item.lane === "self");
    const todaySelf = selfOf(buildDay(planbookInput, TODAY));
    expect(todaySelf).toEqual([
      // 今天只有主项课标 ●；自读是 ○。
      {
        lane: "self",
        text: "HTSP 第 4 段 pp.28–36",
        short: "HTSP pp.28–36",
        mark: "plan",
        slug: "how-to-solve-it",
        id: null,
      },
    ]);
    // 周视图与日视图说同一件事。
    const week = buildWeek(planbookInput);
    const weekToday = week.days.find((day) => day.date === TODAY);
    expect(weekToday ? selfOf(weekToday) : null).toEqual(todaySelf);

    // 两处指的是同一段：段号与页码都写在两边的文字里。
    const cardText = cardRow?.text ?? "";
    const selfText = todaySelf[0]?.text ?? "";
    expect(cardText).toContain("pp.28–36");
    expect(selfText).toContain("pp.28–36");
    for (const text of [cardText, selfText]) expect(numbersIn(text)).toEqual([4, 28, 36]);

    // 第三处：阅读面板的「今天：…」也是这一段。
    const shelfNext = shelfPanel(SHELF_LIST, TODAY).planned?.next ?? "";
    expect(shelfNext.startsWith(strings.reading.shelfToday(""))).toBe(true);
    expect(shelfNext).toContain("pp.28–36");
    expect(numbersIn(shelfNext)).toEqual(numbersIn(cardText));

    // 过去没读的原定日是 warn 且带说明，不是今天那段。
    const past = week.days.filter((day) => day.date < TODAY).flatMap(selfOf);
    expect(past.length).toBeGreaterThan(0);
    expect(past.map((item) => item.mark)).toEqual(past.map(() => "warn"));
    expect(past.every((item) => item.text.endsWith(strings.planbook.selfMissed))).toBe(true);
    expect(past.some((item) => item.text.includes("pp.28–36"))).toBe(false);
  });

  it("没学的课：今日卡、右侧面板、排程本对同一份 overdue 说同样的「课程 → 节数」", () => {
    // 另一门主项课 D（不在今天的课表里）：让它也有一节没上，凑成「两课三节」。
    const courseD = "probability-101";
    const missed = [
      { course: COURSE_B, id: "D2", content: "Ch1 §1.3 集合运算", date: "2026-11-06" },
      { course: COURSE_B, id: "D3", content: "Ch2 §2.2 条件语句", date: "2026-11-09" },
      { course: courseD, id: "P1", content: "样本空间", date: "2026-11-10" },
    ];
    const expected = new Map([
      [COURSE_B, 2],
      [courseD, 1],
    ]);

    // 三处都吃同一份 overdue：今日卡与右侧面板吃 cycle.day 的 `overdue`，排程本
    // 自己从 cycle.month 过去几天的未完成课次里数——两边必须数出同样的节数。
    const missedDay = { ...CYCLE_DAY, names: { ...CYCLE_DAY.names, [courseD]: "概统" }, overdue: missed };
    const missedMonth: CycleMonth = {
      ...CYCLE_MONTH,
      lessons: {
        ...CYCLE_MONTH.lessons,
        "2026-11-06": [{ course: COURSE_B, id: "D2", content: "Ch1 §1.3 集合运算" }],
        "2026-11-09": [{ course: COURSE_B, id: "D3", content: "Ch2 §2.2 条件语句" }],
        [AFTER_READ_DATE]: [
          ...(CYCLE_MONTH.lessons[AFTER_READ_DATE] ?? []),
          { course: courseD, id: "P1", content: "样本空间" },
        ],
      },
      names: { ...CYCLE_MONTH.names, [courseD]: "概统" },
    };

    // 右侧面板：missed 每行自带 count。
    const panel = cycleTodayView(missedDay, null);
    expect(new Map((panel?.missed ?? []).map((row) => [row.course, row.count]))).toEqual(expected);

    // 排程本：周视图 overdue 每行自带 count。
    const week: PlanWeek = buildWeek({
      today: TODAY,
      cycleMonths: [missedMonth],
      calendarMonths: [CALENDAR_MONTH],
      shelf: SHELF_LIST,
      overview: OVERVIEW,
      courses: [],
      anki: ANKI,
    });
    expect(new Map(week.overdue.map((row) => [row.course, row.count]))).toEqual(expected);

    // 今日卡：不想再数「没学」了（panel v2），改用两个新信号——灰字小行「原排 …」
    // 和合并行的「起 N 节」——去数同一组课：一门课一行，节数写在行文字里。
    const card = controlCard({
      today: TODAY,
      day: missedDay,
      calendar: CALENDAR_MONTH,
      queue: QUEUE,
      shelf: SHELF,
      anki: ANKI,
    });
    const missedRows = (card?.rows ?? []).filter(
      (row) => row.action?.kind === "study" && (row.sub ?? "").startsWith("原排"),
    );
    const cardCounts = new Map(
      missedRows.map((row) => {
        const slug = row.action?.kind === "study" ? row.action.slug : "";
        const count = Number(row.text.match(/(\d+) 节$/)?.[1] ?? 1);
        return [slug, count];
      }),
    );
    expect(cardCounts).toEqual(expected);
    // 顺带：文字与排序（最早的那节排前面），并且都是普通 ○，不是黄色警示。
    expect(missedRows.map((row) => row.text)).toEqual([
      strings.control.card.missedMany("离散", "D2", 2),
      strings.control.card.missedRow("概统", "P1", "样本空间"),
    ]);
  });
});
