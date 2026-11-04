/**
 * Markdown → HAST pipeline (pure).
 *
 * Turns a Markdown *fragment* (a `markdown` content node's body) into a HAST
 * tree that a skin can render with its own components. This is deliberately in
 * core: *what* the text is — headings, emphasis, inline code, links, lists,
 * footnotes, inline math — is content, not styling. A skin only decides how each
 * element looks.
 *
 * The parse is pure and runs no scripts from the input: `remark-rehype` with
 * `allowDangerousHtml: false` drops raw HTML. `rehype-sanitize` runs on the
 * user-authored tree (before KaTeX) so any hostile markup is removed while the
 * structure is still plain; `rehype-katex` then typesets the trusted inline math
 * it produces. Sanitizing after KaTeX would strip its `class`/`style` attributes
 * and MathML, flattening every formula. The sanitize schema must keep the
 * `math-inline` / `math-display` classes remark-math puts on the math elements,
 * or `rehype-katex` cannot find them. The KaTeX output carries no colour of its
 * own, so a 1-bit skin stays two-colour.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Schema } from "hast-util-sanitize";
import type { Root as HastRoot } from "hast";

/**
 * The sanitize schema.
 *
 * The default (GitHub) schema, extended so the `math-inline` and `math-display`
 * classes remark-math writes survive sanitizing — `rehype-katex` selects math by
 * those classes, so dropping them silently un-typesets every formula. The default
 * schema still removes `<script>`, event handlers, and other raw HTML.
 */
const SANITIZE_SCHEMA: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className", "math-inline", "math-display"]],
  },
};

/**
 * The shared processor.
 *
 * One instance is reused for every render: the plugin chain is stateless, so
 * building it once avoids re-instantiating unified per message block.
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, SANITIZE_SCHEMA)
  .use(rehypeKatex)
  .freeze();

/** Parse a Markdown fragment to a HAST tree. Never throws on partial input. */
export function markdownToHast(markdown: string): HastRoot {
  return processor.runSync(processor.parse(markdown)) as HastRoot;
}
