/**
 * Bear content renderers.
 *
 * Maps each `ContentNode` core classifies to the skin's markup (bear.md §3):
 * typeset prose via the core HAST pipeline, a thin-ruled table, a code block on
 * `--code-bg`, a character diagram in the half-width `BearDiagramMono` face
 * (7/8 of the body size; Chinese falls back to PingFang SC), a KaTeX
 * formula, a Mermaid graph themed with only ink/paper, and callouts with a rule
 * line. `question` callouts never reach here: core routes them to Exercise.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import katex from "katex";
import mermaid from "mermaid";
import { markdownToHast } from "../../core/content/markdown-to-hast.js";
import type { ContentNode } from "../../core/content/nodes.js";
import { strings } from "../../core/strings.js";
import { hastToReact } from "../../core/content/hast-react.js";

interface NodeProps {
  node: ContentNode;
  streaming?: boolean;
}

/** Render typeset prose from a Markdown node using the shared HAST pipeline. */
function Markdown({ markdown }: { markdown: string }) {
  const tree = useMemo(() => markdownToHast(markdown), [markdown]);
  return <>{hastToReact(tree)}</>;
}

/** A GFM table: thin `--rule` lines, no background. */
function Table({ header, rows }: { header: string[]; rows: string[][] }) {
  return (
    <table className="bear-table">
      <caption className="bear-muted">{strings.content.tableCaption}</caption>
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

/** A fenced code block: `--code-bg`, 4px radius, 13px monospaced. */
function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <pre className="bear-code" data-language={language}>
      <code>{code}</code>
    </pre>
  );
}

/** A terminal character diagram in the half-width BearDiagramMono face. */
function Diagram({ code }: { code: string }) {
  return (
    <pre className="bear-diagram" data-kind="diagram">
      <code>{code}</code>
    </pre>
  );
}

/** A KaTeX display formula, ink on paper. */
function MathBlock({ latex }: { latex: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, { displayMode: true, throwOnError: false, output: "html" });
    } catch (cause) {
      return `<pre>${cause instanceof Error ? cause.message : String(cause)}</pre>`;
    }
  }, [latex]);
  return (
    <div className="bear-math" aria-label={strings.content.mathLabel} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/** The Bear Mermaid theme: ink lines and text on paper, nothing else. */
const MERMAID_THEME = {
  startOnLoad: false,
  securityLevel: "strict" as const,
  suppressErrorRendering: true,
  theme: "base" as const,
  fontFamily: '-apple-system, "PingFang SC", sans-serif',
  themeVariables: {
    primaryColor: "#fbfbfa",
    primaryBorderColor: "#1f2124",
    primaryTextColor: "#1f2124",
    lineColor: "#1f2124",
    fontSize: "13px",
    background: "#fbfbfa",
    mainBkg: "#fbfbfa",
    nodeBorder: "#1f2124",
  },
  flowchart: { htmlLabels: false, useMaxWidth: true },
};

/** A Mermaid diagram in the two-colour theme; falls back to the source. */
function MermaidBlock({ code }: { code: string }) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    mermaid.initialize(MERMAID_THEME);
    void mermaid
      .render(`bear-mermaid-${reactId}`, code)
      .then(({ svg }) => {
        if (cancelled || !container) return;
        container.innerHTML = svg;
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (container) container.innerHTML = "";
    };
  }, [code, reactId]);

  if (failed) {
    return (
      <figure className="bear-mermaid" aria-label={strings.content.diagramLabel}>
        <p role="alert">{strings.content.mermaidError}</p>
        <pre className="bear-code">
          <code>{code}</code>
        </pre>
      </figure>
    );
  }
  return <div className="bear-mermaid" ref={containerRef} aria-label={strings.content.diagramLabel} />;
}

/**
 * Render one classified content node.
 *
 * `question` callouts are routed to the Exercise slot by core before they reach
 * here; the remaining callouts (note/warning) become rule-lined boxes.
 */
export function BearContentNode({ node }: NodeProps): ReactNode {
  switch (node.kind) {
    case "code":
      return <CodeBlock language={node.language} code={node.code} />;
    case "diagram":
      return <Diagram code={node.code} />;
    case "mermaid":
      return <MermaidBlock code={node.code} />;
    case "math-block":
      return <MathBlock latex={node.latex} />;
    case "table":
      return <Table header={node.header} rows={node.rows} />;
    case "callout":
      return (
        <div className="bear-callout" data-tone={node.calloutType}>
          <div className="bear-callout-head">
            {node.title ||
              (node.calloutType === "warning" ? strings.content.warningLabel : strings.content.noticeLabel)}
          </div>
          <Markdown markdown={node.body} />
        </div>
      );
    case "markdown":
      return <Markdown markdown={node.markdown} />;
    default:
      return null;
  }
}
