/**
 * HAST → React elements.
 *
 * `hast-util-to-jsx-runtime` needs a JSX runtime handed to it; this module wires
 * in React's and exposes one function. The skin uses it to render the core HAST
 * pipeline as React, which is what lets a skin style markdown with its own CSS
 * while core owns the parsing.
 *
 * Raw HTML never survives the parse (core disables it and sanitizes), so the
 * resulting tree is plain elements + text.
 */

import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { Root as HastRoot } from "hast";
import type { ReactNode } from "react";

/** Render a HAST tree to a React node. */
export function hastToReact(tree: HastRoot): ReactNode {
  return toJsxRuntime(tree, { Fragment, jsx, jsxs }) as ReactNode;
}
