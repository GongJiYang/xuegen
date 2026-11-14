/**
 * The role × path decision table (`guard/roles.ts`).
 *
 * Every row is a real workflow step taken from the skills: a place the model
 * writes to with `write` / `edit` (not through a script) and the session it
 * happens in. The canonical vault paths (`wiki/knowledge`, `wiki/shelf`, `clippings`) are covered.
 *
 * The table doubles as the review's 误拦 record: a row that says 允许 is a
 * normal flow that used to be blocked and is fixed here; a row marked
 * 「待定」 is a judgement call left to Claude (see `docs/platform/batch-stage2-
 * review.md` 报告).
 *
 * Reads were opened up (用户 2026-11-09 定：除凭据外都能读), so the 读 rows
 * only pin down two things: every credential path is refused, everything else
 * (库外、`/etc`、`<home>` 的非凭据文件) is allowed in every role.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nodePathFacts } from "./facts.js";
import { canonical, within } from "./path.js";
import { decide, roleLabel, type CanonFn, type Decision, type Roots } from "./roles.js";
import { deniedReadPaths, isCredentialName, isDeniedReadPath } from "./vault-paths.js";
import type { SessionRole } from "../../shared/protocol.js";

const V = "/vault";
const W = "/home/learning";
const H = "/home/.xuegen";
const R = "/repo";

const roots: Roots = { vault: V, workspace: W, home: H, repo: R, temp: "/private/var/folders/x/T" };

/** Paths are already canonical here: the table tests the rules, not `canonical`. */
const canon = (path: string): string => {
  if (path.startsWith("~")) return path.replace("~", "/Users/learner");
  return path.startsWith("/") ? path : `${V}/${path}`;
};

/** Nothing exists, unless the test says otherwise. */
const nothing = (): boolean => false;

const roles: Record<string, SessionRole> = {
  control: { kind: "control" },
  course: { kind: "course", slug: "discrete-math-epp" },
  free: { kind: "free" },
};

type Verdict = "allow" | "deny";

interface Row {
  /** What the model is doing, in words. */
  what: string;
  tool: string;
  path: string;
  /** The expected verdict per role, in the order control / course / free. */
  expected: [Verdict, Verdict, Verdict];
}

/** shorthand for a row allowed/denied for every role. */
const all = (verdict: Verdict): [Verdict, Verdict, Verdict] => [verdict, verdict, verdict];

