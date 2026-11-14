/**
 * 开下一周期 view models (design plan2 第 7、8 屏, PLANBOOK-1111 §5).
 *
 * The wizard never writes the vault: it collects five answers and hands them to
 * 总控 in one message, and 总控 runs the cycle-plan skill (stage → check → the
 * user agrees → commit, one undoable 「开周期」 commit). Pure functions here; the
 * hook in `use-next-cycle.ts` holds the state and the data requests.
 */

import type {
  CycleAccept,
  CycleOverview,
  CyclePreviewDay,
  SubjectInfo,
} from "@shared/data-protocol.js";
import { withActionMarker } from "../chat/action-marker.js";
import { strings } from "../strings.js";
import type { UnplannedMaterial } from "./panel.js";
import { bookTitle } from "./panel.js";
import { daysBetween } from "./plan-view.js";
import { addDays } from "./planbook-range.js";

export type Shortfall = "recover" | "partial";
export type MainFrom = "continue" | "fresh";

/** The 本周 banner: shown from the planned last week of a cycle that has a next one. */
export interface NextCycleBanner {
  text: string;
  cycle: string;
  next: string;
}

export function nextCycleBanner(overview: CycleOverview | null): NextCycleBanner | null {
  const cycle = overview?.cycle;
  if (overview === null || overview === undefined || !cycle || cycle.next === null) return null;
  // The planned end, not the projected one: slipped lessons should not hide
  // the question of whether to make them up or move on.
  if (daysBetween(overview.date, cycle.plannedEnd) > 6) return null;
  const text =
    cycle.delayDays > 0
      ? strings.nextCycle.bannerLate(cycle.cycle, cycle.next.cycle, cycle.delayDays)
      : strings.nextCycle.banner(cycle.cycle, cycle.next.cycle);
  return { text, cycle: cycle.cycle, next: cycle.next.cycle };
}

/** One main course of the cycle being accepted. */
export interface AcceptRow {
  slug: string;
  name: string;
  met: boolean;
  lessons: string;
  goalsLine: string;
  goals: { text: string; done: boolean }[];
}

export function acceptRows(accept: CycleAccept, names: Readonly<Record<string, string>>): AcceptRow[] {
  return accept.courses.map((course) => {
    const goalsDone = course.goals.filter((goal) => goal.done).length;
    return {
      slug: course.slug,
      name: names[course.slug] ?? course.title,
      met: course.lessons.remaining.length === 0 && goalsDone === course.goals.length,
      lessons: strings.nextCycle.acceptLessons(course.lessons.done, course.lessons.total, course.lessons.remaining),
      goalsLine: strings.nextCycle.acceptGoals(goalsDone, course.goals.length),
      goals: course.goals.map((goal) => ({
        text: goal.level === "" ? goal.text : `${goal.level}：${goal.text}`,
        done: goal.done,
      })),
    };
  });
}

/** The new cycle's first day: the route row's start, a week later after a 恢复周. */
export function nextStart(accept: CycleAccept, shortfall: Shortfall | null): string | null {
  if (accept.next === null) return null;
  return shortfall === "recover" ? addDays(accept.next.start, 7) : accept.next.start;
}

/** One subject on the 选主项 step. */
export interface MainOption {
  slug: string;
  name: string;
  suggested: boolean;
  /** It is a 导读课 subject in the cycle being closed. */
  guide: boolean;
}

/** The route's suggestions first (in route order), then every other subject page. */
export function mainOptions(
  subjects: readonly SubjectInfo[],
  suggested: readonly string[],
  guides: readonly string[],
): MainOption[] {
  const option = (subject: SubjectInfo): MainOption => ({
    slug: subject.slug,
    name: subject.title,
    suggested: suggested.includes(subject.slug),
    guide: guides.includes(subject.slug),
  });
  const first = suggested
    .map((slug) => subjects.find((subject) => subject.slug === slug))
    .filter((subject): subject is SubjectInfo => subject !== undefined);
  const rest = subjects.filter((subject) => !suggested.includes(subject.slug));
  return [...first, ...rest].map(option);
}

/** Tick or untick a main subject; a third tick is ignored (at most two mains). */
export function toggleMain(mains: readonly string[], slug: string): string[] {
  if (mains.includes(slug)) return mains.filter((item) => item !== slug);
  return mains.length < 2 ? [...mains, slug] : [...mains];
}

/** One registered material a main subject could be taught from. */
export interface MaterialOption {
  title: string;
  meta: string;
}

/** Seven weeks of lessons need a whole book or course; articles and tools stay references. */
const MAIN_TYPES = ["书籍", "在线书籍", "公开课", "视频"];

