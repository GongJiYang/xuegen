/**
 * Data channel handler: routes one `DataRequest` to a skill script (or Anki,
 * or the skills inventory) and returns a `DataResponse`.
 *
 * This is the only place vault effects originate. Every request is mapped to a
 * whitelisted script subcommand; there is no generic "run this file" path, so a
 * malformed request cannot reach an unintended command.
 */

import { join } from "node:path";
import type { DataRequest, DataResponse } from "../../shared/data-protocol.js";
import { assertNever, normalizeDesktopSettings } from "../../shared/protocol.js";
import { readSettings, writeSettings } from "../settings.js";
import { runScript, runScriptPlain } from "./scripts.js";
import { generatedDir, readVaultRoot } from "./vault.js";
import { ankiUrlOverride, fetchAnkiStatus } from "./anki.js";
import { SkillError, discardSkill, fetchSkill, listSkills, promotePendingSkill, reviewSkill } from "./skills.js";
import { listReadingSources } from "./sources.js";
import { listSessions } from "./sessions.js";
import { resolveHome } from "../../agent/environment.js";
import { todayOverride } from "../today.js";

/**
 * A first full Anki sync writes hundreds of notes one round-trip at a time, so it
 * needs far more than the default 15 seconds; every other request keeps the default.
 */
const CARDS_SYNC_TIMEOUT_MS = 120_000;

/** The vault root, or a failure response when it is not configured. */
function requireVault(): { vault: string } | { failure: DataResponse } {
  const vault = readVaultRoot();
  if (!vault) {
    return {
      failure: {
        ok: false,
        code: "vault-missing",
        error: "未配置知识库：请在终端运行 xuegen 并完成初始化。",
      },
    };
  }
  return { vault };
}

/** Route a data request to its implementation. */
export async function handleDataRequest(request: DataRequest): Promise<DataResponse> {
  switch (request.kind) {
    case "anki.status":
      return { ok: true, data: await fetchAnkiStatus() };
    case "sessions.list":
      return { ok: true, data: listSessions(resolveHome(), request.current) };
    case "skills.list":
      return { ok: true, data: listSkills(readSettings().disabledSkills) };
    case "skills.setEnabled":
      return handleSetEnabled(request.name, request.enabled);
    case "skills.fetch":
      return handleFetch(request.url);
    case "skills.review":
      return guarded(() => reviewSkill(request.name));
    case "skills.discard":
      return guarded(() => {
        discardSkill(request.name);
        return { name: request.name };
      });
    case "update.check":
    case "update.download":
    case "update.install":
      return { ok: false, code: "unknown", error: "更新请求只能由主进程处理。" };
    default:
      return handleScriptRequest(request);
  }
}