const rows: Row[] = [
  // ---- 讲解偏好 / 意图页 (course skill「讲解偏好」) ----
  { what: "讲解偏好写科目页（以后讲离散都…）", tool: "edit", path: "wiki/subjects/discrete-math.md", expected: ["allow", "allow", "deny"] },
  { what: "科目页写成英文目录时（wiki/subjects 不变）", tool: "edit", path: "wiki/subjects/c-systems-programming.md", expected: ["allow", "allow", "deny"] },
  { what: "全局偏好页（用户明确要求时）", tool: "edit", path: "wiki/profile.md", expected: ["allow", "deny", "deny"] },
  { what: "科目路线表（登记资料）", tool: "edit", path: "wiki/subjects.md", expected: ["allow", "deny", "deny"] },
  // ---- 课程页 ----
  { what: "总控改课程计划（整理 1 起只经 course_plan 事务）", tool: "edit", path: "wiki/courses/ctm.md", expected: ["deny", "deny", "deny"] },
  { what: "课程会话直接改自己的课程页（3c 起只经 course_close 收课写）", tool: "edit", path: "wiki/courses/discrete-math-epp.md", expected: ["deny", "deny", "deny"] },
  { what: "课程会话改别的课程页（拒）", tool: "edit", path: "wiki/courses/ctm.md", expected: ["deny", "deny", "deny"] },
  { what: "课程自己的附属目录（records；3c 起只经 course_close）", tool: "write", path: "wiki/courses/discrete-math-epp/records/2026-11.md", expected: ["deny", "deny", "deny"] },
  { what: "课程截图（改名后的 courses/<slug>/snapshots/；3c 起只经 course_close）", tool: "write", path: "wiki/courses/discrete-math-epp/snapshots/2026-11-09-01.png", expected: ["deny", "deny", "deny"] },
  { what: "课程截图（courses/<slug>-*.png；3c 起只经 course_close）", tool: "write", path: "wiki/courses/discrete-math-epp-2026-11-09-01.png", expected: ["deny", "deny", "deny"] },
  { what: "课程看板", tool: "edit", path: "wiki/_generated/courses.md", expected: ["deny", "deny", "deny"] },
  // ---- 知识 ----
  { what: "概念页（收课时写；3c 起课程会话只经 course_close）", tool: "write", path: "wiki/knowledge/concepts/discrete-math/010-variables.md", expected: ["deny", "deny", "allow"] },
  { what: "概念页（改名后的英文目录）", tool: "write", path: "wiki/knowledge/concepts/discrete-math/010-variables.md", expected: ["deny", "deny", "allow"] },
  { what: "闪卡页（wiki-save 制卡）", tool: "write", path: "wiki/knowledge/flashcards/discrete-math/010-variables.md", expected: ["allow", "allow", "allow"] },
  { what: "闪卡页（英文目录）", tool: "write", path: "wiki/knowledge/flashcards/discrete-math/010-variables.md", expected: ["allow", "allow", "allow"] },
  { what: "摘录页（reading 技能，自由会话里也说）", tool: "write", path: "wiki/knowledge/extracts/epp/2026-11-09-闭包.md", expected: ["allow", "allow", "allow"] },
  { what: "摘录页（英文目录）", tool: "write", path: "wiki/knowledge/extracts/epp/2026-11-09-闭包.md", expected: ["allow", "allow", "allow"] },
  { what: "来源登记页（加书时按 wiki-save 建）", tool: "write", path: "wiki/knowledge/sources/2026-11-09-epp.md", expected: ["allow", "allow", "allow"] },
  { what: "来源登记页（英文目录）", tool: "write", path: "wiki/knowledge/sources/2026-11-09-epp.md", expected: ["allow", "allow", "allow"] },
  { what: "综合分析页（wiki-save 整理文档关系，任何会话都能跑）", tool: "write", path: "wiki/knowledge/synthesis/linker-map.md", expected: ["allow", "allow", "allow"] },
  { what: "综合分析页（英文目录）", tool: "write", path: "wiki/knowledge/synthesis/linker-map.md", expected: ["allow", "allow", "allow"] },
  { what: "实体页（wiki-save 主理）", tool: "edit", path: "wiki/knowledge/entities/math/godel.md", expected: ["allow", "allow", "allow"] },
  { what: "实体页（英文目录）", tool: "edit", path: "wiki/knowledge/entities/discrete-math/godel.md", expected: ["allow", "allow", "allow"] },
  // ---- 书房 / 阅读队列 / 日历 ----
  { what: "书房书页（加书、分段、不读）", tool: "write", path: "wiki/shelf/epp.md", expected: ["allow", "allow", "allow"] },
  { what: "阅读队列页正文补充 Extracts", tool: "edit", path: "wiki/reading/epp-ch2.md", expected: ["allow", "allow", "allow"] },
  { what: "日历笔记（只由 calendar.mjs 写，write 直接写被拒）", tool: "write", path: "wiki/calendar/2026-11-09.md", expected: ["deny", "deny", "deny"] },
  { what: "改库规则与提示词 wiki/prompts/**（模型不改自己的规则）", tool: "edit", path: "wiki/prompts/wiki/flashcard-rules.md", expected: all("deny") },
  { what: "改库根 AGENTS.md（模型不改自己的规则）", tool: "edit", path: "AGENTS.md", expected: all("deny") },
  // ---- 日志与索引 ----
  { what: "wiki/log.md 追加", tool: "edit", path: "wiki/log.md", expected: ["allow", "allow", "allow"] },
  { what: "wiki/index.md 登记", tool: "edit", path: "wiki/index.md", expected: ["allow", "allow", "allow"] },
  // ---- 意图页（周期） ----
  { what: "周期页（总控新建周期）", tool: "write", path: "wiki/cycles/c2.md", expected: ["allow", "deny", "deny"] },
  // ---- 原料：raw/ 只读、剪藏只许新增 ----
  { what: "raw/ 新增教材（write 也不写：raw 是用户放进来的外界材料，AI 只读）", tool: "write", path: "raw/books/epp.pdf", expected: all("deny") },
  { what: "raw/ 修改已有原料（edit）", tool: "edit", path: "raw/notes/2026-11-09-剪藏.md", expected: all("deny") },
  { what: "剪藏新文件（reading 技能抓网页）", tool: "write", path: "clippings/如何读一本书.md", expected: ["allow", "allow", "allow"] },
  { what: "剪藏新文件（改名后的 clippings）", tool: "write", path: "clippings/如何读一本书.md", expected: ["allow", "allow", "allow"] },
  // ---- 硬性拒绝 ----
  { what: "任何角色写程序目录", tool: "write", path: "/repo/src/x.ts", expected: all("deny") },
  { what: "任何角色写学根自己的目录", tool: "write", path: "/home/.xuegen/desktop.json", expected: all("deny") },
  { what: "库的版本目录", tool: "edit", path: "wiki/../.git/config", expected: all("deny") },
  { what: "库外随便一个位置", tool: "write", path: "/Users/learner/Desktop/x.md", expected: all("deny") },
  { what: "工作区里的笔记", tool: "write", path: "/home/learning/notes/x.md", expected: all("allow") },
  { what: "/private/tmp 里的临时文件", tool: "write", path: "/private/tmp/x.md", expected: all("allow") },
  { what: "os.tmpdir() 给的临时目录（macOS 是 /private/var/folders/…/T）", tool: "write", path: "/private/var/folders/x/T/xuegen-plan.json", expected: all("allow") },
  { what: "临时目录之外的同名结构（不是 tmpdir 的父目录）", tool: "write", path: "/private/var/folders/x/other/x.md", expected: all("deny") },
  // ---- 读：除凭据外一律放行（用户 2026-11-09 定） ----
  { what: "读库外的 PDF（~/Downloads）", tool: "read", path: "/Users/learner/Downloads/x.pdf", expected: all("allow") },
  { what: "读别人桌面上的 Markdown", tool: "read", path: "/Users/anyone/Desktop/a.md", expected: all("allow") },
  { what: "读系统文件 /etc/hosts", tool: "read", path: "/etc/hosts", expected: all("allow") },
  { what: "grep 库外目录（路径参数同名 path）", tool: "grep", path: "/Users/learner/Downloads", expected: all("allow") },
  { what: "读库位置配置（每个技能的第一步）", tool: "read", path: "/home/.xuegen/wiki.json", expected: all("allow") },
  { what: "读审计日志（<home> 下非凭据文件也放行）", tool: "read", path: "/home/.xuegen/guard.log", expected: all("allow") },
  { what: "读学根的其他配置文件", tool: "read", path: "/home/.xuegen/desktop.json", expected: all("allow") },
  { what: "读库里的任意页", tool: "read", path: "wiki/courses/ctm.md", expected: all("allow") },
  { what: "grep 库（路径参数同名 path）", tool: "grep", path: "wiki", expected: all("allow") },
  { what: "find 库（path 是搜索根）", tool: "find", path: "wiki/courses", expected: all("allow") },
  { what: "ls 工作区", tool: "ls", path: W, expected: all("allow") },
  { what: "read 不带 path（默认 cwd）", tool: "read", path: "", expected: all("allow") },
  { what: "grep 不带 path（默认 cwd）", tool: "grep", path: "", expected: all("allow") },
  // ---- 读：凭据一律拒绝 ----
  { what: "读 auth.json", tool: "read", path: "/home/.xuegen/auth.json", expected: all("deny") },
  { what: "读 mcp-auth.json", tool: "read", path: "/home/.xuegen/mcp-auth.json", expected: all("deny") },
  { what: "读 models-store.json", tool: "read", path: "/home/.xuegen/models-store.json", expected: all("deny") },
  { what: "<home> 下名字带 token 的文件", tool: "read", path: "/home/.xuegen/github-token.txt", expected: all("deny") },
  { what: "<home> 下名字带 secret 的文件（全大写）", tool: "read", path: "/home/.xuegen/CLIENT_SECRET.json", expected: all("deny") },
  { what: "<home> 子目录里的 key 文件", tool: "read", path: "/home/.xuegen/secrets/api-key.pem", expected: all("deny") },
  { what: "直接 ls <home>（会把凭据文件名列出来）", tool: "ls", path: H, expected: all("deny") },
  { what: "读 ssh 密钥", tool: "read", path: "/Users/learner/.ssh/id_ed25519", expected: all("deny") },
  { what: "读 ssh 目录（config 与 known_hosts 也在里面）", tool: "read", path: "/Users/learner/.ssh", expected: all("deny") },
  { what: "读 aws 凭据", tool: "read", path: "/Users/learner/.aws/credentials", expected: all("deny") },
  { what: "读 gnupg 私钥", tool: "read", path: "/Users/learner/.gnupg/secring.gpg", expected: all("deny") },
  { what: "读 gh 的 token 配置", tool: "read", path: "/Users/learner/.config/gh/hosts.yml", expected: all("deny") },
  { what: "读 ~/.netrc（旧式机器凭据）", tool: "read", path: "/Users/learner/.netrc", expected: all("deny") },
  { what: "读 ~/.npmrc（registry token）", tool: "read", path: "/Users/learner/.npmrc", expected: all("deny") },
  { what: "读 docker 的 registry 凭据", tool: "read", path: "/Users/learner/.docker/config.json", expected: all("deny") },
  { what: "读 macOS 钥匙串", tool: "read", path: "/Users/learner/Library/Keychains/login.keychain-db", expected: all("deny") },
  // ---- 未知工具（MCP 等）默认放行，见报告 ----
  { what: "MCP 工具没有 path 参数", tool: "mcp__obsidian__search", path: "", expected: all("allow") },
];

