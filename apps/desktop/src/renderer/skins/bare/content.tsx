/**
 * Bare skin: content renderers.
 *
 * Maps each `ContentNode` kind to plain semantic HTML. No styling lives here —
 * the bare skin is the always-available reference, so it renders meaning (a
 * table is a `<table>`, a formula is a KaTeX block, a diagram is an SVG) with the
 * browser's defaults. It still executes nothing from the model: Mermaid only
 * parses declarative text, and KaTeX only typesets LaTeX.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import katex from "katex";
import mermaid from "mermaid";
import type { ContentNode } from "../../core/content/nodes.js";
import { strings } from "../../core/strings.js";

interface NodeProps {
  node: ContentNode;
  streaming?: boolean;
}

/** A `pre`/`code` block for an ordinary fenced language. */
function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <pre data-language={language}>
      <code>{code}</code>
    </pre>
  );
}

/** A GFM table as a real `<table>` with a header row. */
function Table({ header, rows }: { header: string[]; rows: string[][] }) {
  return (
    <table>
      <caption>{strings.content.tableCaption}</caption>
      <thead>
        <tr>
          {header.map((cell, index) => (
            <th key={index} scope="col">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A KaTeX display formula. KaTeX typesets LaTeX; it runs no scripts. */
function MathBlock({ latex }: { latex: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode: true,
        throwOnError: false,
        output: "html",
      });
    } catch (cause) {
      return `<pre>${cause instanceof Error ? cause.message : String(cause)}</pre>`;
    }
  }, [latex]);
  return (
    <figure aria-label={strings.content.mathLabel}>
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </figure>
  );
}

/** A Mermaid diagram; renders to SVG or falls back to the raw source. */
function MermaidBlock({ code }: { code: string }) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: "default",
    });

    void mermaid
      .render(`bare-mermaid-${reactId}`, code)
      .then(({ svg }) => {
        if (cancelled || !container) return;
        container.innerHTML = svg;
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      cancelled = true;
      if (container) container.innerHTML = "";
    };
  }, [code, reactId]);

  if (error) {
    return (
      <figure aria-label={strings.content.diagramLabel}>
        <p role="alert">{strings.content.mermaidError}</p>
        <pre>
          <code>{code}</code>
        </pre>
      </figure>
    );
  }
  return <div ref={containerRef} aria-label={strings.content.diagramLabel} />;
}

/** Render one classified content node. */
export function BareContentNode({ node, streaming = false }: NodeProps) {
  switch (node.kind) {
    case "code":
      return <CodeBlock language={node.language} code={node.code} />;
    case "mermaid":
      return <MermaidBlock code={node.code} />;
    case "diagram":
      return (
        <pre data-kind="diagram">
          <code>{node.code}</code>
        </pre>
      );
    case "math-block":
      return <MathBlock latex={node.latex} />;
    case "table":
      return <Table header={node.header} rows={node.rows} />;
    case "callout":
      return <BareContentNode node={{ kind: "markdown", markdown: node.body }} streaming={streaming} />;
    case "markdown":
      return <MarkdownText markdown={node.markdown} />;
    default:
      return null;
  }
}

/**
 * Plain-Markdown rendering for the bare skin.
 *
 * The bare skin is a semantic reference, not a typeset view: it shows the
 * Markdown source verbatim in a `<pre>` so classification (not typography) is
 * what the contract test exercises. Typeset prose belongs to a design skin.
 */
function MarkdownText({ markdown }: { markdown: string }) {
  return <pre>{markdown}</pre>;
}
