/**
 * Markdown classification pipeline.
 *
 * Turns a Markdown string into an ordered list of typed `ContentNode`s: fenced
 * code (by language), Mermaid, block formulas, Obsidian callouts, GFM tables,
 * and plain Markdown for everything else. The parse is pure and streaming-safe —
 * an incomplete fence or table at the end simply stays plain Markdown, so a
 * half-received message never throws.
 *
 * The pipeline decides *what* the content is; skins decide how to draw it. This
 * is why the same message looks different under two skins while keeping the same
 * meaning.
 */

import {
  calloutTypeOf,
  codeNode,
  type CalloutNode,
  type ContentNode,
  type TableNode,
} from "./nodes.js";

/** True for a line that opens or closes a fenced code block. */
function fenceMatch(line: string): RegExpMatchArray | null {
  return /^\s*(```|~~~)\s*([\w-]*)\s*$/.exec(line);
}

/** True for a `$$ … $$` line used as a block-math delimiter. */
function isMathFence(line: string): boolean {
  return /^\s*\$\$\s*$/.test(line);
}

/** A single `> [!type] title` callout opener, or null. */
function calloutMatch(line: string): { type: string; title: string } | null {
  const match = /^\s*>\s*\[!([\w-]+)\]\s*(.*)$/.exec(line);
  if (!match) return null;
  return { type: match[1] ?? "", title: match[2]?.trim() ?? "" };
}

/** True for any blockquote continuation line. */
function isQuoteLine(line: string): boolean {
  return /^\s*>/.test(line);
}

/** Strip the leading `>` (and one following space) from a quote line. */
function stripQuote(line: string): string {
  return line.replace(/^\s*>\s?/, "");
}

/** Split a Markdown table row into trimmed cells, dropping the outer pipes. */
function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

/** True for a GFM alignment row like `| --- | :--: |`. */
function isDelimiterRow(line: string): boolean {
  if (!line.includes("-")) return false;
  const cells = splitRow(line);
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-{1,}:?$/.test(cell));
}

/** True for a line that has the pipe shape of a table row. */
function isTableRow(line: string): boolean {
  return line.trim().includes("|");
}

/**
 * Try to read a GFM table starting at `start`.
 *
 * A table is a header row followed by a delimiter row; body rows follow until a
 * blank line or a non-row line. Returns null when the shape does not hold, so
 * the lines fall through to plain Markdown.
 */
function readTable(lines: string[], start: number): { node: TableNode; next: number } | null {
  const header = lines[start];
  const delimiter = lines[start + 1];
  if (header === undefined || delimiter === undefined) return null;
  if (!isTableRow(header) || !isDelimiterRow(delimiter)) return null;

  const headerCells = splitRow(header);
  const rows: string[][] = [];
  let index = start + 2;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined || line.trim() === "") break;
    if (!isTableRow(line) || fenceMatch(line) || isMathFence(line)) break;
    rows.push(splitRow(line));
    index += 1;
  }
  return { node: { kind: "table", header: headerCells, rows }, next: index };
}

/** Read a callout block starting at the `> [!type]` opener. */
function readCallout(lines: string[], start: number): CalloutNode {
  const opener = lines[start] ?? "";
  const header = calloutMatch(opener);
  const bodyLines: string[] = [];
  let index = start + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined || !isQuoteLine(line)) break;
    // A nested callout opener ends this one; keep it simple and stop.
    if (calloutMatch(line)) break;
    bodyLines.push(stripQuote(line));
    index += 1;
  }
  return {
    kind: "callout",
    calloutType: calloutTypeOf(header?.type ?? ""),
    title: header?.title ?? "",
    body: bodyLines.join("\n").trim(),
  };
}

/** Read a fenced code block; the caller guarantees an opening fence at `start`. */
function readFence(
  lines: string[],
  start: number,
): { node: ContentNode; next: number } {
  const open = fenceMatch(lines[start] ?? "");
  const fence = open?.[1] ?? "```";
  const language = open?.[2] ?? "";
  const body: string[] = [];
  let index = start + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (line !== undefined && /^\s*(```|~~~)\s*$/.test(line) && line.includes(fence)) break;
    if (line === undefined) break;
    body.push(line);
    index += 1;
  }
  // Skip the closing fence when one was found.
  if (index < lines.length) index += 1;
  return { node: codeNode(language, body.join("\n")), next: index };
}

/** Read a `$$` … `$$` block formula. */
function readMathFence(lines: string[], start: number): { node: ContentNode; next: number } {
  const body: string[] = [];
  let index = start + 1;
  while (index < lines.length && !isMathFence(lines[index] ?? "")) {
    body.push(lines[index] ?? "");
    index += 1;
  }
  if (index < lines.length) index += 1;
  return { node: { kind: "math-block", latex: body.join("\n").trim() }, next: index };
}

/** Buffer of plain Markdown lines, flushed when a special block begins. */
class MarkdownBuffer {
  private readonly lines: string[] = [];

  push(line: string): void {
    this.lines.push(line);
  }

  /** Emit the buffered Markdown as one node, unless it is blank. */
  flush(into: ContentNode[]): void {
    const markdown = this.lines.join("\n").trim();
    this.lines.length = 0;
    if (markdown) into.push({ kind: "markdown", markdown });
  }
}

/** Classify a Markdown string into an ordered list of content nodes. */
export function parseContent(markdown: string): ContentNode[] {
  const lines = markdown.split("\n");
  const nodes: ContentNode[] = [];
  const buffer = new MarkdownBuffer();

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";

    const fence = fenceMatch(line);
    if (fence) {
      buffer.flush(nodes);
      const read = readFence(lines, index);
      nodes.push(read.node);
      index = read.next;
      continue;
    }

    if (isMathFence(line)) {
      buffer.flush(nodes);
      const read = readMathFence(lines, index);
      nodes.push(read.node);
      index = read.next;
      continue;
    }

    if (calloutMatch(line)) {
      buffer.flush(nodes);
      nodes.push(readCallout(lines, index));
      // Advance past the consumed quote lines.
      let next = index + 1;
      while (next < lines.length && isQuoteLine(lines[next] ?? "") && !calloutMatch(lines[next] ?? "")) {
        next += 1;
      }
      index = next;
      continue;
    }

    const table = readTable(lines, index);
    if (table) {
      buffer.flush(nodes);
      nodes.push(table.node);
      index = table.next;
      continue;
    }

    buffer.push(line);
    index += 1;
  }

  buffer.flush(nodes);
  return nodes;
}
