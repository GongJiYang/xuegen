// @vitest-environment node
/**
 * 阶段 4a-2：沙盒接入后的回归（真 seatbelt，不打桩）。
 *
 * 4a-i1 的 `config.test.ts` 只钉住清单的形状与「沙盒不比 guard 宽」的静态一致性；
 * 这里验证清单**真的生效**：`createSandboxRunner` + `wrap` 之后用 `/bin/bash -c`
 * 跑，逐条断言退出码与文件是否落盘。断言的对象都是「模型会看到什么、盘上留下了
 * 什么」，不是沙盒内部实现。
 *
 * 约束：
 * - 只有 macOS 有 seatbelt，其它平台整套 `skip`（`wrap` 在那边原样返回命令）。
 * - vault / workspace / home 全在 `mkdtemp` 里现造，不碰真实库、真实 `~/.xuegen`
 *   （`roots` 由 `guardRoots` 从临时 home 的 `wiki.json` 推出，与生产同一个函数）。
 * - Anki 用例要真监听 `127.0.0.1:8765`（沙盒只放这一个本机端口）；端口被占就
 *   `skip` 并说明原因，不去动别人的进程。
 */

import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { repoRoot } from "../environment.js";
import { nodePathFacts, guardRoots } from "../guard/facts.js";
import { canonicalParts, expandTilde } from "../guard/path.js";
import type { SessionRole } from "../../shared/protocol.js";
import { sandboxConfigFor } from "./config.js";
import { createSandboxRunner, type SandboxRunner } from "./runner.js";

const runFile = promisify(execFile);
const DARWIN = process.platform === "darwin";

const courseRole: SessionRole = { kind: "course", slug: "discrete-math-epp" };
const freeRole: SessionRole = { kind: "free" };

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** A temp vault/workspace/home, the roots the sandbox is built from, and a live runner. */
interface Bench {
  base: string;
  vault: string;
  workspace: string;
  home: string;
  runner: SandboxRunner;
  run(commandId: string, command: string, role?: SessionRole): Promise<RunResult>;
  /** 沙盒把命令改写成什么样（用来确认命令真的进了沙盒）。 */
  wrapped(command: string, commandId: string, role?: SessionRole): Promise<string>;
  /** `annotate` 的结果里出现 `want` 之一之前一直重试（日志监视器是异步收集的）。 */
  annotateUntil(commandId: string, stderr: string, want: readonly string[]): Promise<string>;
}

async function bench(): Promise<Bench> {
  const base = mkdtempSync(join(tmpdir(), "xuegen-sandbox-e2e-"));
  const vault = join(base, "vault");
  const workspace = join(base, "workspace");
  const home = join(base, "home");
  // 库的形状：课程目录（总控独占）、概念目录（只许自由会话经 bash 写）、卡片目录
  // （任何会话都能写，Anki 用例要回填 ID）。目录先建好，写失败才只可能是沙盒拦的。
  for (const dir of [
    join(vault, "wiki", "courses"),
    join(vault, "wiki", "知识", "concepts"),
    join(vault, "wiki", "知识", "flashcards"),
    workspace,
    home,
  ]) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(home, "wiki.json"), JSON.stringify({ root: vault }), "utf8");
  writeFileSync(join(home, "auth.json"), JSON.stringify({ token: "不该被读到" }), "utf8");

  const facts = nodePathFacts();
  const roots = guardRoots(home, workspace, facts);
  // 与 `session.ts` 完全同一条规范化：沙盒清单里写的路径就是 guard 判过的路径。
  const canon = (path: string): string =>
    canonicalParts(expandTilde(path, homedir()), workspace, facts).canonical;
  const runner = await createSandboxRunner(roots, canon);

  const wrapped = (command: string, commandId: string, role: SessionRole = courseRole): Promise<string> =>
    runner.wrap(command, commandId, role);

  return {
    base,
    vault,
    workspace,
    home,
    runner,
    wrapped,
    async run(commandId, command, role = courseRole) {
      const commandLine = await wrapped(command, commandId, role);
      try {
        const { stdout, stderr } = await runFile("/bin/bash", ["-c", commandLine], {
          encoding: "utf8",
          timeout: 60_000,
        });
        return { code: 0, stdout, stderr };
      } catch (error) {
        const failed = error as { code?: unknown; stdout?: string; stderr?: string };
        return {
          code: typeof failed.code === "number" ? failed.code : -1,
          stdout: failed.stdout ?? "",
          stderr: failed.stderr ?? "",
        };
      }
    },
    async annotateUntil(commandId, stderr, want) {
      const deadline = Date.now() + 10_000;
      let text = runner.annotate(commandId, stderr);
      while (!want.some((marker) => text.includes(marker)) && Date.now() < deadline) {
        await new Promise((done) => setTimeout(done, 200));
        text = runner.annotate(commandId, stderr);
      }
      return text;
    },
  };
}

