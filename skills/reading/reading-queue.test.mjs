#!/usr/bin/env node
// reading-queue.mjs 的测试：使用 node:test + node:assert，无第三方依赖。
// 每个测试在 os.tmpdir() 下建临时 Wiki，不触碰真实库。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "reading-queue.mjs");

// 真实库布局：<vault>/{raw,Clippings,wiki}，其中 wiki/ 必须预先存在。
async function makeWiki() {
  const dir = await mkdtemp(join(tmpdir(), "reading-test-"));
  await mkdir(join(dir, "raw", "articles"), { recursive: true });
  await mkdir(join(dir, "Clippings"), { recursive: true });
  await mkdir(join(dir, "wiki"), { recursive: true });
  return dir;
}

async function q(args, { expectFail = false } = {}) {
  try {
    const { stdout } = await run("node", [SCRIPT, ...args], { encoding: "utf8" });
    if (expectFail) assert.fail(`期望失败但成功：${args.join(" ")}\n${stdout}`);
    return { code: 0, stdout };
  } catch (error) {
    if (!expectFail) throw error;
    return { code: error.code ?? 1, stderr: error.stderr ?? "", stdout: error.stdout ?? "" };
  }
}

async function jsonQ(args) {
  const { stdout } = await q([...args, "--json"]);
  return JSON.parse(stdout);
}

async function writeSource(wiki, rel, title) {
  const file = join(wiki, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `# ${title}\n\n正文内容。\n`, "utf8");
  return file;
}

async function readPage(vault, slug) {
  return readFile(join(vault, "wiki", "reading", `${slug}.md`), "utf8");
}

test("slug 生成：中文、空格、非法字符", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/articles/我的 笔记 01?.md", "中文标题");
  await q(["add", wiki, "raw/articles/我的 笔记 01?.md"]);
  const page = await readPage(wiki, "我的-笔记-01");
  assert.match(page, /^# 中文标题$/m);
  await rm(wiki, { recursive: true, force: true });
});

test("add：各优先级生成正确 due 与初始状态", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await writeSource(wiki, "raw/b.md", "B");
  await writeSource(wiki, "Clippings/c.md", "C");
  const today = "2026-11-03";

  const high = await jsonQ(["add", wiki, "raw/a.md", "--priority", "high", "--today", today]);
  assert.equal(high.due, today);
  const medium = await jsonQ(["add", wiki, "raw/b.md", "--priority", "medium", "--today", today]);
  assert.equal(medium.due, "2026-11-04");
  const low = await jsonQ(["add", wiki, "Clippings/c.md", "--priority", "low", "--today", today]);
  assert.equal(low.due, "2026-11-04");

  const page = await readPage(wiki, "a");
  assert.match(page, /status: queued/);
  assert.match(page, /interval_days: 1/);
  assert.match(page, /last_read: ""/);
  assert.match(page, /position: ""/);

  const log = await readFile(join(wiki, "wiki", "log.md"), "utf8");
  assert.match(log, /## 2026-11-03 reading \| A/);
  assert.match(log, /Added to queue \(priority: high\)\./);
  await rm(wiki, { recursive: true, force: true });
});

test("add：--due today 让低优先级也排到今天", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await writeSource(wiki, "raw/b.md", "B");
  const today = "2026-11-03";
  const forced = await jsonQ(["add", wiki, "raw/a.md", "--priority", "low", "--due", "today", "--today", today]);
  assert.equal(forced.due, today);
  const scheduled = await jsonQ(["add", wiki, "raw/b.md", "--priority", "low", "--due", "scheduled", "--today", today]);
  assert.equal(scheduled.due, "2026-11-04");
  const fail = await q(["add", wiki, "raw/a.md", "--due", "tomorrow", "--slug", "a2"], { expectFail: true });
  assert.match(fail.stderr, /--due 非法/);
  await rm(wiki, { recursive: true, force: true });
});

