#!/usr/bin/env node
// diagram-check.mjs 的测试：node:test + node:assert，无第三方依赖。
// 正例 ≥ 5（中文方框、条形、盲文、树、双线表格），反例 ≥ 5；
// 另有 docs/archive/skills/fixtures-s-diagram/ 全部样例的内联副本（不依赖 docs 路径）；
// references/patterns.md 中所有 ```text 示例作为正例自动校验。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "diagram-check.mjs");

// 用临时文件跑校验，返回 {code, stdout}。
function check(text) {
  const dir = mkdtempSync(join(tmpdir(), "diagram-test-"));
  const file = join(dir, "d.txt");
  writeFileSync(file, text, "utf8");
  try {
    const stdout = execFileSync("node", [SCRIPT, file], { encoding: "utf8" });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- 正例 ----

const POSITIVES = {
  "中文方框": [
    "┌──────────┐",
    "│ 声明式   │",
    "│ 模型     │",
    "└──────────┘",
  ].join("\n"),

  "方块条形": [
    "解析  ████████████░░░░  120",
    "求值  ██████░░░░░░░░░░   75",
  ].join("\n"),

  "盲文折线": [
    "1.00 ┤        ⢀⣠⠤⠒⠉⠉⠢⣄",
    "0.50 ┤ ⢀⡴⠃              ⠘⣆",
    "0.00 ┼⠤⠋                  ⠈⠒",
  ].join("\n"),

  "树": [
    "变量",
    "├─ 声明式",
    "│  └─ 只读绑定",
    "└─ 命令式",
  ].join("\n"),

  "双线表格": [
    "╔══════════╦════════╗",
    "║ 维度     ║ 声明式 ║",
    "╠══════════╬════════╣",
    "║ 赋值     ║ 不合法 ║",
    "╚══════════╩════════╝",
  ].join("\n"),

  "T 形分支连通": [
    "┌────┬────┐",
    "│ A  │ B  │",
    "└────┴────┘",
  ].join("\n"),
};

for (const [name, text] of Object.entries(POSITIVES)) {
  test(`正例：${name}`, () => {
    const r = check(text);
    assert.equal(r.code, 0, r.stdout);
    assert.match(r.stdout, /^OK：/);
  });
}

// ---- 反例 ----

const NEGATIVES = {
  "emoji": ["┌────┐", "│ ✅ │", "└────┘"].join("\n"),

  "ANSI 颜色码": "\u001b[32m┌────┐\u001b[0m\n│ A  │\n└────┘",

  "中文按 1 列导致右框错位": [
    "┌────────┐",
    "│ 声明式  │",
    "└────────┘",
  ].join("\n"),

  "断开的竖线": ["│    │", "│     │"].join("\n"),

  "框外字符": ["┌────┐", "│ A  │", "└────┘x"].join("\n"),

  "制表符": ["┌────────┐", "│\t     │", "└────────┘"].join("\n"),
};

for (const [name, text] of Object.entries(NEGATIVES)) {
  test(`反例：${name}`, () => {
    const r = check(text);
    assert.equal(r.code, 1, `期望失败但退出码为 ${r.code}：${r.stdout}`);
  });
}

test("反例：空输入", () => {
  const r = check("\n\n");
  assert.equal(r.code, 1);
});

// ---- docs/archive/skills/fixtures-s-diagram 的内联副本 ----
// 文件名 good-* / *-ok 应通过；其余应报错。断言同时校验报错要点。

const FIXTURES = {
  "good-stacked": {
    ok: true,
    text: [
      "┌───────┐   ┌───────┐",
      "│ X = Y │──▸│ Y = 3 │",
      "└───────┘   └───────┘",
      "╔══════════════╦════════════════════╗",
      "║ 情形         ║ 结果               ║",
      "╠══════════════╬════════════════════╣",
      "║ X 已绑定为 3 ║ X=3 成功，X=4 失败 ║",
      "╚══════════════╩════════════════════╝",
      "单赋值存储 │██████████████████░░ 9",
      "合一       │██████████████░░░░░░ 7",
      "╭─ 声明式模型",
      "│  ├─ 单赋值存储",
      "│  │  └─ 合一 ◆ 本周重点",
      "│  └─ 数据流变量",
      "╰─ 有状态模型",
      "复习量  ⣀⣠⣤⣶⣾⣷⣶⣤",
    ].join("\n"),
  },
  "broken": {
    ok: false,
    text: ["┌────┐", "│ ok  ", "└────┘"].join("\n"),
    match: /第 1 行第 6 列.*┐.*下方断开/,
  },
  "corner": {
    ok: false,
    text: ["┌──┬──┐", "│ a│ b│", "└──┴──┘", "┌──┐", "│ab│", "└─┘"].join("\n"),
    match: /第 6 行第 3 列.*┘.*上方断开/,
  },
  "cjk1col": {
    ok: false,
    text: [
      "┌──────┐",
      "│ 合一 │",
      "│ 单赋值存储 │",
      "└──────┘",
    ].join("\n"),
    match: /上方断开/,
  },
  "cjk-narrow": {
    ok: false,
    text: ["┌──────┐", "│ 合一   │", "└──────┘"].join("\n"),
    match: /下方断开[\s\S]*上方断开/,
  },
  "drift": {
    ok: false,
    text: [
      "声明式模型      命令式模型",
      "变量名 → 只读    变量名 → 可变",
      "重新赋值：不行    重新赋值：可以",
    ].join("\n"),
    match: /疑似列错位/,
  },
  "columns-ok": {
    ok: true,
    text: [
      "声明式模型      命令式模型",
      "变量名 → 只读   变量名 → 可变",
      "重新赋值：不行  重新赋值：可以",
    ].join("\n"),
  },
  "emoji": {
    ok: false,
    text: ["┌────┐", "│ ok │ ✅", "└────┘"].join("\n"),
    match: /U\+2705/,
  },
  "ansi": {
    ok: false,
    text: "\u001b[31mred\u001b[0m",
    match: /U\+001B/,
  },
};

for (const [name, fx] of Object.entries(FIXTURES)) {
  test(`样例：${name}`, () => {
    const r = check(fx.text);
    if (fx.ok) {
      assert.equal(r.code, 0, `期望通过，实际报错：${r.stdout}`);
      assert.match(r.stdout, /^OK：/);
    } else {
      assert.equal(r.code, 1, `期望报错，实际通过：${r.stdout}`);
      if (fx.match) assert.match(r.stdout, fx.match);
    }
  });
}

// ---- 新规则边界：列错位只报相差 1–2 列 ----

test("列错位：相差 ≥ 3 列不报", () => {
  const r = check(
    ["甲      乙", "丙          丁"].join("\n"),
  );
  // 右栏起始列 8 与 12，相差 4 → 不算错位（且无框）。
  assert.equal(r.code, 0, r.stdout);
});

test("列错位：非空格后开始的第二栏对齐不报", () => {
  const r = check(["表头  值", "数据  值"].join("\n"));
  assert.equal(r.code, 0, r.stdout);
});

// ---- patterns.md 中所有示例作为正例 ----

const PATTERNS = join(HERE, "references", "patterns.md");

test("references/patterns.md 中的全部 text 示例通过校验", () => {
  const md = readFileSync(PATTERNS, "utf8");
  const blocks = [...md.matchAll(/```text\n([\s\S]*?)```/g)].map((m) =>
    m[1].replace(/\n$/, ""),
  );
  assert.ok(blocks.length >= 5, `示例太少：${blocks.length}`);
  for (const block of blocks) {
    const r = check(block);
    assert.equal(r.code, 0, `示例校验失败：\n${block}\n${r.stdout}`);
  }
});

// ---- --help 与 --json ----

test("--help 退出码 0", () => {
  const out = execFileSync("node", [SCRIPT, "--help"], { encoding: "utf8" });
  assert.match(out, /用法/);
});

test("--json 输出机器可读结果", () => {
  const dir = mkdtempSync(join(tmpdir(), "diagram-test-"));
  const file = join(dir, "d.txt");
  writeFileSync(file, "┌──┐\n│ A│\n└──┘", "utf8");
  try {
    const out = execFileSync("node", [SCRIPT, "--json", file], { encoding: "utf8" });
    const parsed = JSON.parse(out);
    assert.equal(parsed.ok, true);
    assert.ok(Array.isArray(parsed.issues));
    assert.equal(typeof parsed.maxWidth, "number");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
