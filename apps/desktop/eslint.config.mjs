import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Dependency direction, enforced as import bans.
 *
 * The layers are `renderer -> preload -> main -> agent -> Pi`, with `shared`
 * below all of them. `core` must never import a skin (only `skins/contract`,
 * which is the contract), skins must not import each other, and the renderer and
 * the Node-side processes must not reach across the IPC boundary.
 */
/**
 * File length ratchet. A source file may hold 300 code lines (blank lines and
 * comments not counted); split it before it grows past that. Files that were
 * already longer on 2026-11-16 are capped at their length then, in
 * max-lines-baseline.json: they may only shrink. Lower a number there after a
 * split; never raise one.
 */
const MAX_LINES = 300;
const MAX_LINES_BASELINE = JSON.parse(readFileSync(fileURLToPath(new globalThis.URL("./max-lines-baseline.json", import.meta.url)), "utf8"));
const maxLines = (max) => [
  "error",
  { max, skipBlankLines: true, skipComments: true },
];

/** Every skin directory under `src/renderer/skins/`; add a new skin here. */
const SKINS = ["bare", "chicago", "bear"];
/** Animation libraries: only a skin decides how things move (AGENTS.md §13). */
const ANIMATION_RE = "^(motion|framer-motion|radix-ui|gsap|@animate-ui/[^/]+)(/.*)?$";
const FROM_RENDERER = ["**/main/**", "**/agent/**"];
const FROM_CORE = [...FROM_RENDERER, ...SKINS.map((id) => `**/skins/${id}/**`), "**/skins/registry*"];
const FROM_NODE_SIDE = ["**/renderer/**"];
/** A skin may use animation libraries but not another skin or the Node side. */
const fromSkin = (id) => [...FROM_RENDERER, ...SKINS.filter((other) => other !== id).map((other) => `**/skins/${other}/**`)];

/**
 * A `no-restricted-imports` configuration for one file group; `noAnimation`
 * also bans the animation libraries (everything outside a skin).
 */
function restricted(group, message, noAnimation = false) {
  const patterns = [{ group, message }];
  if (noAnimation) {
    patterns.push({ regex: ANIMATION_RE, message: "only skins may import animation libraries (AGENTS.md §13)." });
  }
  return ["error", { patterns }];
}

export default tseslint.config(
  // Bundled third-party code (see its SOURCE.txt) is not ours to lint, like node_modules.
  { ignores: ["out/**", "dist/**", "node_modules/**", "*.tsbuildinfo", "src/renderer/skins/bear/vendor/**/*.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='localeCompare']",
          message:
            "localeCompare sorts by the machine's language (CI is en-US, so 甲/乙 flip); use compareText from src/shared/text-order.ts.",
        },
      ],
    },
  },
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restricted(
        FROM_RENDERER,
        "renderer must go through the preload bridge, not import main/ or agent/.",
        true,
      ),
    },
  },
  {
    files: ["src/renderer/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restricted(
        FROM_CORE,
        "core is skin-agnostic and renderer-only; import skins/contract, not a skin.",
        true,
      ),
    },
  },
  ...SKINS.map((id) => ({
    files: [`src/renderer/skins/${id}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": restricted(
        fromSkin(id),
        "skins must not import another skin or the Node-side processes.",
      ),
    },
  })),
  {
    files: ["src/main/**/*.{ts,tsx}", "src/agent/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restricted(
        FROM_NODE_SIDE,
        "main/ and agent/ must not import renderer code.",
      ),
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: { "max-lines": maxLines(MAX_LINES) },
  },
  ...Object.entries(MAX_LINES_BASELINE).map(([file, max]) => ({
    files: [file],
    rules: { "max-lines": maxLines(max) },
  })),
  prettier,
);