test("add：同 slug 拒绝，可用 --slug 绕过", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/dup.md", "Dup");
  await q(["add", wiki, "raw/dup.md"]);
  const fail = await q(["add", wiki, "raw/dup.md"], { expectFail: true });
  assert.match(fail.stderr, /已存在同 slug/);
  const ok = await q(["add", wiki, "raw/dup.md", "--slug", "dup-2"], { expectFail: false });
  assert.ok(ok.stdout.length > 0);
  await rm(wiki, { recursive: true, force: true });
});

test("add：原文不在 raw/Clippings 下拒绝", async () => {
  const wiki = await makeWiki();
  await mkdir(join(wiki, "other"), { recursive: true });
  await writeFile(join(wiki, "other/x.md"), "# X\n", "utf8");
  const fail = await q(["add", wiki, "other/x.md"], { expectFail: true });
  assert.match(fail.stderr, /raw\/ 或 Clippings\//);
  await rm(wiki, { recursive: true, force: true });
});

test("add：写入 wiki/ 下且不在库根目录建 reading//log.md", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/layout.md", "Layout");
  await q(["add", wiki, "raw/layout.md", "--priority", "high", "--today", "2026-11-03"]);

  // 旧错误布局不应出现
  assert.ok(!existsSync(join(wiki, "reading")), "根目录不应出现 reading/");
  assert.ok(!existsSync(join(wiki, "log.md")), "根目录不应出现 log.md");
  // 正确位置应存在
  assert.ok(existsSync(join(wiki, "wiki", "reading", "layout.md")), "应在 wiki/reading/ 生成阅读页");
  assert.ok(existsSync(join(wiki, "wiki", "log.md")), "应在 wiki/log.md 追加日志");
  await rm(wiki, { recursive: true, force: true });
});

test("add：wiki/ 缺失时视为非库根目录并拒绝", async () => {
  const dir = await mkdtemp(join(tmpdir(), "reading-test-"));
  await mkdir(join(dir, "raw"), { recursive: true });
  await writeFile(join(dir, "raw", "a.md"), "# A\n", "utf8");
  const fail = await q(["add", dir, "raw/a.md"], { expectFail: true });
  assert.match(fail.stderr, /不是 Wiki 库根目录/);
  assert.ok(!existsSync(join(dir, "wiki")), "不应自动创建 wiki/");
  await rm(dir, { recursive: true, force: true });
});

test("add：原文位于 Clippings/ 下可入队", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "Clippings/article.md", "Clipped");
  const res = await jsonQ(["add", wiki, "Clippings/article.md", "--today", "2026-11-03"]);
  assert.equal(res.slug, "article");
  assert.equal(res.status, "queued");
  assert.ok(existsSync(join(wiki, "wiki", "reading", "article.md")));
  await rm(wiki, { recursive: true, force: true });
});

test("add：原文不存在拒绝", async () => {
  const wiki = await makeWiki();
  const fail = await q(["add", wiki, "raw/missing.md"], { expectFail: true });
  assert.match(fail.stderr, /原文不存在/);
  await rm(wiki, { recursive: true, force: true });
});

test("today：排序（优先级→逾期→slug）与 limit", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/h.md", "H");
  await writeSource(wiki, "raw/m.md", "M");
  await writeSource(wiki, "raw/l.md", "L");
  const today = "2026-11-10";

  await q(["add", wiki, "raw/l.md", "--priority", "low", "--today", "2026-11-03"]);
  await q(["add", wiki, "raw/m.md", "--priority", "medium", "--today", "2026-11-11"]);
  await q(["add", wiki, "raw/h.md", "--priority", "high", "--today", today]);

  const items = await jsonQ(["today", wiki, "--today", today, "--limit", "10"]);
  assert.deepEqual(
    items.map((i) => i.slug),
    ["h", "l"],
  );

  const limited = await jsonQ(["today", wiki, "--today", today, "--limit", "1"]);
  assert.equal(limited.length, 1);
  assert.equal(limited[0].slug, "h");
  await rm(wiki, { recursive: true, force: true });
});

