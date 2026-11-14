// close/restore.mjs 的测试：临时目录里 jj git init 建真仓库（本机没有 jj 时 skip），
// 验证「临时放开只读锁 → 一次 jj restore → 权限恢复」；失败路径用子进程跑，
// 因为 restoreFiles 失败时走 fail()（stderr + exit 1），同进程里会把测试一并带走。
import { test, skip } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { restoreFiles } from "./restore.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE_URL = pathToFileURL(join(HERE, "restore.mjs")).href;

const hasJj = (() => {
  try {
    execFileSync("jj", ["--version"], { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
})();
const jjTest = hasJj ? test : (name) => skip(`${name}（本机没有 jj，跳过）`);

/** 临时 jj 库：{ root, vault, jj }，文件已提交成「基线」。 */
function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "course-restore-"));
  const vault = join(root, "vault");
  const config = join(root, "jj-config.toml");
  writeFileSync(config, 'user.name = "恢复测试"\nuser.email = "test@example.com"\n');
  mkdirSync(join(vault, "wiki", "courses"), { recursive: true });
  const env = { ...process.env, JJ_CONFIG: config };
  const jj = (args) => execFileSync("jj", args, { cwd: vault, encoding: "utf8", env });
  jj(["git", "init"]);
  writeFileSync(join(vault, "wiki", "courses", "epp.md"), "v1\n");
  jj(["commit", "-m", "基线"]);
  return { root, vault, jj };
}

const modeOf = (path) => statSync(path).mode & 0o777;

function cleanup(root) {
  try {
    execFileSync("chmod", ["-R", "u+rwX", root]);
  } catch {
    /* 已经没了 */
  }
  rmSync(root, { recursive: true, force: true });
}

jjTest("restoreFiles：文件内容回到指定修订，文件与祖先目录的只读锁锁回去", () => {
  const { root, vault } = makeRepo();
  try {
    const file = join(vault, "wiki", "courses", "epp.md");
    writeFileSync(file, "v2\n");
    chmodSync(file, 0o444);
    chmodSync(join(vault, "wiki", "courses"), 0o555);

    restoreFiles(vault, "@-", ["wiki/courses/epp.md"]);
    assert.equal(readFileSync(file, "utf8"), "v1\n", "内容恢复");
    assert.equal(modeOf(file), 0o444, "文件锁回去");
    assert.equal(modeOf(join(vault, "wiki", "courses")), 0o555, "目录锁回去");
  } finally {
    cleanup(root);
  }
});

jjTest("restoreFiles：工作副本里删掉的文件也恢复回来", () => {
  const { root, vault } = makeRepo();
  try {
    const file = join(vault, "wiki", "courses", "epp.md");
    rmSync(file);
    restoreFiles(vault, "@-", ["wiki/courses/epp.md"]);
    assert.equal(readFileSync(file, "utf8"), "v1\n");
  } finally {
    cleanup(root);
  }
});

jjTest("restoreFiles：jj restore 失败时报错退出，权限照样恢复", () => {
  const { root, vault } = makeRepo();
  try {
    const file = join(vault, "wiki", "courses", "epp.md");
    chmodSync(file, 0o444);
    chmodSync(join(vault, "wiki", "courses"), 0o555);
    const script =
      `import { restoreFiles } from ${JSON.stringify(MODULE_URL)};` +
      `restoreFiles(${JSON.stringify(vault)}, "不存在的修订", ["wiki/courses/epp.md"]);`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /jj restore 失败/);
    assert.equal(modeOf(file), 0o444, "失败后文件锁仍恢复");
    assert.equal(modeOf(join(vault, "wiki", "courses")), 0o555, "失败后目录锁仍恢复");
  } finally {
    cleanup(root);
  }
});
