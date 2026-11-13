/**
 * What the 总控 panel's 书房 buttons say in the chat.
 *
 * The panel never writes the shelf itself (PANEL-PLAN 「改库 / 撤销」): each button
 * asks 总控 in words and 总控 runs the skill. The UI rule is that the agent shows
 * the change in the chat first and writes only after the user agrees, so every
 * prompt ends with `strings.panel.askConfirm`. Pure functions, so they are tested
 * like the rest of the board's view models.
 */

import { strings } from "../strings.js";
import { withActionMarker } from "../chat/action-marker.js";

/** The book a 书房 row stands for. */
export interface AskBook {
  slug: string;
  /** The book's two-or-three-character short name (「Epp」), used in the fold label. */
  short: string;
}

/** What the 加书 dialog collected. */
export interface AddBookRequest {
  /** The full title the user typed (the book has no shelf page yet). */
  title: string;
  slug: string;
  /** The subject a 带读 course belongs to; "" when the book is read on its own. */
  subject: string;
  mode: "guide" | "self";
  /** The weekdays a 带读 book is read on (「周一」…); empty means 学根 asks. */
  days: string[];
  /** Target finish date `YYYY-MM-DD`, or null for none. */
  target: string | null;
}

/** 「目标日期 2027-01-15（bookshelf.mjs target …，只用来对比）」，or nothing. */
function targetClause(slug: string, target: string | null): string {
  if (target === null) return "";
  return ` 目标日期 ${target}（node bookshelf.mjs target "<库根>" ${slug} --date ${target}；它只用来对比，不为赶目标加页数、不改每天一段的规矩）。`;
}

/** The 自读 path: the reading skill builds the shelf page and the daily blocks. */
function selfBookText(request: AddBookRequest): string {
  const { slug } = request;
  return (
    `/skill:reading 把《${request.title}》（${slug}）加进书房自读：` +
    "先找原文（库里的 raw/books/ 下或我给的路径）并在 wiki/knowledge/sources/ 登记，再建 " +
    `wiki/shelf/${slug}.md（## 分段 按目录的章、节顺序列，每天一段、一段 ≤ 10 页），` +
    `然后跑 node bookshelf.mjs plan "<库根>" ${slug} --write 与 node bookshelf.mjs index "<库根>" --write。` +
    "计划外已经有一本在读时，先问我是换掉还是排队。" +
    targetClause(slug, request.target)
  );
}

/** The 带读 path: an aux course in the cycle, planned on the chosen weekdays. */
function guideBookText(request: AddBookRequest): string {
  const days = request.days.length > 0 ? `只排在${request.days.join("、")}` : "先问我要排哪几天";
  const subject = request.subject === "" ? "" : `（科目：${request.subject}）`;
  return (
    `/skill:course 把《${request.title}》（${request.slug}）排成带读：` +
    `按 course 技能「学习周期里的课」建一门带读课${subject}，${days}，` +
    "每次不超过 45 分钟、只做概览与术语、不出检查题；同一天只排一本带读，和已有的带读撞上就先问我换哪天。" +
    "书页按 reading 技能的「带读」读法处理。" +
    targetClause(request.slug, request.target)
  );
}

/** 加书: put a book into 书房, read on its own or as a 带读 course. */
export function addBookPrompt(request: AddBookRequest): string {
  const text = request.mode === "guide" ? guideBookText(request) : selfBookText(request);
  // The book is not on the shelf yet, so the marker carries the title the user typed.
  return withActionMarker(`${text}\n${strings.panel.askConfirm}`, "ask", {
    slug: request.slug,
    title: request.title,
  });
}

/** 改读法: ask which of the three readings the user wants, then change it by the skill. */
export function changeModePrompt(book: AskBook): string {
  const text =
    `/skill:reading 改《${book.short}》（${book.slug}）的读法：先问我想换成哪一种——` +
    "讲后读（跟主项课：课上定要读的页、隔天读）、带读（学根陪读，每次 ≤ 45 分钟，数据上是 course 的带读课）、" +
    "自读（自己读原文，每天一段）；我说定之后再按 reading 与 course 技能改。";
  return withActionMarker(`${text}\n${strings.panel.askConfirm}`, "ask", { slug: book.slug, title: book.short });
}

/** 设目标: set or clear the target finish date through `bookshelf.mjs target`. */
export function setTargetPrompt(book: AskBook, date: string | null): string {
  const text =
    date === null
      ? `/skill:reading 清掉《${book.short}》（${book.slug}）的目标日期：` +
        `node bookshelf.mjs target "<库根>" ${book.slug} --clear，之后看进度时不再提目标。`
      : `/skill:reading 给《${book.short}》（${book.slug}）设目标日期 ${date}：` +
        `node bookshelf.mjs target "<库根>" ${book.slug} --date ${date}；` +
        "它只用来对比（list / today 会多出 target、targetLate，告诉我预计哪天读完、比目标晚几天），不为赶目标加页数、不改每天一段的规矩。";
  return withActionMarker(`${text}\n${strings.panel.askConfirm}`, "ask", { slug: book.slug, title: book.short });
}

/** 暂停: stop a book's schedule — the shelf script, or the 带读 course's plan. */
export function pausePrompt(book: AskBook): string {
  const text =
    `/skill:course 暂停《${book.short}》（${book.slug}）：自读的书用 node bookshelf.mjs pause "<库根>" ${book.slug} ` +
    "（停在当前进度、不再往后排）；如果它是带读课，就按 course 技能改那门课的排期，把之后的带读停掉。恢复时我再说。";
  return withActionMarker(`${text}\n${strings.panel.askConfirm}`, "ask", { slug: book.slug, title: book.short });
}

/** 恢复: put a paused book back on the schedule. */
export function resumePrompt(book: AskBook): string {
  const text =
    `/skill:course 恢复《${book.short}》（${book.slug}）：自读的书用 node bookshelf.mjs resume "<库根>" ${book.slug} ` +
    "（明天接着读同一段、不跳段）；如果它是带读课，按 course 技能把那门课的带读接着排上。";
  return withActionMarker(`${text}\n${strings.panel.askConfirm}`, "ask", { slug: book.slug, title: book.short });
}