test("list：返回整个队列（排除 done），按到期日排序", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await writeSource(wiki, "raw/b.md", "B");
  await writeSource(wiki, "raw/c.md", "C");
  // a: 今天到期（high），b: 明天到期（high→明天），c: 后天到期，随后完成 c
  await q(["add", wiki, "raw/a.md", "--priority", "high", "--today", "2026-11-03"]);
  await q(["add", wiki, "raw/b.md", "--priority", "low", "--today", "2026-11-03"]);
  await q(["add", wiki, "raw/c.md", "--priority", "medium", "--today", "2026-11-03"]);
  await q(["review", wiki, "c", "--outcome", "done", "--today", "2026-11-04"]);

  const items = await jsonQ(["list", wiki]);
  assert.deepEqual(
    items.map((i) => i.slug),
    ["a", "b"],
  );
  assert.equal(items[0].due, "2026-11-03");
  assert.equal(items[1].due, "2026-11-04");
  await rm(wiki, { recursive: true, force: true });
});

test("review next：三种优先级的间隔增长", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/h.md", "H");
  await writeSource(wiki, "raw/m.md", "M");
  await writeSource(wiki, "raw/l.md", "L");
  await q(["add", wiki, "raw/h.md", "--priority", "high"]);
  await q(["add", wiki, "raw/m.md", "--priority", "medium"]);
  await q(["add", wiki, "raw/l.md", "--priority", "low"]);

  const h = await jsonQ(["review", wiki, "h", "--outcome", "next", "--today", "2026-11-03"]);
  assert.equal(h.status, "active");
  assert.equal(h.due, "2026-11-05"); // round(1*1.5)+1天=2天后? round(1*1.5)=2 → 11-05

  const m = await jsonQ(["review", wiki, "m", "--outcome", "next", "--today", "2026-11-03"]);
  assert.equal(m.due, "2026-11-05"); // round(1*2)=2 → 11-05

  const l = await jsonQ(["review", wiki, "l", "--outcome", "next", "--today", "2026-11-03"]);
  assert.equal(l.due, "2026-11-06"); // round(1*3)=3 → 11-06

  const page = await readPage(wiki, "h");
  assert.match(page, /last_read: 2026-11-03/);
  assert.match(page, /interval_days: 2/);
  assert.match(page, /- 2026-11-03: next/m);
  await rm(wiki, { recursive: true, force: true });
});

test("review next：--position 与 --note 写入", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await q(["add", wiki, "raw/a.md"]);
  await q([
    "review", wiki, "a", "--outcome", "next",
    "--position", "第 3 节",
    "--note", "较难",
    "--today", "2026-11-03",
  ]);
  const page = await readPage(wiki, "a");
  assert.match(page, /position: "第 3 节"/);
  assert.match(page, /- 2026-11-03: next, 第 3 节, 较难/);
  await rm(wiki, { recursive: true, force: true });
});

test("review postpone：间隔不变、last_read 不变", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await q(["add", wiki, "raw/a.md", "--priority", "high", "--today", "2026-11-03"]);
  await q(["review", wiki, "a", "--outcome", "next", "--today", "2026-11-03"]);
  const before = await readPage(wiki, "a");
  assert.match(before, /last_read: 2026-11-03/);

  const res = await jsonQ(["review", wiki, "a", "--outcome", "postpone", "--today", "2026-11-04"]);
  assert.equal(res.due, "2026-11-06"); // 今天 + interval(2)
  const page = await readPage(wiki, "a");
  assert.match(page, /interval_days: 2/);
  assert.match(page, /last_read: 2026-11-03/); // 不变
  assert.match(page, /- 2026-11-04: postpone/);
  await rm(wiki, { recursive: true, force: true });
});

test("review done：清空 due 并写 log（含 Extracts 计数）", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await q(["add", wiki, "raw/a.md", "--priority", "high", "--today", "2026-11-03"]);
  // 手工补 Extracts 链接，验证计数
  const file = join(wiki, "wiki", "reading", "a.md");
  const text = await readFile(file, "utf8");
  await writeFile(
    file,
    text.replace(
      "## Extracts\n",
      "## Extracts\n- [[extracts/a/2026-11-03-x]]\n- [[extracts/a/2026-11-03-y]]\n",
    ),
    "utf8",
  );
  await mkdir(join(wiki, "wiki", "extracts", "a"), { recursive: true });

  const res = await jsonQ(["review", wiki, "a", "--outcome", "done", "--today", "2026-11-05"]);
  assert.equal(res.status, "done");
  assert.equal(res.due, "");
  const page = await readPage(wiki, "a");
  assert.match(page, /status: done/);
  assert.match(page, /due: ""/);
  assert.match(page, /last_read: 2026-11-05/);
  const log = await readFile(join(wiki, "wiki", "log.md"), "utf8");
  assert.match(log, /Finished; extracts: 2\./);
  await rm(wiki, { recursive: true, force: true });
});

