/**
 * Chicago content renderers.
 *
 * Maps each `ContentNode` core classifies to the design's markup: typeset prose
 * (via the core HAST pipeline), a 1px-framed table, a double-framed code block
 * in the monospaced pixel font, an unbordered terminal diagram, a KaTeX formula,
 * a Mermaid graph, and callout dialogs. Every element carries the skin's class
 * names; colours come only from the CSS custom properties the palette sets, so
 * the output is strictly two-colour.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import katex from "katex";
import mermaid from "mermaid";
import type { Root as HastRoot, Element as HastElement } from "hast";
import { markdownToHast } from "../../core/content/markdown-to-hast.js";
import type { ContentNode } from "../../core/content/nodes.js";
import { strings } from "../../core/strings.js";
import { hastToReact } from "./hast-react.js";

interface NodeProps {
  node: ContentNode;
  streaming?: boolean;
}

/** Render typeset prose from a Markdown node using the shared HAST pipeline. */
function Markdown({ markdown }: { markdown: string }) {
  const tree = useMemo(() => markdownToHast(markdown), [markdown]);
  return <>{hastToReact(tree)}</>;
}

/** A GFM table: 1px full frame, Chicago header, 3px header underline. */
function Table({ header, rows }: { header: string[]; rows: string[][] }) {
  return (
    <table className="answer-table">
      <caption className="visually-hidden">{strings.content.tableCaption}</caption>
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

/** A fenced code block: outer 1px, inner 2px (the design's double border). */
function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <pre className="code-block" data-language={language}>
      <code>{code}</code>
    </pre>
  );
}

/** A terminal character diagram: no frame, line-height 4/3 so rows join. */
function Diagram({ code }: { code: string }) {
  return (
    <pre className="diagram" data-kind="diagram">
      <code>{code}</code>
    </pre>
  );
}