/** Requests that call a skill script and need a configured vault. */
async function handleScriptRequest(
  request: Exclude<
    DataRequest,
    {
      kind:
        | "anki.status"
        | "sessions.list"
        | "skills.list"
        | "skills.setEnabled"
        | "skills.fetch"
        | "skills.review"
        | "skills.discard"
        | "update.check"
        | "update.download"
        | "update.install";
    }
  >,
): Promise<DataResponse> {
  const vault = requireVault();
  if ("failure" in vault) return vault.failure;

  // The XUEGEN_TODAY override is injected as `--today` only into script calls
  // that carry no date of their own *and* whose script accepts the flag
  // (reading-queue.mjs / bookshelf.mjs: every command). A request that already
  // carries a date — the renderer computed it with the same override — and a
  // script without the flag (course-state.mjs, flashcards.mjs, anki-sync.mjs)
  // are both left exactly as before.
  const today = todayOverride();
  switch (request.kind) {
    case "courses.list":
      return runScript("course/course-state.mjs", ["list", join(vault.vault, "wiki", "courses"), "--json"]);
    case "course.afterRead": {
      // 「读完了」：先给课程页 Today 那行打勾。课程页链着书房书（[[shelf/<书>]]）
      // 时记进书页（bookshelf.mjs lecture，可带上「核心页已定」
      // 的页码）；还链着旧阅读页（[[reading/<页>]]，迁库前的课程页）时照旧记一行
      // Reading Log。最后重建两份派生看板。每一步失败都直接返回它的失败响应。
      const courses = join(vault.vault, "wiki", "courses");
      const marked = await runScript("course/course-state.mjs", [
        "after-read",
        join(courses, `${request.slug}.md`),
        request.label,
        "--date",
        request.date,
      ]);
      if (!marked.ok) return marked;
      const detail = marked.data as {
        reading?: unknown;
        book?: unknown;
        course?: unknown;
        pages?: unknown;
      };
      const reading = typeof detail.reading === "string" ? detail.reading : null;
      const book = typeof detail.book === "string" ? detail.book : null;
      const course = typeof detail.course === "string" ? detail.course : null;
      const pages = typeof detail.pages === "string" ? detail.pages : null;
      if (book !== null) {
        const args = [
          "lecture",
          vault.vault,
          book,
          "--label",
          request.label,
          "--course",
          course ?? request.slug,
        ];
        if (pages !== null) args.push("--pages", pages);
        args.push("--today", request.date, "--json");
        const lectured = await runScript("reading/bookshelf.mjs", args);
        if (!lectured.ok) return lectured;
      } else if (reading !== null) {
        const noted = await runScript("reading/reading-queue.mjs", [
          "note",
          vault.vault,
          reading,
          "--text",
          `讲后读 ${request.label} 已读（用户自报）`,
          "--today",
          request.date,
          "--json",
        ]);
        if (!noted.ok) return noted;
      }
      const generated = generatedDir(vault.vault);
      for (const step of [
        runScriptPlain("course/course-state.mjs", ["dashboard", courses, join(generated, "courses.md")]),
        runScriptPlain("course/render-board.mjs", [courses, join(generated, "courses.html")]),
      ]) {
        const done = await step;
        if (!done.ok) return done;
      }
      return { ok: true, data: { label: request.label, reading, book } };
    }
    case "reading.today":
      return runScript("reading/reading-queue.mjs", withToday([
        "today",
        vault.vault,
        "--limit",
        String(request.limit),
        "--json",
      ], today));
    case "reading.stats":
      return runScript("reading/reading-queue.mjs", withToday(["stats", vault.vault, "--json"], today));
    case "reading.sources":
      return { ok: true, data: listReadingSources(vault.vault) };
    case "reading.queue":
      return runScript("reading/reading-queue.mjs", withToday(["list", vault.vault, "--json"], today));
    case "reading.add":
      return runScript("reading/reading-queue.mjs", withToday([
        "add",
        vault.vault,
        request.source,
        "--priority",
        request.priority,
        "--due",
        request.due,
        "--json",
      ], today));
    case "reading.review": {
      // `--position` is optional: omit it entirely (rather than passing an empty
      // value) so the script leaves the stored position untouched.
      const args = [
        "review",
        vault.vault,
        request.slug,
        "--outcome",
        request.outcome,
        "--json",
      ];
      if (request.position !== undefined) args.splice(args.length - 1, 0, "--position", request.position);
      return runScript("reading/reading-queue.mjs", withToday(args, today));
    }
    case "shelf.today":
      return runScript("reading/bookshelf.mjs", [
        "today",
        vault.vault,
        "--today",
        request.today,
        "--json",
      ]);
    case "shelf.list": {
      // The optional range asks the script for each book's `schedule` rows;
      // the protocol validator already guarantees from/to come as a pair.
      const args = ["list", vault.vault, "--json"];
      if (request.from !== undefined && request.to !== undefined) {
        args.push("--from", request.from, "--to", request.to);
      }
      return runScript("reading/bookshelf.mjs", withToday(args, today));
    }
    case "shelf.done":
      return runScript("reading/bookshelf.mjs", [
        "done",
        vault.vault,
        request.slug,
        "--today",
        request.today,
        "--json",
      ]);
    case "shelf.extract":
      return runScript("reading/bookshelf.mjs", [
        "extract",
        vault.vault,
        request.slug,
        "--page",
        String(request.page),
        "--text",
        request.text,
        "--today",
        request.today,
        "--json",
      ]);
    case "shelf.card":
      return runScript("reading/bookshelf.mjs", [
        "card",
        vault.vault,
        request.slug,
        "--index",
        request.indexes.join(","),
        "--today",
        request.today,
        "--json",
      ]);
    case "cards.stats":
      return runScript("wiki-save/flashcards.mjs", ["stats", vault.vault, "--json"]);
    case "cards.add":
      return runScript("wiki-save/flashcards.mjs", [
        "add",
        vault.vault,
        "--deck",
        request.deck,
        "--front",
        request.front,
        "--back",
        request.back,
        "--json",
      ]);
    case "cards.sync": {
      // 直连 AnkiConnect 把未同步卡片写进 Anki 并回填 <!--ID:-->；dryRun 只扫描。
      // 测试窗口设 XUEGEN_ANKI_URL 时把脚本指向假 AnkiConnect；不设时参数不变。
      const args = ["push", vault.vault, "--json"];
      const ankiUrl = ankiUrlOverride();
      if (ankiUrl !== null) args.push("--url", ankiUrl);
      if (request.dryRun) args.push("--dry-run");
      return runScript("wiki-save/anki-sync.mjs", args, { timeoutMs: CARDS_SYNC_TIMEOUT_MS });
    }
    case "calendar.month":
      return runScript("calendar/calendar.mjs", ["month", vault.vault, request.month, "--json"]);
    case "calendar.write":
      return runScript("calendar/calendar.mjs", [
        "write",
        vault.vault,
        request.date,
        "--text",
        request.text,
        "--json",
      ]);
    case "cycle.day":
      return runScript("cycle-plan/cycle.mjs", ["day", vault.vault, "--date", request.date, "--json"]);
    case "cycle.month":
      return runScript("cycle-plan/cycle.mjs", ["month", vault.vault, request.month, "--json"]);
    case "cycle.overview":
      return runScript("cycle-plan/cycle.mjs", ["overview", vault.vault, "--date", request.date, "--json"]);
    case "subjects.list":
      return runScript("cycle-plan/subjects.mjs", ["list", vault.vault, "--date", request.date, "--json"]);
    default:
      return assertNever(request);
  }
}

