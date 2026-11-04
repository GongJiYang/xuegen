import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

/**
 * Dependency direction, enforced as import bans.
 *
 * The layers are `renderer -> preload -> main -> agent -> Pi`, with `shared`
 * below all of them. `core` must never import a skin (only `skins/contract`,
 * which is the contract), skins must not import each other, and the renderer and
 * the Node-side processes must not reach across the IPC boundary.
 */
const FROM_RENDERER = ["**/main/**", "**/agent/**"];
const FROM_CORE = [...FROM_RENDERER, "**/skins/bare/**", "**/skins/chicago/**", "**/skins/registry*"];
const FROM_BARE = [...FROM_RENDERER, "**/skins/chicago/**"];
const FROM_CHICAGO = [...FROM_RENDERER, "**/skins/bare/**"];
const FROM_NODE_SIDE = ["**/renderer/**"];

/** A `no-restricted-imports` configuration for one file group. */
function restricted(group, message) {
  return ["error", { patterns: [{ group, message }] }];
}

export default tseslint.config(
  { ignores: ["out/**", "node_modules/**", "*.tsbuildinfo"] },
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
    },
  },
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restricted(
        FROM_RENDERER,
        "renderer must go through the preload bridge, not import main/ or agent/.",
      ),
    },
  },
  {
    files: ["src/renderer/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restricted(
        FROM_CORE,
        "core is skin-agnostic and renderer-only; import skins/contract, not a skin.",
      ),
    },
  },
  {
    files: ["src/renderer/skins/bare/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restricted(
        FROM_BARE,
        "skins must not import another skin or the Node-side processes.",
      ),
    },
  },
  {
    files: ["src/renderer/skins/chicago/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restricted(
        FROM_CHICAGO,
        "skins must not import another skin or the Node-side processes.",
      ),
    },
  },
  {
    files: ["src/main/**/*.{ts,tsx}", "src/agent/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restricted(
        FROM_NODE_SIDE,
        "main/ and agent/ must not import renderer code.",
      ),
    },
  },
  prettier,
);
