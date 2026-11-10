/**
 * `sandboxConfigFor`（阶段 4a-1）的形状与 guard 一致性。
 *
 * `config.ts` 的写清单是手抄 `guard/roles.ts` 的 `writeAllowed`（注释「改一处
 * 要改两处」）。重构不是这一单的事，这里先用测试把两边钉住：
 *
 * 1. 形状：网络只放 AnkiConnect、不设 `allowLocalBinding`；文件系统条目全是
 *    `{ path, literal: true }` 的绝对路径；`denyRead` 就是 `deniedReadPaths`；
 *    `allowWrite` / `denyWrite` 覆盖各自那一组 `rulePaths` 键。
 * 2. 一致性（核心）：沙盒放行的写，guard 的 `write/edit` 也必须放行——沙盒绝不
 *    比 guard 宽。反方向不要求（guard 放行的课程页、看板、周期、日历由专用工具
 *    独占，bash 一律拦），但「guard 放行而沙盒拦」的样本必须全部落在那几类里，
 *    多出别的键就是手抄漏了。
 * 3. 课程会话不能经 bash 写课程页与概念页；自由会话写概念页放行。
 * 4. 库路径里带 glob 字符（`[`、`*`）时，条目仍按字面路径送达沙盒。
 *
 * 不启动真正的 seatbelt：`runner.ts` 不在这一单的范围内（真沙盒回归属于接入后
 * 的 4a-2）。
 */

import { isAbsolute } from "node:path";
import { describe, expect, it } from "vitest";
import type { FilesystemPathEntry } from "@anthropic-ai/sandbox-runtime";
import { within } from "../guard/path.js";
import { decide } from "../guard/roles.js";
import { deniedReadPaths, rulePaths, type CanonFn, type Roots, type RulePaths } from "../guard/vault-paths.js";
import type { SessionRole } from "../../shared/protocol.js";
import { sandboxConfigFor } from "./config.js";

const V = "/vault";
const W = "/home/learning";
const H = "/home/.xuegen";
const R = "/repo";

const roots: Roots = { vault: V, workspace: W, home: H, repo: R, temp: "/private/var/folders/x/T" };

/** Paths are already canonical here: this tests the lists, not `canonical`. */
const canon: CanonFn = (path: string): string => {
  if (path.startsWith("~")) return path.replace("~", "/home/user");
  return path.startsWith("/") ? path : `${V}/${path}`;
};

/** Nothing exists, unless the test says otherwise（原料只许新增，写新文件用 false）. */
const nothing = (): boolean => false;

const controlRole: SessionRole = { kind: "control" };
const courseRole: SessionRole = { kind: "course", slug: "discrete-math-epp" };
const freeRole: SessionRole = { kind: "free" };

const ROLES: readonly { name: string; role: SessionRole }[] = [
  { name: "control", role: controlRole },
  { name: "course", role: courseRole },
  { name: "free", role: freeRole },
];

/** `RulePaths` 的键；用于遍历「每个键取一个代表路径」。 */
const RULE_KEYS = Object.keys(rulePaths(roots, canon)) as (keyof RulePaths)[];

/** 键里放的是文件而不是目录（`wiki/log.md` 这类单文件规则）。 */
const FILE_KEYS = new Set<keyof RulePaths>(["log", "index", "profile", "subjectBoard", "coursesBoard"]);

/** Parse a filesystem list into its literal entries, asserting the shape on the way. */
function entries(list: readonly FilesystemPathEntry[]): { path: string; literal: true }[] {
  return list.map((entry) => {
    // A bare string would be *pattern* syntax: a directory named `v[1]` or `a*b`
    // must never be read that way.
    expect(typeof entry, `expected a literal entry, got the string ${String(entry)}`).toBe("object");
    if (typeof entry === "string") throw new Error(`not a literal entry: ${entry}`);
    expect(entry.literal, `entry ${entry.path} is not marked literal`).toBe(true);
    expect(isAbsolute(entry.path), `entry ${entry.path} is not absolute`).toBe(true);
    return { path: entry.path, literal: entry.literal };
  });
}

function pathsOf(list: readonly FilesystemPathEntry[]): string[] {
  return entries(list).map((entry) => entry.path);
}

/** 沙盒放行写 `target`：落在某个 allowWrite 项之内，且不在任何 denyWrite 项之内。 */
function sandboxAllowsWrite(config: ReturnType<typeof sandboxConfigFor>, target: string): boolean {
  const allowed = pathsOf(config.filesystem.allowWrite).some((dir) => within(target, dir));
  const denied = pathsOf(config.filesystem.denyWrite).some((dir) => within(target, dir));
  return allowed && !denied;
}

interface Sample {
  /** 这条样本来自哪个 `rulePaths` 键（不是规则路径时为 null）。 */
  key: keyof RulePaths | null;
  path: string;
}

