/**
 * Skin registry: id -> lazy loader.
 *
 * The only place that knows the set of skins. `App` reads the metadata here (for
 * the appearance menu) and calls `load`, so a skin's stylesheet and components
 * load only when it is selected. Adding a skin means one entry here plus its
 * directory and registration in `docs/desktop/skins/README.md`.
 */

import type { SkinDefinition } from "./contract.js";

/** Every registered skin, in menu order. */
export const SKINS: SkinDefinition[] = [
  {
    id: "bare",
    name: "Bare（参照，无样式）",
    version: "1.1",
    description: "无样式语义 HTML；契约测试与兜底用，不面向日常使用。",
    load: async () => (await import("./bare/index.js")).bareSkin,
  },
  {
    id: "chicago",
    name: "Chicago",
    version: "1.10",
    description: "经典 Mac OS（System 6）黑白像素风；极简、专注阅读。",
    load: async () => (await import("./chicago/index.js")).chicagoSkin,
  },
  {
    id: "bear",
    name: "Bear",
    version: "1.0",
    description: "iA Writer / Bear：只有一栏正文，侧栏收进抽屉",
    load: async () => (await import("./bear/index.js")).bearSkin,
  },
];

/** The skin used when an id is unknown or a skin fails to load. */
export const FALLBACK_SKIN_ID = "bare";

/** All registered skin ids, in menu order. */
export function skinIds(): string[] {
  return SKINS.map((skin) => skin.id);
}

/** Find a skin definition by id, or undefined. */
export function findSkin(id: string): SkinDefinition | undefined {
  return SKINS.find((skin) => skin.id === id);
}
