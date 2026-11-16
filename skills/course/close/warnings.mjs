// check 的提醒（不挡提交、不影响 ok）：收课常漏的两步——主课忘了写课后读、学习记录超 2 条
// 忘了归档。决策是纯函数 closeWarnings（配同名测试）；gatherCloseWarnings 是 IO 外壳：
// 读暂存与库里的课程页/书页、判本课是否本周期主课（同 closeBrief：loadCourses 里
// role === "main"），供 course-close.mjs 的 check 调用。issue「收课提速」第 2 轮返修。
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { findCycle, loadCourses, loadElasticCycles } from "../../cycle-plan/cycle.mjs";
import { localDate } from "./durable.mjs";
import { addedCompletedIds, afterSectionRows, recordBlocks, RECORD_HEADING_RE } from "./rules.mjs";

export const AFTER_READ_WARNING = "主课收课还没写课后读：用 course_close after-read 写进书页";
export const ARCHIVE_WARNING = "学习记录超过 2 条：先用 course_close archive 归档";

/** 「## 课后读」一节相比基线有没有新行（非空行按多重集比）。stagedText 为 null 当没有新行。 */
function hasNewAfterReadRows(baseText, stagedText) {
  if (stagedText === null) return false;
  const left = new Map();
  for (const row of afterSectionRows(baseText ?? "")) left.set(row, (left.get(row) ?? 0) + 1);
  for (const row of afterSectionRows(stagedText)) {
    const count = left.get(row) ?? 0;
    if (count === 0) return true;
    left.set(row, count - 1);
  }
  return false;
}

/**
 * 收课 check 的提醒文本（纯函数，返回 [] 表示没有要提醒的）：
 * - 主课本次新勾了课次（addedCompletedIds 非空）、链着书（book 非空）、而暂存书页
 *   「## 课后读」相比基线没有新行 → 提醒写课后读；
 * - 课程页「## Learning Record」里标题匹配 RECORD_HEADING_RE 的块超过 2 条 → 提醒先归档。
 */
export function closeWarnings({ isMain, book, baseCourseText, courseText, baseBookText, bookText }) {
  const warnings = [];
  if (
    isMain &&
    book !== null &&
    addedCompletedIds(baseCourseText, courseText ?? "").length > 0 &&
    !hasNewAfterReadRows(baseBookText, bookText)
  ) {
    warnings.push(AFTER_READ_WARNING);
  }
  const records =
    courseText === null
      ? 0
      : recordBlocks(courseText).filter((block) => RECORD_HEADING_RE.test(block.heading)).length;
  if (records > 2) warnings.push(ARCHIVE_WARNING);
  return warnings;
}

/**
 * check 的提醒（IO 外壳）。提醒不是校验：周期文件缺失或损坏时判不出主课，
 * 就跳过课后读提醒——绝不能让 check 因此失败。
 */
export async function gatherCloseWarnings(staging, manifest, today = localDate()) {
  const read = (base, rel) => {
    const file = join(base, rel);
    return existsSync(file) && statSync(file).isFile() ? readFileSync(file, "utf8") : null;
  };
  const courseRel = `wiki/courses/${manifest.slug}.md`;
  const book = manifest.book ?? null;
  const bookRel = book === null ? null : `wiki/shelf/${book}.md`;
  let isMain = false;
  try {
    const cycle = findCycle(await loadElasticCycles(manifest.vault), today);
    const courses = cycle ? await loadCourses(manifest.vault, cycle) : new Map();
    isMain = courses.get(manifest.slug)?.role === "main";
  } catch {
    /* 判不出主课就不发课后读提醒 */
  }
  return closeWarnings({
    isMain,
    book,
    baseCourseText: read(manifest.vault, courseRel),
    courseText: read(staging, courseRel),
    baseBookText: bookRel === null ? null : read(manifest.vault, bookRel),
    bookText: bookRel === null ? null : read(staging, bookRel),
  });
}