test("对 done 条目 review 报错", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await q(["add", wiki, "raw/a.md"]);
  await q(["review", wiki, "a", "--outcome", "done"]);
  const fail = await q(["review", wiki, "a", "--outcome", "next"], { expectFail: true });
  assert.match(fail.stderr, /无法 review/);
  await rm(wiki, { recursive: true, force: true });
});

test("pause/resume：恢复为 queued 或 active", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await writeSource(wiki, "raw/b.md", "B");
  await q(["add", wiki, "raw/a.md"]);
  await q(["add", wiki, "raw/b.md"]);

  await q(["pause", wiki, "a"]);
  assert.match(await readPage(wiki, "a"), /status: paused/);
  await q(["resume", wiki, "a"]);
  assert.match(await readPage(wiki, "a"), /status: queued/);

  await q(["review", wiki, "b", "--outcome", "next"]);
  await q(["pause", wiki, "b"]);
  await q(["resume", wiki, "b"]);
  assert.match(await readPage(wiki, "b"), /status: active/);

  // 停靠后 a 已 resume 回 queued，可再次 pause
  const ok = await q(["pause", wiki, "a"], { expectFail: false });
  assert.ok(ok.code === 0);

  await q(["review", wiki, "b", "--outcome", "done"]);
  const doneFail = await q(["pause", wiki, "b"], { expectFail: true });
  assert.match(doneFail.stderr, /无法 pause/);
  await rm(wiki, { recursive: true, force: true });
});

test("resume：due 设为 --today，并追加 Reading Log", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await q(["add", wiki, "raw/a.md", "--priority", "low", "--today", "2026-11-01"]);
  await q(["pause", wiki, "a", "--today", "2026-11-02"]);

  const res = await jsonQ(["resume", wiki, "a", "--today", "2026-11-05"]);
  assert.equal(res.status, "queued");
  const page = await readPage(wiki, "a");
  assert.match(page, /due: 2026-11-05/);
  assert.match(page, /- 2026-11-02: paused/);
  assert.match(page, /- 2026-11-05: resumed/);
  await rm(wiki, { recursive: true, force: true });
});

test("resume：对 done/queued/active 报错，只有 paused 可恢复", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/q.md", "Q");
  await writeSource(wiki, "raw/act.md", "Act");
  await writeSource(wiki, "raw/d.md", "D");
  await q(["add", wiki, "raw/q.md"]);
  await q(["add", wiki, "raw/act.md"]);
  await q(["add", wiki, "raw/d.md"]);
  await q(["review", wiki, "act", "--outcome", "next"]);
  await q(["review", wiki, "d", "--outcome", "done"]);

  for (const slug of ["q", "act", "d"]) {
    const fail = await q(["resume", wiki, slug], { expectFail: true });
    assert.match(fail.stderr, /只有暂停的条目可以恢复/);
  }
  await rm(wiki, { recursive: true, force: true });
});

test("pause：对已暂停条目报错", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await q(["add", wiki, "raw/a.md"]);
  await q(["pause", wiki, "a", "--today", "2026-11-03"]);
  assert.match(await readPage(wiki, "a"), /- 2026-11-03: paused/);

  const fail = await q(["pause", wiki, "a"], { expectFail: true });
  assert.match(fail.stderr, /已暂停/);
  await rm(wiki, { recursive: true, force: true });
});