describe.skipIf(!DARWIN)("沙盒真实生效（真 seatbelt）", () => {
  let kit: Bench;

  beforeAll(async () => {
    kit = await bench();
  }, 120_000);

  afterAll(async () => {
    await kit?.runner.reset();
    if (kit !== undefined) rmSync(kit.base, { recursive: true, force: true });
  }, 120_000);

  it("命令真的被改写进沙盒（不是原样跑）", async () => {
    const wrapped = await kit.wrapped("echo hi", "wrap-shape");
    expect(wrapped).not.toBe("echo hi");
    expect(wrapped).toContain("sandbox-exec");
  });

  it("工作区可写；课程会话写不了课程页与概念页，自由会话写得了概念页", async () => {
    // 1) 工作区：成功，文件落盘。
    const inWorkspace = join(kit.workspace, "note.md");
    const workspaceRun = await kit.run("write-workspace", `echo hi > ${inWorkspace}`);
    expect(workspaceRun.code, workspaceRun.stderr).toBe(0);
    expect(existsSync(inWorkspace)).toBe(true);

    // 2) 课程页：课程会话被拦，文件不存在。
    const coursePage = join(kit.vault, "wiki", "courses", "x.md");
    const courseRun = await kit.run("write-course-page", `echo hi > ${coursePage}`);
    expect(courseRun.code).not.toBe(0);
    expect(courseRun.stderr, courseRun.stderr).toMatch(/not permitted|Operation not permitted/i);
    expect(existsSync(coursePage)).toBe(false);

    // 3) 概念页：课程会话被拦，自由会话放行（两种知识目录拼写都试一遍）。
    for (const [index, dir] of ["知识", "knowledge"].entries()) {
      const conceptDir = join(kit.vault, "wiki", dir, "concepts");
      // 目录先建好：失败只能是沙盒拦的，不是「目录不存在」。
      mkdirSync(conceptDir, { recursive: true });
      const concept = join(conceptDir, `x-${index}.md`);
      const asCourse = await kit.run(`write-concept-course-${index}`, `echo hi > ${concept}`, courseRole);
      expect(asCourse.code, `${dir}: 课程会话不该写得动概念页`).not.toBe(0);
      // 拒绝来自 seatbelt（Operation not permitted），不是路径写错。
      expect(asCourse.stderr, `${dir}: ${asCourse.stderr}`).toMatch(/not permitted|Operation not permitted/i);
      expect(existsSync(concept), `${dir}: 概念页不该存在`).toBe(false);

      const asFree = await kit.run(`write-concept-free-${index}`, `echo hi > ${concept}`, freeRole);
      expect(asFree.code, `${dir}: 自由会话应当写得动概念页 ${asFree.stderr}`).toBe(0);
      expect(existsSync(concept), `${dir}: 自由会话写的概念页应当落盘`).toBe(true);
    }
  });

  it("mv 绕不过写保护（issue #8）：文件与整个目录都搬不走，原文件还在", async () => {
    const page = join(kit.vault, "wiki", "courses", "c.md");
    writeFileSync(page, "课程页原文\n", "utf8");

    // 单个文件搬到工作区。
    const fileMove = await kit.run("mv-file", `mv ${page} ${join(kit.workspace, "c.md")}`);
    expect(fileMove.code).not.toBe(0);
    expect(existsSync(join(kit.workspace, "c.md"))).toBe(false);

    // 整个课程目录搬到工作区。
    const dirMove = await kit.run(
      "mv-dir",
      `mv ${join(kit.vault, "wiki", "courses")} ${join(kit.workspace, "courses")}`,
    );
    expect(dirMove.code).not.toBe(0);
    expect(existsSync(join(kit.workspace, "courses"))).toBe(false);

    // 原文件与目录都还在，一行没少。
    expect(existsSync(page)).toBe(true);
    expect(readFileSync(page, "utf8")).toBe("课程页原文\n");
    expect(existsSync(join(kit.vault, "wiki", "courses"))).toBe(true);
  });

  it("读不到凭据：cat <home>/auth.json 失败", async () => {
    const credential = join(kit.home, "auth.json");
    expect(existsSync(credential)).toBe(true);
    const result = await kit.run("read-credential", `cat ${credential}`);
    expect(result.code).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  it("连不了外网：curl https://example.com 非 0 退出", async () => {
    const result = await kit.run("curl-example", "curl -sS -m 5 https://example.com");
    expect(result.code).not.toBe(0);
  });

  it("被拦下的 stderr 经 annotate 补上沙盒原因", async () => {
    const page = join(kit.vault, "wiki", "courses", "blocked.md");
    const result = await kit.run("annotate-course-page", `echo hi > ${page}`);
    expect(result.code).not.toBe(0);

    // 标注靠日志监视器异步收集，所以等一会儿再断言；两种可接受的标记：包装段或
    // 具体那条 `file-write*` 违规（seatbelt 日志的粒度与延迟都不由我们控制）。
    const annotated = await kit.annotateUntil("annotate-course-page", result.stderr, [
      "<sandbox_violations>",
      "file-write",
    ]);
    expect(annotated === result.stderr, `annotate 什么都没补上：${annotated}`).toBe(false);
    expect(annotated).toContain(result.stderr);
    expect(annotated).toMatch(/<sandbox_violations>|file-write/);
  }, 60_000);
});

describe.skipIf(!DARWIN)("沙盒里的 Anki：经沙盒代理连 127.0.0.1:8765", () => {
  let kit: Bench;
  let anki: Server | null = null;
  let portTaken = false;

  beforeAll(async () => {
    kit = await bench();
    anki = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        const { action } = JSON.parse(body) as { action: string };
        let result: unknown = 1;
        if (action === "version") result = 6;
        else if (action === "modelFieldNames") result = ["Front", "Back"];
        else if (action === "getDeckConfig") result = { id: 1 };
        else if (action === "addNote") result = 1700000001;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ result, error: null }));
      });
    });
    await new Promise<void>((done) => {
      anki?.once("error", (error: NodeJS.ErrnoException) => {
        // 沙盒只放 8765，随机端口没有意义：端口被占就整条用例跳过，不动别人的进程。
        if (error.code === "EADDRINUSE") portTaken = true;
        done();
      });
      anki?.listen(8765, "127.0.0.1", done);
    });
  }, 120_000);

  afterAll(async () => {
    await kit?.runner.reset();
    if (anki !== null) await new Promise<void>((done) => anki?.close(() => done()));
    if (kit !== undefined) rmSync(kit.base, { recursive: true, force: true });
  }, 120_000);

  it("沙盒里跑 anki-sync push 能把卡加进 127.0.0.1:8765 并回填 ID", async (context) => {
    if (portTaken) {
      context.skip();
      return;
    }
    const cards = join(kit.vault, "wiki", "知识", "flashcards", "deck", "a.md");
    mkdirSync(join(kit.vault, "wiki", "知识", "flashcards", "deck"), { recursive: true });
    writeFileSync(
      cards,
      ["TARGET DECK", "书房::Epp", "", "START", "Basic", "逆否命题等价吗？", "Back: 等价", "END", ""].join(
        "\n",
      ),
      "utf8",
    );

    const script = join(repoRoot, "skills", "wiki-save", "anki-sync.mjs");
    const result = await kit.run(
      "anki-push",
      `node ${script} push ${kit.vault} --json --url http://127.0.0.1:8765`,
    );
    expect(result.code, result.stderr).toBe(0);
    const parsed = JSON.parse(result.stdout) as { added: number };
    expect(parsed.added).toBe(1);
    // ID 回填成功说明脚本在沙盒里既能连上 Anki、也写得动卡片页。
    expect(readFileSync(cards, "utf8")).toContain("<!--ID: 1700000001-->");
  }, 120_000);
});