/** `rulePaths` 每个键下每个目录/文件各取一个代表路径，再加上库内不属于任何规则的路径。 */
function samples(rules: RulePaths): Sample[] {
  const list: Sample[] = [];
  for (const key of RULE_KEYS) {
    for (const entry of rules[key]) {
      // 目录取 `<dir>/x.md`，单文件规则取它本身。
      const isFile = FILE_KEYS.has(key) || entry.endsWith(".md");
      list.push({ key, path: isFile ? entry : `${entry}/x.md` });
    }
  }
  list.push({ key: null, path: `${V}/wiki/x.md` }, { key: null, path: `${V}/notes/y.md` });
  return list;
}

/**
 * 允许「guard 放行、沙盒拦」的键：这些位置由专用工具独占（课程页与看板、周期、
 * 日历），bash 一律不写。
 *
 * `clippings`（原料剪藏）是**刻意的窄**：guard 只许新增（`write` 到一个不存在的
 * 路径才放行），沙盒的清单只有「整个目录」一种粒度，放开就会让 bash 覆盖已有原料
 * ——与本单要求的方向（沙盒不比 guard 宽）相反，所以宁可不放。见报告。
 */
const NARROW_BY_DESIGN = new Set<keyof RulePaths>(["courses", "coursesBoard", "cycles", "calendar", "clippings"]);

const ALLOWED_DOMAINS = ["127.0.0.1:8765"];

describe("sandboxConfigFor — 形状", () => {
  for (const { name, role } of ROLES) {
    it(`${name}：网络只放 127.0.0.1:8765，不设 allowLocalBinding`, () => {
      const config = sandboxConfigFor(role, roots, canon);
      expect(config.network.allowedDomains).toEqual(ALLOWED_DOMAINS);
      // 11-10 定：不开本地端口绑定，Anki 走代理的放行域名。
      expect(config.network).not.toHaveProperty("allowLocalBinding");
      expect(JSON.stringify(config)).not.toContain("allowLocalBinding");
    });

    it(`${name}：清单全是字面绝对路径，denyRead 就是 deniedReadPaths，写清单覆盖两组键`, () => {
      const config = sandboxConfigFor(role, roots, canon);
      const rules = rulePaths(roots, canon);

      // 三个清单的每一项都是 { path, literal: true } 的绝对路径（`entries` 已断言）。
      const denyRead = pathsOf(config.filesystem.denyRead);
      const allowWrite = pathsOf(config.filesystem.allowWrite);
      const denyWrite = pathsOf(config.filesystem.denyWrite);
      expect(denyRead).toEqual(deniedReadPaths(roots, canon).map(canon));
      expect(new Set(denyRead)).toEqual(new Set(deniedReadPaths(roots, canon)));

      // denyWrite：版本目录（.git/.jj）、raw/、库规则（wiki/prompts、库根 AGENTS.md）、
      // 课程页与看板（两种拼写）、周期、日历，外加 repo 与 home。
      expect(denyWrite).toEqual(expect.arrayContaining([R, H]));
      for (const key of ["version", "raw", "vaultRules", "courses", "coursesBoard", "cycles", "calendar"] as const) {
        expect(denyWrite, `denyWrite 少了 ${key}`).toEqual(expect.arrayContaining(rules[key]));
      }
      // 名字对齐本单列举的路径，防止 rulePaths 某天悄悄改名。
      expect(denyWrite).toEqual(
        expect.arrayContaining([
          `${V}/.git`,
          `${V}/.jj`,
          `${V}/raw`,
          `${V}/wiki/prompts`,
          `${V}/AGENTS.md`,
          `${V}/wiki/courses`,
          `${V}/wiki/courses.md`,
          `${V}/wiki/_generated/courses.md`,
          `${V}/wiki/cycles`,
          `${V}/wiki/calendar`,
        ]),
      );

      // allowWrite：工作区、每条 tmp，以及任何会话都能写的进度与知识页。
      expect(allowWrite).toEqual(expect.arrayContaining([W, ...rules.tmp]));
      const anySession = [
        "shelf",
        "reading",
        "extracts",
        "flashcards",
        "sources",
        "synthesis",
        "entities",
        "log",
        "index",
      ] as const;
      for (const key of anySession) expect(allowWrite, `allowWrite 少了 ${key}`).toEqual(expect.arrayContaining(rules[key]));
    });
  }
});

