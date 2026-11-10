#!/usr/bin/env node
// close/fail.mjs 的测试：fail 自己 process.exit(1)，所以每条用例都在子进程里调，验退出码与 stderr。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FAIL_URL = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "fail.mjs")).href;

/** 在子进程里调 fail(message)，后面再跟一句写 stdout 的代码以便验「不继续执行」。 */
function runFail(message) {
  const code = [
    `import { fail } from ${JSON.stringify(FAIL_URL)};`,
    `fail(${JSON.stringify(message)});`,
    'process.stdout.write("失败之后不该再执行\\n");',
  ].join("\n");
  try {
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

test("fail：退出码 1，stderr 是 `course-close: <原文>` 一行，中文原样", () => {
  const { code, stderr } = runFail("没有这门课：wiki/courses/epp.md");
  assert.equal(code, 1);
  assert.equal(stderr, "course-close: 没有这门课：wiki/courses/epp.md\n");
});

test("fail：只写 stderr，stdout 保持干净（--json 输出不会被打断），后续语句不执行", () => {
  const { code, stdout } = runFail("提交失败（%s 不是格式串）");
  assert.equal(code, 1);
  assert.equal(stdout, "", "stdout 里不能有半截 JSON 或后续语句的输出");
});

test("fail：message 里的百分号、反斜杠、换行都原样保留（不是 printf 格式串，也不做转义/截断）", () => {
  const message = "补完失败（C:\\tmp\\a b.md）：100% 未完成\n提交日志仍在 .close/journal.json";
  const { stderr } = runFail(message);
  assert.equal(stderr, `course-close: ${message}\n`);
});