/**
 * Append `--today <day>` for a script call that accepts the flag, or leave the
 * args untouched when `day` is null — the script's own local-date default then
 * applies exactly as before.
 */
export function withToday(args: string[], day: string | null): string[] {
  return day === null ? args : [...args, "--today", day];
}

/** Toggle a skill; enabling a pending skill first moves it into `skills/`. */
async function handleSetEnabled(name: string, enabled: boolean): Promise<DataResponse> {
  try {
    if (enabled) promotePendingSkill(name);
    const current = readSettings();
    const disabled = new Set(current.disabledSkills);
    if (enabled) disabled.delete(name);
    else disabled.add(name);
    const next = writeSettings({ disabledSkills: [...disabled] });
    return { ok: true, data: normalizeDesktopSettings(next) };
  } catch (error) {
    return failureOf(error);
  }
}

/** Clone a skill repo into the pending area; never enables it. */
async function handleFetch(url: string): Promise<DataResponse> {
  try {
    return { ok: true, data: await fetchSkill(url) };
  } catch (error) {
    return failureOf(error);
  }
}

/** Run a synchronous skill operation, turning a throw into a failure response. */
function guarded(run: () => unknown): DataResponse {
  try {
    return { ok: true, data: run() };
  } catch (error) {
    return failureOf(error);
  }
}

/** Convert a thrown error into a failure response, keeping a `SkillError`'s code. */
function failureOf(error: unknown): DataResponse {
  if (error instanceof SkillError) return { ok: false, code: error.code, error: error.message };
  return { ok: false, code: "unknown", error: error instanceof Error ? error.message : String(error) };
}
