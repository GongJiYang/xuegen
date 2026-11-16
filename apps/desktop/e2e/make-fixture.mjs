#!/usr/bin/env node
/* global process */
// 生成 proof 用的合成测试库：把 fixture/vault 复制到 <root>/vault，写好 home 配置。
//   node e2e/make-fixture.mjs <root>
// <root> 必须在 /tmp 或系统临时目录下；<root>/vault 已存在时先删掉。零第三方依赖。
import { chmod, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = join(dirname(fileURLToPath(import.meta.url)), "fixture", "vault");

function isUnder(path, root) {
  const base = root.endsWith("/") ? root : `${root}/`;
  return path === root || path.startsWith(base);
}

/** 只允许在临时目录里生成/删除，避免误伤真实库。 */
function guardRoot(root) {
  const target = resolve(root);
  const temp = tmpdir();
  const roots = new Set(["/tmp", "/private/tmp", "/var/tmp", temp, realpathSync(temp)]);
  if (![...roots].some((base) => isUnder(target, resolve(base)))) {
    throw new Error(`拒绝：${target} 不在 /tmp 或系统临时目录下`);
  }
  return target;
}

/** 测试库的课程目录是 0555，删除前先放开目录写权限。 */
async function prepareRemove(dir) {
  const courses = join(dir, "wiki", "courses");
  if (existsSync(courses)) await chmod(courses, 0o755);
}

/** 把课程页设成只读锁：课程目录 0555、课程页 0444。 */
async function lockCourses(vault) {
  const courses = join(vault, "wiki", "courses");
  for (const name of await readdir(courses)) {
    if (name.endsWith(".md")) await chmod(join(courses, name), 0o444);
  }
  await chmod(courses, 0o555);
}

export async function makeFixture(root) {
  const target = guardRoot(root);
  const vault = join(target, "vault");
  if (existsSync(vault)) {
    await prepareRemove(vault);
    await rm(vault, { recursive: true, force: true });
  }
  await cp(SOURCE, vault, { recursive: true });
  await lockCourses(vault);

  const home = join(target, "home");
  await mkdir(home, { recursive: true });
  await mkdir(join(target, "workspace"), { recursive: true });
  await writeFile(join(home, "wiki.json"), `${JSON.stringify({ root: vault }, null, 2)}\n`);
  // bodyScale is required by the settings validator; without it the whole file
  // falls back to defaults (Chicago) and the proof screenshots lose the planbook.
  // 2 = 用户真实设置（Bear 最大一档 24px），截图与用户实际所见一致。
  await writeFile(join(home, "desktop.json"), `${JSON.stringify({ skin: "bear", bodyScale: 2 }, null, 2)}\n`);
  await writeFile(join(home, "settings.json"), "{}\n");
  return { root: target, vault, home };
}

function isMain() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
}

if (isMain()) {
  const root = process.argv[2];
  if (!root) {
    process.stderr.write("用法：node e2e/make-fixture.mjs <root>\n");
    process.exit(1);
  }
  try {
    const made = await makeFixture(root);
    process.stdout.write(`合成测试库：${made.vault}\n`);
  } catch (error) {
    process.stderr.write(`make-fixture: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
