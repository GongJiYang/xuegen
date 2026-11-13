#!/usr/bin/env node
// course-state.mjs after-read 的测试：node:test + node:assert，无第三方依赖。
// 在 os.tmpdir() 下建临时课程文件，不触碰真实库。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "course-state.mjs");
const READONLY = 0o444;

/** 一份带「讲后读」的课程页：Today 里一条未打勾、一条已打勾，This Week 里另有一条同名未打勾。 */
const COURSE = `<!-- xuegen:course-state -->

# 离散数学学习计划

## Key Facts

- 当前周：W1 · 命题逻辑

## This Week

W1 · 命题逻辑

- [ ] 讲后读 §9.9 别处同名行 · 2026-11-20 读

## Today

日期：2026-11-08

- [ ] 讲后读 §1.1–1.4 核心页 · 2026-11-08 读
- [x] 讲后读 §0.1 引言 · 2026-11-07 读
- [ ] 继续 D2

## Next Session

[[reading/epp|离散数学（Epp, 5th ed）]] §2.1。

## Learning Record

### 2026-11-07-01

- 记录。
`;

/** 跑 after-read；期望失败时拿到 stderr 而不是抛出的错误对象。 */
async function afterRead(file, label, extra = []) {
  try {
    const { stdout } = await exec(process.execPath, [SCRIPT, "after-read", file, label, ...extra]);
    return { ok: true, stdout };
  } catch (error) {
    return { ok: false, stderr: error.stderr ?? "", code: error.code };
  }
}

async function freshCourse(text = COURSE) {
  const dir = await mkdtemp(join(tmpdir(), "course-state-"));
  const file = join(dir, "epp.md");
  await writeFile(file, text, "utf8");
  return { dir, file };
}

