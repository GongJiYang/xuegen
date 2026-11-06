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
import { runScript } from "./scripts.js";
import { readVaultRoot } from "./vault.js";
import { fetchAnkiStatus } from "./anki.js";
import { SkillError, discardSkill, fetchSkill, listSkills, promotePendingSkill, reviewSkill } from "./skills.js";
import { listReadingSources } from "./sources.js";

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
    default:
      return handleScriptRequest(request);
  }
}

/** Requests that call a skill script and need a configured vault. */
async function handleScriptRequest(
  request: Exclude<
    DataRequest,
    { kind: "anki.status" | "skills.list" | "skills.setEnabled" | "skills.fetch" | "skills.review" | "skills.discard" }
  >,
): Promise<DataResponse> {
  const vault = requireVault();
  if ("failure" in vault) return vault.failure;

  switch (request.kind) {
    case "courses.list":
      return runScript("course/course-state.mjs", ["list", join(vault.vault, "wiki", "courses"), "--json"]);
    case "reading.today":
      return runScript("reading/reading-queue.mjs", [
        "today",
        vault.vault,
        "--limit",
        String(request.limit),
        "--json",
      ]);
    case "reading.stats":
      return runScript("reading/reading-queue.mjs", ["stats", vault.vault, "--json"]);
    case "reading.sources":
      return { ok: true, data: listReadingSources(vault.vault) };
    case "reading.queue":
      return runScript("reading/reading-queue.mjs", ["list", vault.vault, "--json"]);
    case "reading.add":
      return runScript("reading/reading-queue.mjs", [
        "add",
        vault.vault,
        request.source,
        "--priority",
        request.priority,
        "--due",
        request.due,
        "--json",
      ]);
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
      return runScript("reading/reading-queue.mjs", args);
    }
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