describe("sandboxConfigFor — 与 guard 一致（沙盒不比 guard 宽）", () => {
  for (const { name, role } of ROLES) {
    it(`${name}：沙盒放行的每一处，decide(role, "write") 也放行`, () => {
      const config = sandboxConfigFor(role, roots, canon);
      const rules = rulePaths(roots, canon);
      /** guard 放行、沙盒拦下的样本：只允许落在专用工具独占的位置。 */
      const narrower: Sample[] = [];

      for (const sample of samples(rules)) {
        const decision = decide(role, "write", { path: sample.path }, roots, canon, nothing);
        if (sandboxAllowsWrite(config, sample.path)) {
          expect(decision.allow, `${name} 沙盒放行 ${sample.path} 但 guard 拦了：${decision.reason}`).toBe(true);
        } else if (decision.allow) {
          narrower.push(sample);
        }
      }

      // 反方向不要求，但多出来的键就是手抄漏了（或沙盒悄悄放宽了）。
      const unexpected = narrower.filter((sample) => sample.key === null || !NARROW_BY_DESIGN.has(sample.key));
      expect(
        unexpected.map((sample) => `${sample.key ?? "(非规则路径)"}: ${sample.path}`),
        `guard 放行而沙盒拦下的样本里有不属于【专用工具独占】的位置`,
      ).toEqual([]);
    });
  }
});

describe("sandboxConfigFor — 课程会话的写边界", () => {
  it("course 不许经 bash 写课程页与概念页（两种知识目录拼写），free 写概念页放行", () => {
    const courseConfig = sandboxConfigFor(courseRole, roots, canon);
    for (const path of [
      `${V}/wiki/courses/discrete-math-epp.md`,
      `${V}/wiki/knowledge/concepts/x.md`,
      `${V}/wiki/知识/concepts/x.md`,
    ]) {
      expect(sandboxAllowsWrite(courseConfig, path), path).toBe(false);
    }

    const freeConfig = sandboxConfigFor(freeRole, roots, canon);
    for (const path of [`${V}/wiki/knowledge/concepts/x.md`, `${V}/wiki/知识/concepts/x.md`]) {
      expect(sandboxAllowsWrite(freeConfig, path), path).toBe(true);
    }
  });
});

describe("sandboxConfigFor — 原料剪藏刻意不开（清单粒度做不到「只许新增」）", () => {
  it("clippings / Clippings 不在 allowWrite 里；guard 只对新文件放行", () => {
    const rules = rulePaths(roots, canon);
    for (const { name, role } of ROLES) {
      const config = sandboxConfigFor(role, roots, canon);
      for (const path of rules.clippings.flatMap((dir) => [`${dir}/新链接.md`, `${dir}/已有剪藏.md`])) {
        expect(sandboxAllowsWrite(config, path), `${name}: ${path}`).toBe(false);
      }
    }
    // guard 的规则是「write 到一个不存在的路径才放行」（原料只许新增）。沙盒清单只有
    // 「整个目录」的粒度，放开 clippings 就等于让 bash 覆盖已有原料——比 guard 宽，
    // 所以宁愿窄在这里：剪藏用 write 工具（不经沙盒）就照常工作。
    const newClip = `${V}/clippings/新链接.md`;
    expect(decide(freeRole, "write", { path: newClip }, roots, canon, nothing).allow).toBe(true);
    expect(decide(freeRole, "write", { path: newClip }, roots, canon, () => true).allow).toBe(false);
  });
});

describe("sandboxConfigFor — 路径里的 glob 字符", () => {
  it("库根是 /v[1]/库* 时条目仍是字面路径，[ 与 * 原样保留", () => {
    const globVault = "/v[1]/库*";
    const globRoots: Roots = { ...roots, vault: globVault };
    const rules = rulePaths(globRoots, canon);
    const config = sandboxConfigFor(controlRole, globRoots, canon);

    // `pathsOf` 已经断言每一项都是 { path, literal: true } 的绝对路径；这里再看
    // 清单里确实是库内路径，且 `[1]` / `*` 原样保留（没有转义、没有展开）。
    const allowWrite = pathsOf(config.filesystem.allowWrite);
    const denyWrite = pathsOf(config.filesystem.denyWrite);
    // 两种库目录拼写都在清单里（`wiki/书房` / `wiki/shelf`、`wiki/知识` / `wiki/knowledge`）。
    expect(allowWrite).toContain(`${globVault}/wiki/书房`);
    expect(allowWrite).toContain(`${globVault}/wiki/knowledge/flashcards`);
    expect(denyWrite).toContain(`${globVault}/wiki/courses`);
    expect(denyWrite).toContain(`${globVault}/wiki/_generated/courses.md`);
    expect(denyWrite).toContain(`${globVault}/.git`);

    const vaultEntries = [...allowWrite, ...denyWrite].filter((path) => path.startsWith(globVault));
    expect(vaultEntries.length).toBeGreaterThan(0);
    for (const path of vaultEntries) {
      // 人工转义（`\\[1\\]`、`\\*`）会把字面路径写成一个不存在的位置。
      expect(path, path).not.toContain("\\");
    }

    // 反方向：清单里的每一条库内路径都真的来自 `rulePaths`（没有被 inlining 或转义弄成别的拼写）。
    const known = new Set(RULE_KEYS.flatMap((key) => rules[key]));
    for (const path of vaultEntries) {
      expect(known.has(path), `${path} 不是任何 rulePaths 项`).toBe(true);
    }
  });
});