describe("沙盒配置与库的位置（不跑真沙盒）", () => {
  it("库在临时目录里时，工作区/临时目录的放行不能把整个库打开（库优先）", () => {
    // 生产里 `roots.temp` 就是 `os.tmpdir()`；库整个放在临时目录下时（测试库、备份），
    // allowWrite 若原样收下这个祖先目录，库里的每一条规则都会被盖掉——guard 早就有
    // 「库优先」这条（vault-paths.ts 的 isOutsideVaultScratch），沙盒清单必须一致。
    const facts = nodePathFacts();
    const base = mkdtempSync(join(tmpdir(), "xuegen-sandbox-config-"));
    try {
      const vault = join(base, "vault");
      // 草稿目录与库同级（在临时目录里，但不是库）。
      const workspace = join(base, "scratch");
      mkdirSync(vault, { recursive: true });
      mkdirSync(workspace, { recursive: true });
      writeFileSync(join(base, "wiki.json"), JSON.stringify({ root: vault }), "utf8");
      const home = base;
      const roots = guardRoots(home, workspace, facts);
      expect(roots.temp).toBeTruthy();
      // 前提：库确实在 roots.temp 之内（os.tmpdir() 的子目录）。
      expect(roots.vault.startsWith(`${roots.temp as string}/`)).toBe(true);

      const canon = (path: string): string =>
        canonicalParts(expandTilde(path, homedir()), workspace, facts).canonical;
      const config = sandboxConfigFor(courseRole, roots, canon);
      const writeRoots = config.filesystem.allowWrite.map((entry) => (entry as { path: string }).path);
      const containing = writeRoots.filter(
        (root) => roots.vault === root || roots.vault.startsWith(`${root}/`),
      );
      expect(containing, `这些 allowWrite 条目把整个库都放开了：${containing.join(", ")}`).toEqual([]);
      // 库内那条目录还在（沙盒比 guard 窄只在于库外草稿，角色清单本身没被削掉）。
      expect(writeRoots).toContain(join(roots.vault, "wiki", "书房"));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