describe("decide — 角色 × 路径表", () => {
  for (const row of rows) {
    it(`${row.what}（${row.tool} ${row.path || "无 path"}）`, () => {
      const names = ["control", "course", "free"] as const;
      for (const [index, name] of names.entries()) {
        const role = roles[name];
        if (role === undefined) throw new Error(`missing role ${name}`);
        const input: Record<string, unknown> = row.path === "" ? {} : { path: row.path };
        const decision = decide(role, row.tool, input, roots, canon, nothing);
        expect(decision.allow, `${name}: ${decision.reason}`).toBe(row.expected[index] === "allow");
      }
    });
  }
});

describe("vault-paths — 凭据清单的纯函数", () => {
  it("isCredentialName matches auth / token / secret / key, case-insensitively", () => {
    for (const name of ["auth.json", "GitHub-TOKEN.txt", "client_secret.json", "API_KEY.md", "ssh-key.pem"]) {
      expect(isCredentialName(name), name).toBe(true);
    }
    for (const name of ["wiki.json", "guard.log", "desktop.json", "notes.md", "知识.md"]) {
      expect(isCredentialName(name), name).toBe(false);
    }
  });

  it("deniedReadPaths lists every credential location the user named", () => {
    const list = deniedReadPaths(roots, canon);
    for (const path of [
      "/home/.xuegen/auth.json",
      "/home/.xuegen/mcp-auth.json",
      "/home/.xuegen/models-store.json",
      "/Users/learner/.ssh",
      "/Users/learner/.aws",
      "/Users/learner/.gnupg",
      "/Users/learner/.config/gh",
      "/Users/learner/.netrc",
      "/Users/learner/.npmrc",
      "/Users/learner/.docker/config.json",
      "/Users/learner/Library/Keychains",
    ]) {
      expect(list, path).toContain(canon(path));
    }
  });

  it("isDeniedReadPath keeps <home> itself and its credential names, nothing else", () => {
    expect(isDeniedReadPath(H, roots, canon)).toBe(true);
    expect(isDeniedReadPath(`${H}/github-token.txt`, roots, canon)).toBe(true);
    expect(isDeniedReadPath(`${H}/wiki.json`, roots, canon)).toBe(false);
    // 库外的文件名带 `key` 只是个词，不拒（读取已放开）。
    expect(isDeniedReadPath("/Users/learner/Downloads/keyword.md", roots, canon)).toBe(false);
  });
});