function teachable(subject: SubjectInfo): SubjectInfo["materials"] {
  return subject.materials.filter((material) => MAIN_TYPES.includes(material.type));
}

/** The book's name without the chapter list some pages write after 「 --- 」. */
function materialTitle(raw: string): string {
  return bookTitle(raw).split(/\s+-{3}\s+/)[0] ?? "";
}

export function materialOptions(subject: SubjectInfo): MaterialOption[] {
  return teachable(subject).map((material) => ({
    title: materialTitle(material.title),
    meta: [material.type, material.role, material.status].filter((part) => part !== "").join(" · "),
  }));
}

/** Pre-pick the 主线 material, else the first one. */
export function defaultMaterial(subject: SubjectInfo): string | null {
  const options = teachable(subject);
  const main = options.find((material) => material.role.includes("主线")) ?? options[0];
  return main === undefined ? null : materialTitle(main.title);
}

/** The key a 书房 candidate is ticked by. */
export function shelfKey(material: UnplannedMaterial): string {
  return `${material.subject}/${material.title}`;
}

/** One day of the new cycle's first week, ready to print in the mini grid. */
export interface PreviewCell {
  date: string;
  label: string;
  main: string;
  aux: string | null;
  deep: boolean;
}

export function previewCells(days: readonly CyclePreviewDay[], mains: readonly string[]): PreviewCell[] {
  return days.map((day) => {
    const deep = day.type === "深度";
    const name = day.name ?? day.subject ?? "";
    return {
      date: day.date,
      label: `${day.weekday.replace(/^周/, "")} ${day.date.slice(5)}`,
      main: deep ? `${name}${day.unchanged === true ? strings.nextCycle.previewUnchanged : ""}` : day.type,
      // A 导读课 whose subject becomes a main stops, so its aux slot goes away.
      aux:
        day.aux === null || mains.includes(day.aux)
          ? null
          : strings.nextCycle.previewAux(day.auxName ?? day.aux),
      deep,
    };
  });
}

/** What the five steps collected. */
export interface NextCycleChoice {
  accept: CycleAccept;
  rows: AcceptRow[];
  shortfall: Shortfall | null;
  start: string;
  mains: { slug: string; name: string; material: string | null; from: MainFrom | null }[];
  shelf: { title: string; subjectTitle: string }[];
}

/** The message 总控 gets: every answer, then the transaction rule. */
export function nextCyclePrompt(choice: NextCycleChoice): string {
  const { accept, rows, shortfall } = choice;
  const next = accept.next?.cycle ?? "";
  const accepted = rows.map((row) => `${row.name} ${row.lessons} · ${row.goalsLine}`).join("；");
  const unmet = rows.filter((row) => !row.met).map((row) => row.name);
  const decision =
    shortfall === null || unmet.length === 0
      ? "都达标了。"
      : shortfall === "recover"
        ? `没达标的：${strings.nextCycle.recover}（${strings.nextCycle.recoverMeta(next)}）。`
        : `没达标的：${strings.nextCycle.partial(next, unmet.join("、"))}（${strings.nextCycle.partialMeta(accept.cycle)}）。`;
  const mains = choice.mains.map((main) => `${main.name}（${main.slug}）`).join("、");
  const materials = choice.mains
    .map((main) => {
      if (main.material === null) return `${main.name} 的主资料先问我`;
      const from =
        main.from === null
          ? ""
          : `，${main.from === "continue" ? strings.nextCycle.fromContinue : strings.nextCycle.fromFresh}`;
      return `${main.name} 用《${main.material}》${from}`;
    })
    .join("；");
  const shelf =
    choice.shelf.length === 0
      ? "书房：不加。"
      : `书房加：${choice.shelf.map((book) => `《${book.title}》（${book.subjectTitle}）`).join("、")}，读法、星期几和目标日期逐本问我。`;
  const text = [
    `/skill:cycle-plan 开下一周期 ${next}（我在向导里选好了，按「新建周期」直接到第 5 步）：`,
    `1. 验收 ${accept.cycle}：${accepted}。${decision}`,
    `2. 主项：${mains}。`,
    `3. 主资料：${materials}。`,
    `4. ${shelf}`,
    `5. 从 ${choice.start} 开始，周模板沿用 ${accept.cycle}。`,
    "用 cycle_open 先 stage、改暂存副本、跑 check，把第一周预览和要改的文件给我看，我说可以再 commit；主课按 course_plan 排。",
  ].join("\n");
  return withActionMarker(text, "next-cycle");
}
