import type { ToolCallView } from "@shared/protocol.js";
import { flowStrings } from "./strings.js";

export type ToolKind =
  | "course-page"
  | "prefs"
  | "shift"
  | "cycle-day"
  | "book"
  | "close"
  | "code"
  | "skill"
  | "other";

export interface ToolHuman {
  text: string;
  kind: ToolKind;
  /** The step this call marks in each flow it belongs to. */
  step: { open?: number; close?: number };
}

const ACTION_RE = /"action"\s*:\s*"([^"]+)"/;
const PATH_RE = /"path"\s*:\s*"([^"]+)"/;
const COURSE_PAGE_RE = /\/wiki\/courses\/([^/]+)\.md$/;
const PDF_RE = /-f\s+(\d+)\s+-l\s+(\d+)/;
const CODE_FILE_RE = /cat > \S+\.(py|js|txt)/;

const CLOSE_STEPS: Record<string, number> = { stage: 1, snapshot: 7 };
const CODE_TOOLS = new Set(["python3", "node -e"]);

function base(path: string): string {
  const name = path.split("/").pop() ?? "";
  return name.replace(/\.[^.]+$/, "");
}

function closeStep(action: string): number {
  return CLOSE_STEPS[action] ?? 8;
}

function describeClose(action: string): ToolHuman {
  if (action === "shift") {
    return { text: flowStrings.shift, kind: "shift", step: { open: 3 } };
  }
  return {
    text: flowStrings.close[action] ?? flowStrings.closeOther,
    kind: "close",
    step: { close: closeStep(action) },
  };
}

function describeRead(path: string, names: Record<string, string>): ToolHuman {
  const course = path.match(COURSE_PAGE_RE);
  if (course) {
    const slug = course[1] ?? "";
    return { text: flowStrings.coursePage(names[slug] ?? slug), kind: "course-page", step: { open: 2, close: 1 } };
  }
  if (path.endsWith("/SKILL.md")) {
    return { text: flowStrings.skill, kind: "skill", step: {} };
  }
  return { text: flowStrings.read(base(path)), kind: "other", step: {} };
}

function isCode(args: string): boolean {
  const looksLikeCode = [...CODE_TOOLS].some((tool) => args.includes(tool)) || CODE_FILE_RE.test(args);
  return looksLikeCode && !args.includes("/xuegen-data/") && !args.includes("wiki/");
}

function describeBash(args: string): ToolHuman {
  const book = args.includes("pdftotext") ? args.match(PDF_RE) : null;
  if (book) {
    return { text: flowStrings.book(book[1] ?? "", book[2] ?? ""), kind: "book", step: { open: 6 } };
  }
  if (args.includes("cycle.mjs day")) {
    return { text: flowStrings.cycleDay, kind: "cycle-day", step: { open: 4 } };
  }
  if (args.includes("profile.md") || args.includes("讲解偏好")) {
    return { text: flowStrings.prefs, kind: "prefs", step: { open: 2 } };
  }
  if (isCode(args)) {
    return { text: flowStrings.code, kind: "code", step: {} };
  }
  return { text: flowStrings.run, kind: "other", step: {} };
}

export function describeTool(call: ToolCallView, names: Record<string, string>): ToolHuman {
  const args = call.argsSummary;
  if (call.toolName === "course_close") {
    return describeClose(args.match(ACTION_RE)?.[1] ?? "");
  }
  if (call.toolName === "read") {
    return describeRead(args.match(PATH_RE)?.[1] ?? "", names);
  }
  if (call.toolName === "write" || call.toolName === "edit") {
    return { text: flowStrings.write(base(args.match(PATH_RE)?.[1] ?? "")), kind: "other", step: {} };
  }
  if (call.toolName === "bash") {
    return describeBash(args);
  }
  return { text: flowStrings.run, kind: "other", step: {} };
}