test("正文与未知键保留", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await q(["add", wiki, "raw/a.md"]);
  const file = join(wiki, "wiki", "reading", "a.md");
  let text = await readFile(file, "utf8");
  text = text.replace("status: queued", "custom_field: keepme\nstatus: queued");
  text = text.replace("## Extracts\n", "## Extracts\n- [[extracts/a/x]]\n");
  text = text.replace("# A\n", "# A\n\n用户手写的正文。\n");
  await writeFile(file, text, "utf8");

  await q(["review", wiki, "a", "--outcome", "next"]);
  const after = await readFile(file, "utf8");
  assert.match(after, /custom_field: keepme/);
  assert.match(after, /用户手写的正文。/);
  assert.match(after, /- \[\[extracts\/a\/x\]\]/);
  await rm(wiki, { recursive: true, force: true });
});

test("verify：发现缺失原文与非法日期", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await q(["add", wiki, "raw/a.md", "--priority", "high"]);

  let ok = await q(["verify", wiki], { expectFail: false });
  assert.match(ok.stdout, /verify: OK/);

  const file = join(wiki, "wiki", "reading", "a.md");
  let text = await readFile(file, "utf8");
  text = text.replace(/due: \d{4}-\d{2}-\d{2}/, "due: 2026-13-40");
  text = text.replace(/source: .*/, 'source: "[[raw/gone]]"');
  await writeFile(file, text, "utf8");

  const bad = await q(["verify", wiki], { expectFail: true });
  assert.match(bad.stderr, /due 日期非法/);
  assert.match(bad.stderr, /source 指向的文件不存在/);
  await rm(wiki, { recursive: true, force: true });
});

test("verify：能定位 wiki/extracts/ 下的摘录链接", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await q(["add", wiki, "raw/a.md", "--priority", "high"]);

  // 在阅读页写入指向 <vault>/wiki/extracts/ 的链接，并真正创建该文件。
  const file = join(wiki, "wiki", "reading", "a.md");
  const text = await readFile(file, "utf8");
  await writeFile(
    file,
    text.replace("## Extracts\n", "## Extracts\n- [[extracts/a/2026-11-03-x]]\n"),
    "utf8",
  );
  await mkdir(join(wiki, "wiki", "extracts", "a"), { recursive: true });
  await writeFile(join(wiki, "wiki", "extracts", "a", "2026-11-03-x.md"), "# X\n", "utf8");

  const ok = await q(["verify", wiki], { expectFail: false });
  assert.match(ok.stdout, /verify: OK/);

  // 摘录文件被删后应报错，证明解析指向 wiki/extracts/
  await rm(join(wiki, "wiki", "extracts", "a", "2026-11-03-x.md"));
  const bad = await q(["verify", wiki], { expectFail: true });
  assert.match(bad.stderr, /Extracts 链接的文件不存在/);
  await rm(wiki, { recursive: true, force: true });
});

test("verify：done 时 due 非空报错", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await q(["add", wiki, "raw/a.md", "--priority", "high"]);
  await q(["review", wiki, "a", "--outcome", "done", "--today", "2026-11-03"]);
  const file = join(wiki, "wiki", "reading", "a.md");
  let text = await readFile(file, "utf8");
  text = text.replace('due: ""', "due: 2026-11-10");
  await writeFile(file, text, "utf8");
  const bad = await q(["verify", wiki], { expectFail: true });
  assert.match(bad.stderr, /status=done 但 due 非空/);
  await rm(wiki, { recursive: true, force: true });
});