describe("decide — 读：除凭据外都能读（用户 2026-11-09 定）", () => {
  const everyRole: SessionRole[] = [
    { kind: "control" },
    { kind: "course", slug: "discrete-math-epp" },
    { kind: "free" },
  ];
  /** One role × one read call, over the table's `canon`. */
  const allows = (role: SessionRole, tool: string, path: string, rootsFor: Roots = roots, canonFn: CanonFn = canon): boolean =>
    decide(role, tool, { path }, rootsFor, canonFn, nothing).allow;

  it("allows files anywhere outside the credential list, in every role", () => {
    // 库外的下载、别人的桌面、系统文件：用户明确要求能读。
    for (const path of ["/Users/learner/Downloads/x.pdf", "/Users/anyone/Desktop/a.md", "/etc/hosts"]) {
      for (const role of everyRole) expect(allows(role, "read", path), `${roleLabelOf(role)}: ${path}`).toBe(true);
    }
    // grep / find / ls 的 path 是同一个字段，判定与 read 一致。
    expect(allows(everyRole[1] as SessionRole, "grep", "/Users/learner/Downloads")).toBe(true);
    expect(allows(everyRole[2] as SessionRole, "ls", "/Users/learner/Documents")).toBe(true);
  });

  it("allows the non-credential files under <home>", () => {
    for (const path of ["/home/.xuegen/wiki.json", "/home/.xuegen/guard.log", "/home/.xuegen/desktop.json"]) {
      for (const role of everyRole) expect(allows(role, "read", path), `${roleLabelOf(role)}: ${path}`).toBe(true);
    }
  });

  it("denies every credential path, in every role", () => {
    for (const path of CREDENTIALS) {
      for (const role of everyRole) expect(allows(role, "read", path), `${roleLabelOf(role)}: ${path}`).toBe(false);
    }
  });

  it("denies credentials written in another case on a case-folding volume", () => {
    const folded = (path: string): string => canon(path).toLowerCase();
    for (const path of ["/HOME/.XUEGEN/AUTH.JSON", "/home/.xuegen/GitHub-TOKEN.txt", "/USERS/LEARNER/.SSH/ID_ED25519"]) {
      for (const role of everyRole) expect(allows(role, "read", path, roots, folded), path).toBe(false);
    }
  });

  it("denies <home> itself, since listing it names the credential files", () => {
    for (const role of everyRole) expect(allows(role, "ls", "/home/.xuegen")).toBe(false);
  });
  it("resolves symlinks before the check on the real filesystem", () => {
    // 真实路径的两种绕法：链接指向 `/` 再走 `.ssh`；好名字的文件指向 token 文件。
    const dir = mkdtempSync(join(tmpdir(), "xuegen-guard-read-"));
    try {
      const facts = nodePathFacts();
      /** The user's home as the real list names it (`~` is expanded against it). */
      const userHome = homedir();
      // Same canon the extension uses: expand `~` first, then resolve/case-fold.
      const real = (path: string): string => canonical(path.startsWith("~") ? path.replace("~", userHome) : path, dir, facts);
      const home = real(dir);
      const links = join(dir, "links");
      mkdirSync(links);
      symlinkSync("/", join(links, "root"));
      const credential = join(dir, "github-token.txt");
      writeFileSync(credential, "");
      symlinkSync(credential, join(links, "innocent.md"));
      const tempRoots: Roots = { vault: real(join(dir, "vault")), workspace: real(dir), home, repo: real(join(dir, "repo")) };

      // `/etc/hosts` 经链接读：不是凭据，放行。
      expect(allows(everyRole[2] as SessionRole, "read", join(links, "root/etc/hosts"), tempRoots, real)).toBe(true);
      // 名字无害但指向 token 文件：解析后按真名拒绝。
      expect(allows(everyRole[2] as SessionRole, "read", join(links, "innocent.md"), tempRoots, real)).toBe(false);
      // `/` 经链接下的 `.ssh`：解析后落在 ~/.ssh，拒绝。
      expect(
        allows(everyRole[2] as SessionRole, "read", join(links, "root", userHome.slice(1), ".ssh/id_ed25519"), tempRoots, real),
      ).toBe(false);
      // 链接下的 `<home>` 非凭据文件：放行。
      expect(allows(everyRole[2] as SessionRole, "read", join(links, "root", home.slice(1), "wiki.json"), tempRoots, real)).toBe(
        true,
      );
      // 同一个链接下对 `<home>` 目录本身（即 `ls`）：拒绝。
      expect(allows(everyRole[2] as SessionRole, "ls", join(links, "root", home.slice(1)), tempRoots, real)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("names the credential path in the Chinese reason", () => {
    const decision = decide(everyRole[2] as SessionRole, "read", { path: "/home/.xuegen/github-token.txt" }, roots, canon, nothing);
    expect(decision.reason).toContain("/home/.xuegen/github-token.txt");
    expect(decision.reason).toContain("凭据");
  });

  it("denies a credential written with `~` as well as with the full path", () => {
    for (const path of ["~/.ssh/id_ed25519", "~/.aws/credentials", "~/.netrc", "~/Library/Keychains/login.keychain-db"]) {
      for (const role of everyRole) expect(allows(role, "read", path), `${roleLabelOf(role)}: ${path}`).toBe(false);
    }
  });
});

describe("decide — 递归搜索的祖先漏洞（grep / find）", () => {
  const everyRole: SessionRole[] = [
    { kind: "control" },
    { kind: "course", slug: "discrete-math-epp" },
    { kind: "free" },
  ];
  const allows = (tool: string, path: string): boolean =>
    everyRole.every((role) => decide(role, tool, { path }, roots, canon, nothing).allow);
  const reason = (tool: string, path: string): string => decide(everyRole[2] as SessionRole, tool, { path }, roots, canon, nothing).reason;

  it("denies a recursive search rooted at an ancestor of a credential directory", () => {
    // `~`、`/Users`、`/`、`~/.config`、`~/Library`、`<home>` 的上级：都没有点名凭据，
    // 但递归走一遍就把它读出来了。
    for (const path of ["~", "/Users", "/", "~/.config", "~/Library", "/home"]) {
      for (const tool of ["grep", "find"]) expect(allows(tool, path), `${tool} ${path}`).toBe(false);
    }
  });

  it("names the credential directory it would reach and asks to narrow the search", () => {
    expect(reason("grep", "~")).toContain("凭据目录");
    expect(reason("grep", "~")).toContain("/Users/learner/.ssh");
    expect(reason("grep", "~/Library")).toContain("/Users/learner/Library/Keychains");
    expect(reason("find", "/Users")).toContain("/Users/learner/.ssh");
    // 直接搜 `<home>` 走的是「凭据路径」那条原因（`<home>` 本身就在清单里）。
    expect(reason("grep", "/home/.xuegen")).toContain("/home/.xuegen");
    expect(reason("grep", "/home")).toContain("缩小搜索范围");
  });

  it("allows a recursive search whose root holds no credential", () => {
    for (const path of ["~/Documents", "/vault", "/vault/wiki/courses", "/etc", "~/Downloads"]) {
      for (const tool of ["grep", "find"]) expect(allows(tool, path), `${tool} ${path}`).toBe(true);
    }
  });

  it("leaves read and a non-recursive ls alone, even at an ancestor of a credential", () => {
    // `ls` 只列一层，`read` 只开一个文件：它们不递归，不算绕过。
    expect(allows("ls", "~")).toBe(true);
    expect(allows("ls", "/Users")).toBe(true);
    expect(allows("read", "/Users/learner/Downloads/x.pdf")).toBe(true);
    // 而直接 `ls <home>` 仍然拒：文件名就是凭据清单（旧规则不变）。
    expect(allows("ls", "/home/.xuegen")).toBe(false);
  });
});

/** The credential list as the review asked for it: exact names, naming convention, standard locations. */
const CREDENTIALS = [
  "/home/.xuegen/auth.json",
  "/home/.xuegen/mcp-auth.json",
  "/home/.xuegen/models-store.json",
  "/home/.xuegen/github-token.txt",
  "/home/.xuegen/API_KEY.md",
  "/home/.xuegen/client-secret.json",
  "/home/.xuegen/backup/ssh-key.pem",
  "/Users/learner/.ssh/id_ed25519",
  "/Users/learner/.ssh",
  "/Users/learner/.aws/credentials",
  "/Users/learner/.gnupg/private-keys-v1.d/x.key",
  "/Users/learner/.config/gh/hosts.yml",
  "/Users/learner/.netrc",
  "/Users/learner/.npmrc",
  "/Users/learner/.docker/config.json",
  "/Users/learner/Library/Keychains/login.keychain-db",
];

function roleLabelOf(role: SessionRole): string {
  return role.kind === "course" ? `course:${role.slug}` : role.kind;
}

describe("decide — 原料只许新增（剪藏）", () => {
  it("allows writing a clip that does not exist yet", () => {
    const decision = decide(roles.free ?? { kind: "free" }, "write", { path: "clippings/新文章.md" }, roots, canon, () => false);
    expect(decision.allow).toBe(true);
  });

  it("denies overwriting an existing clip", () => {
    const decision = decide(roles.free ?? { kind: "free" }, "write", { path: "clippings/已有.md" }, roots, canon, () => true);
    expect(decision.allow).toBe(false);
    expect(decision.reason).toContain("只许新增");
  });

  it("denies editing any clip", () => {
    const decision = decide(roles.course ?? { kind: "free" }, "edit", { path: "clippings/已有.md" }, roots, canon, () => false);
    expect(decision.allow).toBe(false);
  });

  it("allows adding a clip but never writes into raw/ (raw is only read)", () => {
    const control: SessionRole = { kind: "control" };
    expect(decide(control, "write", { path: "clippings/新文章.md" }, roots, canon, () => false).allow).toBe(true);

    // 收缩：旧目录名不再被当成知识页——wiki/知识 下的写入按普通 wiki 页面拒绝。
    const legacy = decide(roles.free ?? { kind: "free" }, "write", { path: "wiki/知识/concepts/x.md" }, roots, canon, nothing);
    expect(legacy.allow).toBe(false);
    // 教材进 raw/books/ 由用户同意后用 bash 复制（`cp`），不经 write/edit。
    for (const tool of ["write", "edit"]) {
      expect(decide(control, tool, { path: "raw/books/epp.pdf" }, roots, canon, () => false).allow).toBe(false);
      expect(decide(control, tool, { path: "raw/notes/x.md" }, roots, canon, () => true).allow).toBe(false);
    }
  });
});

describe("decide — write/edit 缺 path", () => {
  it("denies instead of guessing a location", () => {
    const decision = decide(roles.control ?? { kind: "free" }, "write", {}, roots, canon, nothing);
    expect(decision.allow).toBe(false);  });
});

describe("decide — bash", () => {
  it("denies reading a credential path in the command", () => {
    const rolesFree: SessionRole = { kind: "free" };
    expect(decide(rolesFree, "bash", { command: "cat ~/.ssh/id_ed25519" }, roots, canon, nothing).allow).toBe(false);
    expect(decide(rolesFree, "bash", { command: "cat ~/Library/Keychains/login.keychain" }, roots, canon, nothing).allow).toBe(
      false,
    );
  });

  it("denies rm -rf outside the workspace", () => {
    const rolesFree: SessionRole = { kind: "free" };
    expect(decide(rolesFree, "bash", { command: "rm -rf wiki/knowledge" }, roots, canon, nothing).allow).toBe(false);
    expect(decide(rolesFree, "bash", { command: `rm -rf ${W}/tmp` }, roots, canon, nothing).allow).toBe(true);
    expect(decide(rolesFree, "bash", { command: "rm -rf /private/tmp/xuegen-tmp" }, roots, canon, nothing).allow).toBe(
      true,
    );
  });

  it("catches the other spellings of a recursive remove", () => {
    const rolesFree: SessionRole = { kind: "free" };
    for (const command of ["rm -fr wiki", "rm -Rf wiki/knowledge", "rm --recursive wiki/courses", "rm -r wiki/courses"]) {
      expect(decide(rolesFree, "bash", { command }, roots, canon, nothing).allow, command).toBe(false);
    }
    // A single-file delete in the vault is a normal workflow step (e.g. an empty
    // daily note); only recursive removal is judged at the tool layer.
    expect(decide(rolesFree, "bash", { command: "rm wiki/calendar/2026-11-09.md" }, roots, canon, nothing).allow).toBe(
      true,
    );
  });

  it("denies chmod on a course page unless course-state.mjs runs it", () => {
    const rolesFree: SessionRole = { kind: "free" };
    expect(decide(rolesFree, "bash", { command: "chmod 444 wiki/courses/ctm.md" }, roots, canon, nothing).allow).toBe(
      false,
    );
    expect(
      decide(
        rolesFree,
        "bash",
        { command: "node skills/course/course-state.mjs lock wiki/courses/ctm.md" },
        roots,
        canon,
        nothing,
      ).allow,
    ).toBe(true);
  });

  it("allows ordinary read-only commands", () => {
    const rolesFree: SessionRole = { kind: "free" };
    expect(decide(rolesFree, "bash", { command: "ls wiki/courses" }, roots, canon, nothing).allow).toBe(true);
  });

  // 用户 11-08 定的规矩：课上读原书一次不超过 10 页。规矩原来只在技能文字里，
  // 11-10 全量测试里模型直接跑 `pdftotext -f 1 -l 20`，所以在这里写死。
  it("denies pdftotext reading more than 10 pages at once, in every role", () => {
    const tooWide = [
      "pdftotext -f 40 -l 58 raw/books/x.pdf -",
      "pdftotext -f 1 -l 11 x.pdf -",
      "cd /v && pdftotext -layout -f 60 -l 76 raw/x.pdf - | grep foo",
      "pdftotext raw/x.pdf -",
      "pdftotext -f 5 raw/x.pdf -",
    ];
    for (const role of [roles.control, roles.course, roles.free] as SessionRole[]) {
      for (const command of tooWide) {
        const decision = decide(role, "bash", { command }, roots, canon, nothing);
        expect(decision.allow, `${roleLabelOf(role)} ${command}`).toBe(false);
        expect(decision.reason, command).toContain("10 页");
        // 理由以角色名开头，和 chmod / 递归删除那些拒绝理由的写法一致。
        expect(
          decision.reason.startsWith(roleLabel(role)),
          `${roleLabelOf(role)} ${command}: ${decision.reason}`,
        ).toBe(true);
      }
    }
  });

  it("allows pdftotext ranges of at most 10 pages and non-pdftotext commands", () => {
    const fine = [
      "pdftotext -f 45 -l 48 x.pdf -",
      "pdftotext -f 1 -l 10 -layout x.pdf -",
      "pdftotext -f 74 -l 79 x.pdf - | sed -n '1,200p'",
      "pdftotext -f $A -l $B x.pdf -",
      "node bookshelf.mjs today raw/books/x.pdf",
      "echo pdftotext",
    ];
    for (const role of [roles.control, roles.course, roles.free] as SessionRole[]) {
      for (const command of fine) {
        expect(decide(role, "bash", { command }, roots, canon, nothing).allow, `${roleLabelOf(role)} ${command}`).toBe(
          true,
        );
      }
    }
  });
});

describe("decide — course_close：只有课程会话、只收本课（阶段 3c）", () => {
  const course: SessionRole = { kind: "course", slug: "discrete-math-epp" };
  const control: SessionRole = { kind: "control" };
  const freeRole: SessionRole = { kind: "free" };
  const close = (
    role: SessionRole,
    input: Record<string, unknown>,
    rootsFor: Roots = roots,
    canonFn: CanonFn = canon,
  ): Decision => decide(role, "course_close", input, rootsFor, canonFn, nothing);

  it("refuses 总控 and 自由 sessions outright", () => {
    for (const role of [control, freeRole]) {
      const decision = close(role, { action: "stage", slug: "discrete-math-epp" });
      expect(decision.allow, roleLabelOf(role)).toBe(false);
      expect(decision.reason).toContain("不能收课");
    }
  });

  it("lets the course session stage and undo its own course", () => {
    expect(close(course, { action: "stage", slug: "discrete-math-epp" }).allow).toBe(true);
    expect(close(course, { action: "undo", slug: "discrete-math-epp" }).allow).toBe(true);
  });

  it("refuses another course's slug", () => {
    for (const action of ["stage", "undo"]) {
      const decision = close(course, { action, slug: "ctm" });
      expect(decision.allow, action).toBe(false);
      expect(decision.reason).toContain("只能收自己这门课");
    }
  });

  it("allows this course's staging inside <workspace>/.close/<slug>-…", () => {
    for (const action of ["add", "check", "commit", "abort"]) {
      const decision = close(course, {
        action,
        staging: `${W}/.close/discrete-math-epp-20261109-2300`,
        ...(action === "add" ? { path: "wiki/knowledge/concepts/discrete-math/010-variables.md" } : {}),
      });
      expect(decision.allow, `${action}: ${decision.reason}`).toBe(true);
    }
  });

  it("refuses another course's staging and a staging outside the workspace", () => {
    for (const staging of [
      `${W}/.close/ctm-20261109-2300`,
      "/elsewhere/.close/discrete-math-epp-20261109-2300",
      `${W}/other/discrete-math-epp-20261109-2300`,
    ]) {
      const decision = close(course, { action: "check", staging });
      expect(decision.allow, staging).toBe(false);
      expect(decision.reason).toContain("暂存目录不属于这门课");
    }
  });

  it("refuses an add path that is absolute or climbs out with `..`", () => {
    const staging = `${W}/.close/discrete-math-epp-20261109-2300`;
    for (const path of ["/vault/wiki/knowledge/concepts/x.md", "wiki/knowledge/../courses/ctm.md", "../outside/x.md"]) {
      const decision = close(course, { action: "add", staging, path });
      expect(decision.allow, path).toBe(false);
      expect(decision.reason).toContain("库内相对路径");
    }
  });

  it("resolves `..` and symlinks before judging the staging directory", () => {
    const facts = nodePathFacts();
    const dir = mkdtempSync(join(tmpdir(), "xuegen-close-staging-"));
    try {
      const workspace = join(dir, "workspace");
      const outside = join(dir, "outside");
      mkdirSync(join(workspace, ".close"), { recursive: true });
      mkdirSync(join(outside, ".close"), { recursive: true });
      const real = (path: string): string => canonical(path, workspace, facts);
      const localRoots: Roots = {
        vault: real(join(dir, "vault")),
        workspace: real(workspace),
        home: real(join(dir, "home")),
        repo: real(join(dir, "repo")),
      };
      // `..` 跳出工作区，即使拼出来的字符串以 `<workspace>/.close` 开头。
      const escaped = join(workspace, ".close", "..", "..", "outside", ".close", "discrete-math-epp-1");
      const escape = decide(course, "course_close", { action: "check", staging: escaped }, localRoots, real, nothing);
      expect(escape.allow, escape.reason).toBe(false);
      // 好名字的符号链接指向库外：按解析后的真位置判断。
      symlinkSync(outside, join(workspace, ".close", "discrete-math-epp-link"));
      const linked = decide(
        course,
        "course_close",
        { action: "check", staging: join(workspace, ".close", "discrete-math-epp-link") },
        localRoots,
        real,
        nothing,
      );
      expect(linked.allow, linked.reason).toBe(false);
      // 符号链接指向别的课的暂存目录：名字是本课的，位置不是。
      mkdirSync(join(workspace, ".close", "ctm-1"), { recursive: true });
      symlinkSync(join(workspace, ".close", "ctm-1"), join(workspace, ".close", "discrete-math-epp-alias"));
      const aliased = decide(
        course,
        "course_close",
        { action: "check", staging: join(workspace, ".close", "discrete-math-epp-alias") },
        localRoots,
        real,
        nothing,
      );
      expect(aliased.allow, aliased.reason).toBe(false);
      // 本课真正的暂存目录仍放行（自检：上面的拒绝不是因为路径都不存在）。
      const own = decide(
        course,
        "course_close",
        { action: "commit", staging: join(workspace, ".close", "discrete-math-epp-20261109-2300") },
        localRoots,
        real,
        nothing,
      );
      expect(own.allow, own.reason).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("decide — 阶段 3c：课程会话的课程页与概念页只经 course_close", () => {
  const course: SessionRole = { kind: "course", slug: "discrete-math-epp" };
  const freeRole: SessionRole = { kind: "free" };
  const verdict = (role: SessionRole, tool: string, path: string, canonFn: CanonFn = canon): Decision =>
    decide(role, tool, { path }, roots, canonFn, nothing);

  it("denies write and edit of course pages and concept pages, naming course_close", () => {
    for (const tool of ["write", "edit"]) {
      for (const path of [
        "wiki/courses/discrete-math-epp.md",
        "wiki/courses/ctm.md",
        "wiki/knowledge/concepts/discrete-math/010-variables.md",
        "wiki/knowledge/concepts/x.md",
        "wiki/knowledge/concepts/x.md",
        "wiki/knowledge/concepts/discrete-math/010-variables.md",
      ]) {
        const decision = verdict(course, tool, path);
        expect(decision.allow, `${tool} ${path}`).toBe(false);
        expect(decision.reason, `${tool} ${path}`).toContain("course_close");
      }
    }
  });

  it("keeps the pages every session may write open in a course session", () => {
    for (const tool of ["write", "edit"]) {
      for (const path of [
        "wiki/subjects/discrete-math.md",
        "wiki/knowledge/extracts/epp/2026-11-09-闭包.md",
        "wiki/knowledge/extracts/epp/2026-11-09-闭包.md",
        "wiki/knowledge/sources/2026-11-09-epp.md",
        "wiki/shelf/epp.md",
        "wiki/shelf/epp.md",
        "wiki/log.md",
        "wiki/index.md",
      ]) {
        const decision = verdict(course, tool, path);
        expect(decision.allow, `${tool} ${path}: ${decision.reason}`).toBe(true);
      }
    }
  });

  it("still lets a free session write concept pages directly", () => {
    for (const path of [
      "wiki/knowledge/concepts/x.md",
      "wiki/knowledge/concepts/discrete-math/010-variables.md",
    ]) {
      const decision = verdict(freeRole, "write", path);
      expect(decision.allow, path).toBe(true);
    }
  });
});

describe("decide — 库放在临时目录里时，库规则优先于「临时目录可写」", () => {
  /**
   * 真机验收（11-09）复现的那条：测试库在 `/private/tmp/xg-e2e/vault/GJY`，
   * 总控会话 `write wiki/knowledge/concepts/x.md` 被「`withinAny(target, rules.tmp)` 放行」
   * 这一步放过了。`mkdtemp` 落在 `os.tmpdir()` 下，库根天然被临时目录包住，
   * 所以下面的每个断言都在「库 ⊆ 临时目录」这个前提上判。
   */
  const withTmpVault = (run: (rootsFor: Roots, canonFn: CanonFn) => void): void => {
    const facts = nodePathFacts();
    const scratch = mkdtempSync(join(tmpdir(), "xuegen-guard-tmpvault-"));
    try {
      // 库根（`<scratch>/vault`）与库外的草稿目录（`<scratch>/workspace`）都在 tmpdir 里。
      const vaultRoot = join(scratch, "vault");
      mkdirSync(vaultRoot, { recursive: true });
      const workspace = join(scratch, "workspace");
      mkdirSync(workspace, { recursive: true });
      // 会话 cwd 就在库里：技能的相对路径（`wiki/…`）都按库根解析。
      const real = (path: string): string => canonical(path, vaultRoot, facts);
      const rootsFor: Roots = {
        vault: real(vaultRoot),
        workspace: real(workspace),
        home: real(join(scratch, "home")),
        repo: real(join(scratch, "repo")),
        temp: real(tmpdir()),
      };
      // 前提自检：库确实在临时目录里（否则这条测试就不再复现原问题）。
      expect(within(rootsFor.vault, rootsFor.temp ?? "")).toBe(true);
      run(rootsFor, real);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  };

  const control: SessionRole = { kind: "control" };
  const courseEpp: SessionRole = { kind: "course", slug: "discrete-math-epp" };

  it("denies 总控 writing a 概念页 inside a vault that lives in the temp directory", () => {
    withTmpVault((rootsFor, canonFn) => {
      const decision = decide(control, "write", { path: "wiki/knowledge/concepts/x.md" }, rootsFor, canonFn, nothing);
      expect(decision.allow, decision.reason).toBe(false);
      expect(decision.reason).toContain("知识页");
    });
  });

  it("still allows the 知识 pages every session may write (extracts)", () => {
    withTmpVault((rootsFor, canonFn) => {
      for (const role of [control, courseEpp, { kind: "free" } as SessionRole]) {
        const decision = decide(role, "write", { path: "wiki/knowledge/extracts/x.md" }, rootsFor, canonFn, nothing);
        expect(decision.allow, `${roleLabelOf(role)}: ${decision.reason}`).toBe(true);
      }
    });
  });

  it("refuses the course session writing any course page directly (3c: course_close only)", () => {
    withTmpVault((rootsFor, canonFn) => {
      const own = decide(courseEpp, "edit", { path: "wiki/courses/discrete-math-epp.md" }, rootsFor, canonFn, nothing);
      expect(own.allow, own.reason).toBe(false);
      expect(own.reason).toContain("course_close");
      const other = decide(courseEpp, "edit", { path: "wiki/courses/ctm.md" }, rootsFor, canonFn, nothing);
      expect(other.allow, other.reason).toBe(false);
      expect(other.reason).toContain("course_close");
    });
  });

  it("does not treat the workspace as scratch space when the workspace is the vault", () => {
    withTmpVault((rootsFor, canonFn) => {
      // 会话 cwd 是库根时工作区就在库里；工作区放行不能覆盖库的清单。
      const insideVault: Roots = { ...rootsFor, workspace: rootsFor.vault };
      const decision = decide(control, "write", { path: "notes/x.md" }, insideVault, canonFn, nothing);
      expect(decision.allow, decision.reason).toBe(false);
    });
  });

  it("leaves 库外 scratch space alone, inside and outside tmp", () => {
    withTmpVault((rootsFor, canonFn) => {
      // `/private/tmp` 下（库外）的草稿仍然放行。
      const tmpScratch = decide(control, "write", { path: "/private/tmp/scratch.json" }, rootsFor, canonFn, nothing);
      expect(tmpScratch.allow, tmpScratch.reason).toBe(true);
      // tmpdir 下、库外的会话工作区也放行。
      const workspace = decide(control, "write", { path: join(rootsFor.workspace, "notes.md") }, rootsFor, canonFn, nothing);
      expect(workspace.allow, workspace.reason).toBe(true);
    });
  });

  it("denies rm -rf of a vault directory that happens to sit in the temp directory", () => {
    withTmpVault((rootsFor, canonFn) => {
      const decision = decide(control, "bash", { command: `rm -rf ${rootsFor.vault}/wiki` }, rootsFor, canonFn, nothing);
      expect(decision.allow, decision.reason).toBe(false);
      expect(decision.reason).toContain("递归删除");
      // 库外、临时目录里的目录仍然是可清理的草稿。
      const scratch = decide(control, "bash", { command: "rm -rf /private/tmp/xuegen-tmp" }, rootsFor, canonFn, nothing);
      expect(scratch.allow, scratch.reason).toBe(true);
    });
  });
});

describe("decide — course_plan：只有总控能用（阶段 4a，整理 1 起走计划暂存）", () => {
  const plan = (role: SessionRole, action: string): Decision =>
    decide(role, "course_plan", { action }, roots, canon, nothing);

  it("lets 总控 stage / schedule / check / commit / abort / board all through", () => {
    for (const action of ["stage", "schedule", "check", "commit", "abort", "board"]) {
      const decision = plan(roles.control as SessionRole, action);
      expect(decision.allow, `${action}: ${decision.reason}`).toBe(true);
    }
  });

  it("refuses the course session and the free session, naming 总控", () => {
    for (const role of [roles.course as SessionRole, roles.free as SessionRole]) {
      for (const action of ["stage", "schedule", "check", "commit", "abort", "board"]) {
        const decision = plan(role, action);
        expect(decision.allow, `${roleLabelOf(role)} ${action}: ${decision.reason}`).toBe(false);
        expect(decision.reason).toContain("总控");
      }
    }
  });
});

describe("decide — cycle_open：只有总控能用（批 5a，周期层走周期事务）", () => {
  const open = (role: SessionRole, input: Record<string, unknown>): Decision =>
    decide(role, "cycle_open", input, roots, canon, nothing);

  it("lets 总控 stage / check / commit / abort through", () => {
    for (const action of ["stage", "check", "commit", "abort"]) {
      const decision = open(roles.control as SessionRole, { action });
      expect(decision.allow, `${action}: ${decision.reason}`).toBe(true);
    }
  });

  it("refuses the course session and the free session, naming 总控", () => {
    for (const role of [roles.course as SessionRole, roles.free as SessionRole]) {
      const decision = open(role, { action: "stage" });
      expect(decision.allow, `${roleLabelOf(role)}: ${decision.reason}`).toBe(false);
      expect(decision.reason).toContain("建周期在总控会话里做");
    }
  });

  it("accepts a staging inside <workspace>/.cycle, refuses one outside it", () => {
    const inside = open(roles.control as SessionRole, { action: "check", staging: `${W}/.cycle/C2-20261114-1200` });
    expect(inside.allow, inside.reason).toBe(true);
    for (const staging of [`${W}/.close/ctm-20261110-101010`, `${V}/wiki/cycles`, "/tmp/elsewhere"]) {
      const decision = open(roles.control as SessionRole, { action: "check", staging });
      expect(decision.allow, `${staging}: ${decision.reason}`).toBe(false);
      expect(decision.reason).toContain(".cycle");
    }
  });
});

describe("decide — calendar_write：三个角色都放行（阶段 4a）", () => {
  it("lets every role write calendar notes (bash can no longer reach wiki/calendar)", () => {
    // 日历笔记只经 `calendar.mjs` 写（原子写入、空正文删文件），而这个工具就是它在
    // 沙盒外的入口，所以不能用角色清单拦；缺参数由工具自己抛中文错。
    for (const role of [roles.control as SessionRole, roles.course as SessionRole, roles.free as SessionRole]) {
      const decision = decide(role, "calendar_write", { date: "2026-11-05", text: "复习 BA" }, roots, canon, nothing);
      expect(decision.allow, `${roleLabelOf(role)}: ${decision.reason}`).toBe(true);
      expect(decision.reason).toBe("");
    }
  });

  it("lets an empty body (delete that day's note) through too", () => {
    for (const role of [roles.control as SessionRole, roles.course as SessionRole, roles.free as SessionRole]) {
      const decision = decide(role, "calendar_write", { date: "2026-11-05", text: "" }, roots, canon, nothing);
      expect(decision.allow, roleLabelOf(role)).toBe(true);
    }
  });

  it("does not open the file tools: writing wiki/calendar with write/edit stays denied in every role", () => {
    // 放行的是工具，不是位置：直接写日历目录仍然被拦（否则原子写入与删除规则会被绕过）。
    for (const role of [roles.control as SessionRole, roles.course as SessionRole, roles.free as SessionRole]) {
      const decision = decide(role, "write", { path: "wiki/calendar/2026-11-05.md" }, roots, canon, nothing);
      expect(decision.allow, `${roleLabelOf(role)}: ${decision.reason}`).toBe(false);
      expect(decision.reason).toContain("日历");
    }
  });
});