test("after-read 打勾 Today 里那条讲后读并追加自报说明，权限回到 0444", async () => {
  const { dir, file } = await freshCourse();
  try {
    await exec(process.execPath, [SCRIPT, "lock", file]);
    const result = await afterRead(file, "§1.1–1.4 核心页", ["--date", "2026-11-08"]);
    assert.equal(result.ok, true, result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.equal(out.label, "§1.1–1.4 核心页");
    assert.equal(out.file, file);
    assert.equal(out.reading, "epp");

    const text = await readFile(file, "utf8");
    assert.match(text, /- \[x\] 讲后读 §1\.1–1\.4 核心页 · 2026-11-08 读（用户自报，未检查，2026-11-08）/);
    // 其他行一个字节都不改：已打勾行与 This Week 同名行原样。
    assert.match(text, /- \[x\] 讲后读 §0\.1 引言 · 2026-11-07 读\n/);
    assert.match(text, /- \[ \] 讲后读 §9\.9 别处同名行 · 2026-11-20 读/);
    assert.equal((await stat(file)).mode & 0o777, READONLY);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("after-read：「核心页」是内部词，标签不带它也能打上带它的那行", async () => {
  const { dir, file } = await freshCourse();
  try {
    await exec(process.execPath, [SCRIPT, "lock", file]);
    const result = await afterRead(file, "§1.1–1.4", ["--date", "2026-11-08"]);
    assert.equal(result.ok, true, result.stderr);
    const text = await readFile(file, "utf8");
    // 打勾的那行原样保留「核心页」——课程页的写法不动，只改了界面上的显示。
    assert.match(text, /- \[x\] 讲后读 §1\.1–1\.4 核心页 · 2026-11-08 读（用户自报，未检查，2026-11-08）/);
    assert.match(text, /- \[x\] 讲后读 §0\.1 引言 · 2026-11-07 读\n/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("after-read：标签只差「核心页」以外的字仍然不匹配", async () => {
  const { dir, file } = await freshCourse();
  try {
    const result = await afterRead(file, "§1.1–1.5");
    assert.equal(result.ok, false);
    assert.match(result.stderr, /没有找到未打勾的讲后读：§1\.1–1\.5/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("after-read 标签不匹配时失败且文件不变", async () => {
  const { dir, file } = await freshCourse();
  try {
    await exec(process.execPath, [SCRIPT, "lock", file]);
    const result = await afterRead(file, "§9.9 不存在");
    assert.equal(result.ok, false);
    assert.match(result.stderr, /没有找到未打勾的讲后读：§9\.9 不存在/);
    assert.equal(await readFile(file, "utf8"), COURSE);
    assert.equal((await stat(file)).mode & 0o777, READONLY);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("after-read 已打勾的讲后读不再匹配", async () => {
  const { dir, file } = await freshCourse();
  try {
    await exec(process.execPath, [SCRIPT, "lock", file]);
    const result = await afterRead(file, "§0.1 引言");
    assert.equal(result.ok, false);
    assert.match(result.stderr, /没有找到未打勾的讲后读：§0\.1 引言/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("after-read 只改 ## Today；This Week 的同名行不算命中", async () => {
  const { dir, file } = await freshCourse();
  try {
    await exec(process.execPath, [SCRIPT, "lock", file]);
    const result = await afterRead(file, "§9.9 别处同名行");
    assert.equal(result.ok, false);
    assert.equal(await readFile(file, "utf8"), COURSE);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("after-read 没有 reading 链接时 reading 为 null", async () => {
  const { dir, file } = await freshCourse(COURSE.replace("[[reading/epp|离散数学（Epp, 5th ed）]]", "无链接"));
  try {
    const result = await afterRead(file, "§1.1–1.4 核心页");
    assert.equal(result.ok, true, result.stderr);
    assert.equal(JSON.parse(result.stdout.trim()).reading, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/** 课程页：Today 那行带「核心页已定」页码，Next Session 链着书房书与旧阅读页。 */
const BOOK_COURSE = `<!-- xuegen:course-state -->

# 离散数学学习计划

## Key Facts

- 当前周：W1 · 命题逻辑

## Today

日期：2026-11-10

- [ ] 讲后读 §1.1–1.4 核心页 · 2026-11-10 读（核心页已定：pp.1–5、7–12、17–21、24–27、31，跳过…）
- [ ] 继续 D2

## Next Session

读 [[shelf/epp|Epp]] §2.1，附录见 [[reading/epp-appendix|附录]]。

## Learning Record

### 2026-11-09-01

- 记录。
`;

test("after-read：输出 book / course / pages（有 [[shelf/…]] 链接时）", async () => {
  const { dir, file } = await freshCourse(BOOK_COURSE);
  try {
    const result = await afterRead(file, "§1.1–1.4 核心页", ["--date", "2026-11-10"]);
    assert.equal(result.ok, true, result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.equal(out.book, "epp");
    assert.equal(out.course, "epp");
    assert.equal(out.pages, "1–5、7–12、17–21、24–27、31");
    assert.equal(out.reading, "epp-appendix");
    // 打勾仍只改 Today 那一行
    const text = await readFile(file, "utf8");
    assert.match(text, /- \[x\] 讲后读 §1\.1–1\.4 核心页 · 2026-11-10 读（核心页已定：pp\.1–5、7–12、17–21、24–27、31，跳过…）（用户自报，未检查，2026-11-10）/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("after-read：没有书房链接、没有「核心页已定」时 book 与 pages 为 null", async () => {
  const { dir, file } = await freshCourse(COURSE);
  try {
    const result = await afterRead(file, "§1.1–1.4 核心页", ["--date", "2026-11-08"]);
    assert.equal(result.ok, true, result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.equal(out.book, null);
    assert.equal(out.pages, null);
    // 文件名是 epp.md → course = epp；旧阅读页链接仍在
    assert.equal(out.course, "epp");
    assert.equal(out.reading, "epp");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("after-read：「核心页已定」全角逗号与末尾顿号也去掉", async () => {
  const text = BOOK_COURSE.replace(
    "pp.1–5、7–12、17–21、24–27、31，跳过…）",
    "pp.3，4，5，）",
  );
  const { dir, file } = await freshCourse(text);
  try {
    const result = await afterRead(file, "§1.1–1.4 核心页", ["--date", "2026-11-10"]);
    assert.equal(result.ok, true, result.stderr);
    assert.equal(JSON.parse(result.stdout.trim()).pages, "3，4，5");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("after-read：有书房链接但行里没有 pp. 时 pages 为 null", async () => {
  const text = BOOK_COURSE.replace("（核心页已定：pp.1–5、7–12、17–21、24–27、31，跳过…）", "");
  const { dir, file } = await freshCourse(text);
  try {
    const result = await afterRead(file, "§1.1–1.4 核心页", ["--date", "2026-11-10"]);
    assert.equal(result.ok, true, result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.equal(out.book, "epp");
    assert.equal(out.pages, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/** 把一条讲后读行放进一份课程页的 ## Today，标签取行里「讲后读 」之后、「 · 」之前。 */
const lineCourse = (line) => `<!-- xuegen:course-state -->

# 离散数学学习计划

## Today

日期：2026-11-12

${line}
- [ ] 继续 D2

## Next Session

读 [[shelf/epp|Epp]] §2.1。

## Learning Record

### 2026-11-11-01

- 记录。
`;

const lineLabel = (line) => line.replace(/^- \[ \] 讲后读 /, "").split(" · ")[0].trim();

// 真实课程页里的三种写法（11-12 场景走查 S4 抄的原文）＋技能规定格式＋旧的「核心页已定」格式。
for (const [line, expected] of [
  [
    "- [ ] 讲后读 §1.1–1.4 核心页 · 2026-11-10 读（pp.1–5、7–12、17–21、24–27、31；完成条件：读完，并能说出一个要点或疑问）——今天开课时问到，用户答「没读」，仍待读",
    "1–5、7–12、17–21、24–27、31",
  ],
  [
    "- [ ] 讲后读 §2.3 核心页 · 2026-11-12 读（核心页今天已定：pp.66–75——有效性与真值表检验法…）",
    "66–75",
  ],
  [
    "- [ ] 讲后读 §2.1–2.2 核心页 · 2026-11-12 读（pp.40、43–46、54、56–59；11-10 排着 D1 的讲后读，故顺到 11-12；…）",
    "40、43–46、54、56–59",
  ],
  ["- [ ] 讲后读 §2.4 pp.56–63 · 2026-11-13 读", "56–63"],
  ["- [ ] 讲后读 §3.1 核心页 · 2026-11-14 读（核心页已定：pp.12–15）", "12–15"],
  ["- [ ] 讲后读 §3.2 核心页 · 2026-11-14 读（读完，能说出一个要点）", null],
]) {
  test(`after-read：pages 取行里第一个 pp. 后的页码列表 → ${expected}`, async () => {
    const { dir, file } = await freshCourse(lineCourse(line));
    try {
      const result = await afterRead(file, lineLabel(line), ["--date", "2026-11-12"]);
      assert.equal(result.ok, true, result.stderr);
      assert.equal(JSON.parse(result.stdout.trim()).pages, expected);
      // 打勾本身不受影响：行尾旧备注去掉，换成自报说明。
      assert.match(await readFile(file, "utf8"), /（用户自报，未检查，2026-11-12）/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

/** 课程页：Today 那行带「核心页已定」与行尾 AI 写的「——…仍待读」备注。 */
const TAIL_NOTE_COURSE = `<!-- xuegen:course-state -->

# 离散数学学习计划

## Today

日期：2026-11-10

- [ ] 讲后读 §1.1–1.4 核心页 · 2026-11-10 读（核心页已定：pp.1–5、…；完成条件：…）——今天开课时问过，用户没有说已读，仍待读
- [ ] 继续 D2

## Learning Record

### 2026-11-09-01

- 记录。
`;

test("after-read：打勾时去掉行尾旧的「——…」备注（不再留「仍待读」）", async () => {
  const { dir, file } = await freshCourse(TAIL_NOTE_COURSE);
  try {
    const result = await afterRead(file, "§1.1–1.4 核心页", ["--date", "2026-11-10"]);
    assert.equal(result.ok, true, result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.equal(out.pages, "1–5");
    const text = await readFile(file, "utf8");
    assert.match(
      text,
      /- \[x\] 讲后读 §1\.1–1\.4 核心页 · 2026-11-10 读（核心页已定：pp\.1–5、…；完成条件：…）（用户自报，未检查，2026-11-10）\n/,
    );
    assert.doesNotMatch(text, /——/);
    assert.doesNotMatch(text, /仍待读/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("after-read：没有「——」的行打勾结果与以前一样（回归）", async () => {
  const { dir, file } = await freshCourse(BOOK_COURSE);
  try {
    const result = await afterRead(file, "§1.1–1.4 核心页", ["--date", "2026-11-10"]);
    assert.equal(result.ok, true, result.stderr);
    const text = await readFile(file, "utf8");
    assert.match(
      text,
      /- \[x\] 讲后读 §1\.1–1\.4 核心页 · 2026-11-10 读（核心页已定：pp\.1–5、7–12、17–21、24–27、31，跳过…）（用户自报，未检查，2026-11-10）\n/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("after-read：括号里本身有「——」时只删最后一个后括号之后的备注", async () => {
  const text = BOOK_COURSE.replace(
    "（核心页已定：pp.1–5、7–12、17–21、24–27、31，跳过…）",
    "（完成条件：读完——能说出一个要点）——仍待读，明天再问",
  );
  const { dir, file } = await freshCourse(text);
  try {
    const result = await afterRead(file, "§1.1–1.4 核心页", ["--date", "2026-11-10"]);
    assert.equal(result.ok, true, result.stderr);
    const saved = await readFile(file, "utf8");
    assert.match(
      saved,
      /- \[x\] 讲后读 §1\.1–1\.4 核心页 · 2026-11-10 读（完成条件：读完——能说出一个要点）（用户自报，未检查，2026-11-10）\n/,
    );
    assert.doesNotMatch(saved, /仍待读/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("after-read：备注里自己带括号时，删的是深度 0 的「——」之后的备注", async () => {
  const text = BOOK_COURSE.replace(
    "- [ ] 讲后读 §1.1–1.4 核心页 · 2026-11-10 读（核心页已定：pp.1–5、7–12、17–21、24–27、31，跳过…）",
    "- [ ] 讲后读 X · 2026-11-10 读（完成条件：读完）——开课时问过（11-11），未读",
  );
  const { dir, file } = await freshCourse(text);
  try {
    const result = await afterRead(file, "X", ["--date", "2026-11-10"]);
    assert.equal(result.ok, true, result.stderr);
    const saved = await readFile(file, "utf8");
    assert.match(
      saved,
      /- \[x\] 讲后读 X · 2026-11-10 读（完成条件：读完）（用户自报，未检查，2026-11-10）\n/,
    );
    assert.doesNotMatch(saved, /开课时问过/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