test("stats：各状态计数、到期、逾期、近 7 天 review、待制卡", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await writeSource(wiki, "raw/b.md", "B");
  await writeSource(wiki, "raw/c.md", "C");
  const today = "2026-11-10";

  await q(["add", wiki, "raw/a.md", "--priority", "high", "--today", "2026-11-10"]);
  await q(["add", wiki, "raw/b.md", "--priority", "low", "--today", "2026-11-03"]);
  await q(["add", wiki, "raw/c.md", "--priority", "medium", "--today", "2026-11-10"]);
  await q(["review", wiki, "c", "--outcome", "next", "--today", "2026-11-08"]);
  // pause 也要注入固定日期：它会在 Reading Log 追加一行，若用真实日期，
  // 该行可能落进「近 7 天」窗口，让 reviewsLast7 随运行日期变化。
  // 这里选窗口外（< today-6=2026-11-04）的日期，保持 reviewsLast7 恒为 1。
  await q(["pause", wiki, "a", "--today", "2026-10-01"]);

  await mkdir(join(wiki, "wiki", "extracts", "a"), { recursive: true });
  await writeFile(
    join(wiki, "wiki", "extracts", "a", "e1.md"),
    "---\ncards: pending\n---\n# E1\n",
    "utf8",
  );
  await writeFile(
    join(wiki, "wiki", "extracts", "a", "e2.md"),
    "---\ncards: done\n---\n# E2\n",
    "utf8",
  );

  const stats = await jsonQ(["stats", wiki, "--today", today]);
  assert.equal(stats.reading.paused, 1);
  assert.equal(stats.reading.queued, 1);
  assert.equal(stats.reading.active, 1);
  assert.equal(stats.overdue, 1);
  assert.equal(stats.reviewsLast7, 1);
  assert.equal(stats.cardsPending, 1);
  await rm(wiki, { recursive: true, force: true });
});

test("原子写入：无残留临时文件", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await q(["add", wiki, "raw/a.md"]);
  await q(["review", wiki, "a", "--outcome", "next"]);
  await q(["pause", wiki, "a"]);
  await q(["resume", wiki, "a"]);
  const entries = await readdir(join(wiki, "wiki", "reading"));
  assert.ok(entries.every((name) => !name.includes(".tmp-")), `残留临时文件：${entries}`);
  const rootEntries = await readdir(wiki);
  assert.ok(rootEntries.every((name) => !name.includes(".tmp-")), `根目录残留：${rootEntries}`);
  await rm(wiki, { recursive: true, force: true });
});

test("source 引号：add → review → pause → resume 往返保持带引号", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/articles/引号测试.md", "引号测试");
  await q(["add", wiki, "raw/articles/引号测试.md", "--priority", "high", "--today", "2026-11-03"]);
  assert.match(await readPage(wiki, "引号测试"), /^source: "\[\[.*\]\]"$/m);

  await q(["review", wiki, "引号测试", "--outcome", "next", "--today", "2026-11-03"]);
  assert.match(await readPage(wiki, "引号测试"), /^source: "\[\[.*\]\]"$/m);

  await q(["pause", wiki, "引号测试"]);
  assert.match(await readPage(wiki, "引号测试"), /^source: "\[\[.*\]\]"$/m);

  await q(["resume", wiki, "引号测试"]);
  const final = await readPage(wiki, "引号测试");
  assert.match(final, /^source: "\[\[.*\]\]"$/m);
  assert.match(final, /^last_read: 2026-11-03$/m); // 日期字段仍不加引号
  await rm(wiki, { recursive: true, force: true });
});

test("position 引号：含双引号与反斜杠时往返不变且正确转义", async () => {
  const wiki = await makeWiki();
  await writeSource(wiki, "raw/a.md", "A");
  await q(["add", wiki, "raw/a.md", "--priority", "high", "--today", "2026-11-03"]);

  const position = '第 "3" 节 \\ 路径'; // 值的实际内容：第 "3" 节 \ 路径
  const expectedLine = 'position: "第 \\"3\\" 节 \\\\ 路径"'; // 文件中该行的字面文本

  await q(["review", wiki, "a", "--outcome", "next", "--position", position, "--today", "2026-11-03"]);
  const linesOnce = (await readPage(wiki, "a")).split("\n");
  assert.ok(linesOnce.includes(expectedLine), `首次写入未正确转义：\n${linesOnce.join("\n")}`);

  // 多次往返（postpone → next）后仍不变
  await q(["review", wiki, "a", "--outcome", "postpone", "--today", "2026-11-04"]);
  await q(["review", wiki, "a", "--outcome", "next", "--today", "2026-11-05"]);
  const linesTwice = (await readPage(wiki, "a")).split("\n");
  assert.ok(linesTwice.includes(expectedLine), `往返后未保持转义：\n${linesTwice.join("\n")}`);

  // 上面的 postpone/next 都会重新解析该文件再写回；行字节不变即证明转义与反转义互逆。
  await rm(wiki, { recursive: true, force: true });
});