/** A KaTeX display formula, left-aligned, black/white (no font smoothing). */
function MathBlock({ latex }: { latex: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, { displayMode: true, throwOnError: false, output: "html" });
    } catch (cause) {
      return `<pre>${cause instanceof Error ? cause.message : String(cause)}</pre>`;
    }
  }, [latex]);
  return (
    <div className="math" aria-label={strings.content.mathLabel} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/**
 * Apply the design's Mermaid theme and its 1-bit post-processing.
 *
 * `graph TD`, `curve: step`, `useMaxWidth: false` (render 1:1 so pixel glyphs are
 * not rescaled into mush), and `crispEdges` on every node. A key node (one whose
 * label the design marks) is filled with a 50% dither pattern, with its label on
 * a paper-coloured backing so the text stays readable over the screen.
 */
const MERMAID_THEME = {
  startOnLoad: false,
  securityLevel: "strict" as const,
  suppressErrorRendering: true,
  theme: "base" as const,
  fontFamily: "Fusion12",
  themeVariables: {
    primaryColor: "#fff",
    primaryBorderColor: "#000",
    primaryTextColor: "#000",
    lineColor: "#000",
    fontSize: "12px",
    background: "#fff",
    mainBkg: "#fff",
    nodeBorder: "#000",
  },
  flowchart: { curve: "step" as const, htmlLabels: false, useMaxWidth: false, nodeSpacing: 20, rankSpacing: 28, padding: 6 },
};

/**
 * Turn the rounded corners of a Mermaid edge path into square steps.
 *
 * Mermaid's `curve: "step"` still rounds each corner with a short quadratic
 * (`Q cx,cy x,y`). A rounded corner is a diagonal, and a diagonal antialiases to
 * grey at 1x even with `crispEdges`. Replacing every quadratic with a square
 * elbow (`L cx,y L x,y`) keeps the routing identical while making every segment
 * axis-aligned, so the whole graph stays two-colour. Straight `L` runs and any
 * non-quadratic commands are left untouched.
 */
function squareEdgeCorners(pathData: string): string {
  return pathData.replace(
    /Q\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s+(-?[\d.]+)\s*,\s*(-?[\d.]+)/g,
    (_match, _cx, cy, x, y) => `L${x},${cy}L${x},${y}`,
  );
}

/**
 * Stepped 1-bit arrowheads, one per direction.
 *
 * Mermaid's default marker is a smooth triangle; its diagonal edges antialias to
 * grey at 1x even under `crispEdges`. Each arrow here is a staircase built from
 * axis-aligned horizontal runs in a 10×10 box, so `crispEdges` snaps every pixel
 * and the graph stays two-colour. The tip is the far run: right at `x=9`, down at
 * `y=9`, and so on. Each direction needs its own marker because the arrow points
 * in screen space and the edge's last segment decides which one applies (a `◀`
 * on a downward edge is exactly the bug this avoids).
 */
const ARROW_PATHS: Record<ArrowDirection, string> = {
  // tip at x=9,y=4
  right: "M0,0h2v9h-2Z M2,1h2v7h-2Z M4,2h2v5h-2Z M6,3h2v3h-2Z M8,4h2v1h-2Z",
  // tip at x=4,y=9
  down: "M0,0h9v2h-9Z M1,2h7v2h-7Z M2,4h5v2h-5Z M3,6h3v2h-3Z M4,8h1v2h-1Z",
  // tip at x=0,y=4
  left: "M8,0h2v9h-2Z M6,1h2v7h-2Z M4,2h2v5h-2Z M2,3h2v3h-2Z M0,4h2v1h-2Z",
  // tip at x=4,y=0
  up: "M0,8h9v2h-9Z M1,6h7v2h-7Z M2,4h5v2h-5Z M3,2h3v2h-3Z M4,0h1v2h-1Z",
};

/** Where the marker's tip sits in its 10×10 viewBox, for `refX`/`refY`. */
const ARROW_ANCHORS: Record<ArrowDirection, { refX: number; refY: number }> = {
  right: { refX: 9, refY: 4 },
  down: { refX: 4, refY: 9 },
  left: { refX: 0, refY: 4 },
  up: { refX: 4, refY: 0 },
};

type ArrowDirection = "right" | "down" | "left" | "up";

/**
 * The tail Mermaid appends to every flowchart marker id, e.g.
 * `…-pointEnd`, `…-pointStart-margin`. Stripping it recovers the diagram's marker
 * stem, so a per-direction arrow can be named under the same stem.
 */
const MARKER_SUFFIX = /-(?:pointEnd|pointStart|circleEnd|circleStart)(?:-margin)?$/;

/**
 * The direction of an edge path's *last* segment.
 *
 * The arrowhead sits at the edge's end, so it must point the way the edge was
 * travelling when it arrived — not a fixed direction. This reads the final two
 * distinct points of the (already squared, integer) path and snaps to the
 * dominant axis, defaulting to right for a zero-length tail.
 */
function lastSegmentDirection(pathData: string): ArrowDirection {
  const points = [...pathData.matchAll(/(-?\d+)\s*,\s*(-?\d+)/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
  const end = points.at(-1);
  const start = [...points].reverse().find((point) => point !== end && (point.x !== end?.x || point.y !== end?.y));
  if (!end || !start) return "right";
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? "down" : "up";
  return dx >= 0 ? "right" : "left";
}

/** Build one `orient="0"` marker per direction, reusing the edge's own id stem. */
function installArrowMarkers(svg: SVGSVGElement, stem: string): void {
  const defs = svg.querySelector("defs") ?? svg.insertBefore(
    document.createElementNS("http://www.w3.org/2000/svg", "defs"),
    svg.firstChild,
  );
  for (const direction of Object.keys(ARROW_PATHS) as ArrowDirection[]) {
    const anchor = ARROW_ANCHORS[direction];
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", `chicago-arrow-${stem}-${direction}`);
    marker.setAttribute("orient", "0");
    marker.setAttribute("markerUnits", "userSpaceOnUse");
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "10");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", String(anchor.refX));
    marker.setAttribute("refY", String(anchor.refY));
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ARROW_PATHS[direction]);
    path.setAttribute("shape-rendering", "crispEdges");
    marker.append(path);
    defs.append(marker);
  }
}

/**
 * Decorate the rendered SVG: crisp edges, a dither pattern, a highlighted node.
 *
 * Mermaid renders 1:1 with `useMaxWidth: false`, so the SVG is never scaled.
 * `shape-rendering: crispEdges` (here and in the stylesheet) keeps the 1px
 * strokes on the pixel grid; edges are squared to axis-aligned steps and each
 * edge end is given a stepped arrowhead matching its own last-segment direction.
 */
function decorateMermaid(svg: SVGSVGElement): void {
  svg.setAttribute("shape-rendering", "crispEdges");

  const edges = [...svg.querySelectorAll<SVGPathElement>(".edgePaths path, path.flowchart-link")];
  for (const edge of edges) {
    const current = edge.getAttribute("d");
    if (current) {
      edge.setAttribute("d", squareEdgeCorners(current).replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n)))));
    }
  }

  // Replace Mermaid's smooth, shared markers with per-direction stepped ones and
  // point every edge at the arrow that matches how its last segment travels.
  const stems = new Set(
    [...svg.querySelectorAll("marker")].map((marker) =>
      marker.id.replace(MARKER_SUFFIX, ""),
    ),
  );
  for (const marker of svg.querySelectorAll("marker")) {
    marker.remove();
  }
  for (const stem of stems) {
    installArrowMarkers(svg, stem);
  }
  for (const edge of edges) {
    const markerEnd = edge.getAttribute("marker-end");
    if (!markerEnd) continue;
    const stem = markerEnd.replace(/^url\(#/, "").replace(/\)$/, "").replace(MARKER_SUFFIX, "");
    const direction = lastSegmentDirection(edge.getAttribute("d") ?? "");
    edge.setAttribute("marker-end", `url(#chicago-arrow-${stem}-${direction})`);
  }

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML =
    '<pattern id="chicago-d50" width="2" height="2" patternUnits="userSpaceOnUse">' +
    '<rect width="2" height="2" style="fill:var(--paper)"/>' +
    '<rect width="1" height="1" style="fill:var(--ink)"/>' +
    '<rect x="1" y="1" width="1" height="1" style="fill:var(--ink)"/></pattern>';
  svg.prepend(defs);

  const nodes = [...svg.querySelectorAll<SVGGElement>(".node")];
  const key = nodes.find((node) => node.textContent?.includes("合一"));
  const rect = key?.querySelector("rect");
  if (key && rect) {
    rect.classList.add("key");
    const group = key.querySelector<SVGGElement>(".label") ?? key;
    const box = group.getBBox();
    const backing = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    backing.setAttribute("x", String(box.x - 3));
    backing.setAttribute("y", String(box.y - 1));
    backing.setAttribute("width", String(box.width + 6));
    backing.setAttribute("height", String(box.height + 2));
    backing.classList.add("lblbg");
    group.prepend(backing);
  }
}

/** A Mermaid diagram with the design's 1-bit theme; falls back to the source. */
function MermaidBlock({ code }: { code: string }) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    mermaid.initialize(MERMAID_THEME);
    // The design's "key node" marker is a comment, not real Mermaid syntax.
    const source = code.replace(/\n\s*style \w+ fill-pattern/, "");
    void mermaid
      .render(`chicago-mermaid-${reactId}`, source)
      .then(({ svg }) => {
        if (cancelled || !container) return;
        container.innerHTML = svg;
        const rendered = container.querySelector("svg");
        if (rendered) decorateMermaid(rendered);
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
      <figure className="mermaid-box" aria-label={strings.content.diagramLabel}>
        <p role="alert">{strings.content.mermaidError}</p>
        <pre className="code-block">
          <code>{code}</code>
        </pre>
      </figure>
    );
  }
  return <div className="mermaid-box" ref={containerRef} aria-label={strings.content.diagramLabel} />;
}

/**
 * Render one classified content node.
 *
 * A `question` callout is routed to the Exercise slot by core before it reaches
 * here; the remaining callouts (note/warning) become inline dialogs.
 */
export function ChicagoContentNode({ node }: NodeProps): ReactNode {
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
        <div className="callout" data-tone={node.calloutType}>
          <div className="callout-head">{node.title || strings.content.noticeLabel}</div>
          <Markdown markdown={node.body} />
        </div>
      );
    case "markdown":
      return <Markdown markdown={node.markdown} />;
    default:
      return null;
  }
}

/** Re-export the HAST helpers the renderer composes with. */
export type { HastElement, HastRoot };
