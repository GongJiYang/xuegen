import type { ToolCallView } from "@shared/protocol.js";
import type { ActionKind } from "../chat/action-marker.js";
import { FLOW_STEPS, type FlowId } from "./steps.js";
import { flowStrings } from "./strings.js";
import { describeTool } from "./tool-human.js";

export interface CallGroup {
  title: string;
  internal: boolean;
  lines: { text: string; count: number; calls: ToolCallView[] }[];
}

export function flowOf(action: ActionKind | null): FlowId | null {
  if (action === "open") return "course.open";
  if (action === "close") return "course.close";
  return null;
}

function stepOf(call: ToolCallView, names: Record<string, string>, flow: FlowId): number | undefined {
  const step = describeTool(call, names).step;
  return flow === "course.open" ? step.open : step.close;
}

function maxStep(calls: ToolCallView[], names: Record<string, string>, flow: FlowId): number | null {
  const steps = calls.map((call) => stepOf(call, names, flow)).filter((n): n is number => n !== undefined);
  return steps.length === 0 ? null : Math.max(...steps);
}

export function progressLine(
  flow: FlowId | null,
  calls: ToolCallView[],
  names: Record<string, string>,
  hasPoints: boolean,
): string | null {
  if (flow === "course.open" && hasPoints) return null;
  if (flow) {
    if (calls.length === 0) return null;
    const n = maxStep(calls, names, flow);
    if (n === null) return null;
    const { name, total } = FLOW_STEPS[flow];
    const last = calls[calls.length - 1];
    const doing = last ? describeTool(last, names).text : "";
    return flowStrings.progress(name, n, total, doing);
  }
  if (calls.length === 0) return null;
  const last = describeTool(calls[calls.length - 1] as ToolCallView, names);
  if (last.kind === "skill") return null;
  return flowStrings.doing(last.text);
}

// Step numbers and close labels do not depend on course names, and the folded
// label has no names argument, so step accounting uses an empty lookup.
const NO_NAMES: Record<string, string> = {};

function hasCommit(calls: ToolCallView[]): boolean {
  return calls.some((call) => describeTool(call, NO_NAMES).text === flowStrings.close.commit);
}

export function foldLabel(
  flow: FlowId | null,
  calls: ToolCallView[],
  hasPoints: boolean,
  finished: boolean,
): string {
  const ops = calls.length;
  if (flow === null) return flowStrings.ops(ops);
  const { name, total } = FLOW_STEPS[flow];
  const done = flow === "course.open" ? hasPoints && finished : finished && hasCommit(calls);
  if (done) return flowStrings.done(name, total, ops);
  return flowStrings.partial(name, maxStep(calls, NO_NAMES, flow) ?? 0, ops);
}

interface Bucket {
  title: string;
  internal: boolean;
  order: number;
  lines: { text: string; count: number; calls: ToolCallView[] }[];
}

function bucketFor(
  buckets: Map<string, Bucket>,
  key: string,
  title: string,
  internal: boolean,
  order: number,
): Bucket {
  const existing = buckets.get(key);
  if (existing) return existing;
  const created: Bucket = { title, internal, order, lines: [] };
  buckets.set(key, created);
  return created;
}

function addLine(bucket: Bucket, text: string, call: ToolCallView): void {
  const line = bucket.lines.find((item) => item.text === text);
  if (line) {
    line.count += 1;
    line.calls.push(call);
    return;
  }
  bucket.lines.push({ text, count: 1, calls: [call] });
}

function closeGroup(buckets: Map<string, Bucket>, step: number, text: string, call: ToolCallView): void {
  const title = flowStrings.stepTitle(step, FLOW_STEPS["course.close"].steps[step] ?? "");
  addLine(bucketFor(buckets, `step:${step}`, title, false, step), text, call);
}

function openGroup(buckets: Map<string, Bucket>, step: number, text: string, call: ToolCallView): void {
  const title = flowStrings.stepTitle(step, FLOW_STEPS["course.open"].steps[step] ?? "");
  addLine(bucketFor(buckets, `step:${step}`, title, false, step), text, call);
}

function addOther(buckets: Map<string, Bucket>, text: string, call: ToolCallView): void {
  addLine(bucketFor(buckets, "other", flowStrings.other, true, 2000), text, call);
}

function groupOpen(buckets: Map<string, Bucket>, calls: ToolCallView[], names: Record<string, string>): void {
  let teaching = false;
  for (const call of calls) {
    const tool = describeTool(call, names);
    if (tool.kind === "skill") {
      addOther(buckets, tool.text, call);
      continue;
    }
    if (!teaching && (tool.kind === "code" || (tool.kind === "book" && tool.step.open === undefined))) {
      teaching = true;
    }
    if (teaching) {
      const text = tool.kind === "book" ? flowStrings.bookPlain : tool.text;
      addLine(bucketFor(buckets, "teaching", flowStrings.teaching, false, 1000), text, call);
      continue;
    }
    if (tool.step.open !== undefined) {
      openGroup(buckets, tool.step.open, tool.text, call);
    } else {
      addOther(buckets, tool.text, call);
    }
  }
}

function groupClose(buckets: Map<string, Bucket>, calls: ToolCallView[], names: Record<string, string>): void {
  for (const call of calls) {
    const tool = describeTool(call, names);
    if (tool.kind !== "skill" && tool.step.close !== undefined) {
      closeGroup(buckets, tool.step.close, tool.text, call);
    } else {
      addOther(buckets, tool.text, call);
    }
  }
}

function groupPlain(buckets: Map<string, Bucket>, calls: ToolCallView[], names: Record<string, string>): void {
  for (const call of calls) {
    const tool = describeTool(call, names);
    if (tool.kind === "skill") {
      addOther(buckets, tool.text, call);
    } else {
      addLine(bucketFor(buckets, "main", "", false, -1), tool.text, call);
    }
  }
}

export function groupCalls(
  flow: FlowId | null,
  calls: ToolCallView[],
  names: Record<string, string>,
): CallGroup[] {
  const buckets = new Map<string, Bucket>();
  if (flow === "course.open") groupOpen(buckets, calls, names);
  else if (flow === "course.close") groupClose(buckets, calls, names);
  else groupPlain(buckets, calls, names);
  return [...buckets.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ title, internal, lines }) => ({ title, internal, lines }));
}
