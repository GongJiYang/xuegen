/**
 * Content node types: the vocabulary core uses to describe *what* a piece of
 * content is, independent of how a skin renders it.
 *
 * core's Markdown pipeline produces these; a skin's `ContentRenderers` maps each
 * node kind to its own markup. Because the classification happens once in core,
 * switching skins never changes the meaning of the content — only its look.
 */

/** A fenced code block, tagged with its language (empty when unspecified). */
export interface CodeNode {
  kind: "code";
  language: string;
  code: string;
}

/** A Mermaid diagram (a ` ```mermaid ` block). */
export interface MermaidNode {
  kind: "mermaid";
  code: string;
}

/**
 * A terminal-style character diagram (box drawing, blocks, braille, arrows).
 *
 * Classified from a fenced block whose language is empty or one of
 * `text`/`txt`/`ascii`/`diagram`/`plain` **and** whose body actually contains
 * characters from the box-drawing (U+2500–259F) or braille (U+2800–28FF)
 * ranges. Those glyphs need the skin's half-width `Fusion12Diagram` font so the
 * strokes join across rows; a design skin renders this node without the usual
 * code-block chrome. Detecting the character set (not just the language tag)
 * keeps a plain prose fence from being mistaken for a diagram.
 */
export interface DiagramNode {
  kind: "diagram";
  code: string;
}

/** A block formula (a ` ```math ` block or `$$…$$`). */
export interface MathBlockNode {
  kind: "math-block";
  latex: string;
}

/** An Obsidian callout: type, optional title, and body Markdown. */
export interface CalloutNode {
  kind: "callout";
  calloutType: CalloutType;
  title: string;
  body: string;
}

/**
 * Recognized callout types.
 *
 * Only the kinds the learning flow uses are modelled; everything else collapses
 * to `note` so an unknown callout still renders as a plain notice instead of
 * leaking raw syntax into the transcript.
 */
export type CalloutType = "question" | "note" | "warning";

/** A GFM table, kept structural so a skin can style header and cells. */
export interface TableNode {
  kind: "table";
  header: string[];
  rows: string[][];
}

/** Plain Markdown that is none of the special kinds above. */
export interface MarkdownNode {
  kind: "markdown";
  markdown: string;
}

/** Every content node core can classify. */
export type ContentNode =
  | MarkdownNode
  | CodeNode
  | MermaidNode
  | DiagramNode
  | MathBlockNode
  | CalloutNode
  | TableNode;

/** Fenced languages that may hold a terminal character diagram. */
const DIAGRAM_LANGUAGES = new Set(["", "text", "txt", "ascii", "diagram", "plain"]);

/**
 * True when a code body is a terminal character diagram.
 *
 * The deciding signal is the character set: box-drawing (`─│┌…` U+2500–259F) or
 * braille (`⠁⠂…` U+2800–28FF) glyphs, which the skin renders with its half-width
 * diagram font so strokes join. The language tag only gates *where* to look — an
 * explicit language like `python` is never a diagram, and this also keeps a
 * streaming half-written fence (whose language is still unknown) from being
 * misclassified.
 */
export function isDiagramBody(language: string, code: string): boolean {
  if (!DIAGRAM_LANGUAGES.has(language.trim().toLowerCase())) return false;
  for (const character of code) {
    const point = character.codePointAt(0) ?? 0;
    if ((point >= 0x2500 && point <= 0x259f) || (point >= 0x2800 && point <= 0x28ff)) {
      return true;
    }
  }
  return false;
}

/** The recognized fenced languages that turn into their own node kinds. */
const LANGUAGE_NODES: Record<string, (code: string) => ContentNode> = {
  mermaid: (code) => ({ kind: "mermaid", code }),
  math: (latex) => ({ kind: "math-block", latex }),
};

/** Build the node for a fenced code block, resolved by its language tag. */
export function codeNode(language: string, code: string): ContentNode {
  const normalized = language.trim().toLowerCase();
  const special = LANGUAGE_NODES[normalized];
  if (special) return special(code);
  if (isDiagramBody(normalized, code)) return { kind: "diagram", code };
  return { kind: "code", language: normalized, code };
}

/** Map an Obsidian callout keyword to a modelled type (unknown → note). */
export function calloutTypeOf(keyword: string): CalloutType {
  switch (keyword.trim().toLowerCase()) {
    case "question":
      return "question";
    case "warning":
    case "caution":
      return "warning";
    default:
      return "note";
  }
}
