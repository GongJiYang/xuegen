#!/usr/bin/env node
// 只读课程看板：把 wiki/courses/*.md 渲染成一张自包含的静态 HTML。
// 用法：node render-board.mjs <wiki/courses 目录> <输出 html>
// 不依赖 npm 包，不联网，不写状态文件；输出页没有表单、按钮或任何编辑入口。

import { readdirSync, readFileSync, writeFileSync, chmodSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MARKER = "xuegen:course-state";
const TASK_RE = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/;
const LIST_RE = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

const [coursesDir, outFile] = process.argv.slice(2);
if (!coursesDir || !outFile) {
  console.error("用法：node render-board.mjs <wiki/courses 目录> <输出 html>");
  process.exit(2);
}

/* ---------- Markdown 解析 ---------- */

function splitSections(text) {
  let title = "";
  const sections = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (!title) {
      const h1 = line.match(/^#\s+(.+?)\s*$/);
      if (h1) { title = h1[1]; continue; }
    }
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) { cur = { name: h2[1], lines: [] }; sections.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  return { title, sections };
}

function countTasks(lines) {
  let done = 0, total = 0;
  for (const line of lines) {
    const m = line.match(TASK_RE);
    if (!m) continue;
    total++;
    if (m[1] !== " ") done++;
  }
  return { done, total };
}

function keyFact(lines, key) {
  for (const line of lines) {
    const m = line.match(/^\s*[-*]\s*([^：:]+)[：:]\s*(.*)$/);
    if (m && m[1].trim() === key) return m[2].trim();
  }
  return "";
}

function parseRecords(lines) {
  const records = [];
  let cur = null;
  for (const line of lines) {
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3) { cur = { heading: h3[1], lines: [] }; records.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  return records;
}

function parseCourse(text, file) {
  const { title, sections } = splitSections(text);
  const find = (name) => sections.find((s) => s.name === name || s.name.startsWith(name)) || { lines: [] };
  const facts = find("Key Facts").lines;
  const recordSection = find("Learning Record").lines;
  const records = parseRecords(recordSection).map((r) => {
    const date = (r.heading.match(/(\d{4}-\d{2}-\d{2})(?:-(\d+))?/) || ["", "", ""]);
    return { ...r, date: date[1] || "", seq: date[2] || "" };
  });
  const week = keyFact(facts, "当前周");
  const position = keyFact(facts, "当前位置") || keyFact(facts, "阅读位置");
  const nextSession = (find("Next Session").lines.find((l) => l.trim()) || "").trim();
  return {
    file,
    slug: basename(file, ".md"),
    title: title || basename(file, ".md"),
    sections,
    week,
    position,
    nextSession,
    weekCount: countTasks(find("This Week").lines),
    todayCount: countTasks(find("Today").lines),
    overallCount: countTasks(find("Overall Goals").lines),
    today: keyFact(find("Today").lines, "日期"),
    records,
    lastRecord: records.length ? records[records.length - 1] : null,
  };
}

/* ---------- HTML 片段 ---------- */

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(raw) {
  const codes = [];
  let s = String(raw).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, path, label) =>
    `<span class="wl">${esc(label || path)}</span>`);
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_, text, url) =>
    `<a href="${esc(url)}" target="_blank" rel="noreferrer">${text}</a>`);
  s = s.replace(/(^|[\s（(—:：])(https?:[^\s<>"'）)，。；]*[^\s<>"'）)，。；])/g, (_, pre, url) =>
    `${pre}<a href="${esc(url)}" target="_blank" rel="noreferrer">${url}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
  return s;
}

function renderTable(lines, i) {
  const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const head = cells(lines[i]);
  i += 2;
  const rows = [];
  while (i < lines.length && /^\|/.test(lines[i])) {
    rows.push(cells(lines[i]));
    i++;
  }
  const html =
    `<div class="tw"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead>` +
    `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  return { html, next: i };
}

function listTree(items) {
  const root = { indent: -1, children: [] };
  const stack = [root];
  for (const item of items) {
    while (stack.length > 1 && stack[stack.length - 1].indent >= item.indent) stack.pop();
    const node = { ...item, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root.children;
}

function renderTree(nodes) {
  if (!nodes.length) return "";
  const tag = nodes[0].ordered ? "ol" : "ul";
  const body = nodes.map((n) => {
    if (n.checked === null) return `<li>${inline(n.text)}${renderTree(n.children)}</li>`;
    const box = `<span class="box${n.checked ? " on" : ""}">${n.checked ? "✓" : ""}</span>`;
    return `<li class="task${n.checked ? " done" : ""}">${box}<span class="t">${inline(n.text)}</span>${renderTree(n.children)}</li>`;
  }).join("");
  return `<${tag}>${body}</${tag}>`;
}

function renderList(lines, i) {
  const items = [];
  while (i < lines.length) {
    const m = lines[i].match(LIST_RE);
    if (!m) break;
    const indent = m[1].replace(/\t/g, "  ").length;
    let text = m[3];
    let checked = null;
    const cb = text.match(/^\[([ xX])\]\s+(.*)$/);
    if (cb) {
      checked = cb[1] !== " ";
      text = cb[2];
    }
    items.push({ indent, ordered: /\d/.test(m[2]), checked, text });
    i++;
  }
  return { html: renderTree(listTree(items)), next: i };
}

function renderBlocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre>${esc(buf.join("\n"))}</pre>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      out.push(`<blockquote>${renderBlocks(buf)}</blockquote>`);
      continue;
    }
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const t = renderTable(lines, i);
      out.push(t.html);
      i = t.next;
      continue;
    }
    if (LIST_RE.test(line)) {
      const l = renderList(lines, i);
      out.push(l.html);
      i = l.next;
      continue;
    }
    if (/^###\s+/.test(line)) {
      out.push(`<h3>${inline(line.replace(/^###\s+/, ""))}</h3>`);
      i++;
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !LIST_RE.test(lines[i]) &&
      !/^(#{1,6}\s|\||>|\s*```)/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return out.join("\n");
}

function bar(done, total, label) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div class="metric"><div class="mtop"><span>${esc(label)}</span><b>${done}/${total}</b></div>` +
    `<div class="bar"><span style="width:${pct}%"></span></div></div>`;
}

/* ---------- 页面 ---------- */

function renderCourse(c, rank) {
  const find = (name) => c.sections.find((s) => s.name === name || s.name.startsWith(name));
  const week = find("This Week");
  const today = find("Today");
  const overall = find("Overall Goals");
  const plan = find("计划表");
  const record = find("Learning Record");
  const shown = new Set(["Overall Goals", "This Week", "Today", "Next Session", "计划表", "Learning Record"]);
  const extra = c.sections.filter((s) => !shown.has(s.name) && !s.name.startsWith("计划表"));

  const records = [...c.records].reverse();
  const recordHtml = records.length
    ? records.map((r, idx) => `<details class="rec"${idx === 0 ? " open" : ""}><summary>` +
        `<span class="rdate">${esc(r.heading)}</span></summary>${renderBlocks(r.lines)}</details>`).join("")
    : `<p class="muted">尚无记录。收课后会在这里追加作答证据。</p>`;

  const extraHtml = extra.length
    ? `<details class="more"><summary>课程信息与材料（${extra.length} 段）</summary>` +
      extra.map((s) => `<section class="sub"><h3>${inline(s.name)}</h3>${renderBlocks(s.lines)}</section>`).join("") +
      `</details>`
    : "";

  return `<article class="course" id="course-${esc(c.slug)}">
  <header class="chead">
    <div>
      <h2>${esc(c.title)}</h2>
      <div class="meta">
        ${c.week ? `<span class="chip">${esc(c.week)}</span>` : ""}
        ${c.lastRecord && c.lastRecord.date ? `<span class="muted">上次记录 ${esc(c.lastRecord.date)}</span>` : ""}
        <span class="muted">状态源 <code>wiki/courses/${esc(c.slug)}.md</code></span>
      </div>
    </div>
    <div class="cmetrics">
      ${bar(c.weekCount.done, c.weekCount.total, "本周")}
      ${bar(c.overallCount.done, c.overallCount.total, "总目标")}
    </div>
  </header>

  <div class="next"><div class="nlabel">下次起点</div><div>${inline(c.nextSession || "未设定")}</div></div>

  <div class="cols">
    <section class="panel">
      <h3>本周计划 ${week ? `<span class="count">${c.weekCount.done}/${c.weekCount.total}</span>` : ""}</h3>
      ${week ? renderBlocks(week.lines) : `<p class="muted">未设定</p>`}
    </section>
    <section class="panel">
      <h3>今日 ${c.today ? `<span class="muted small">${esc(c.today)}</span>` : ""} <span class="count">${c.todayCount.done}/${c.todayCount.total}</span></h3>
      ${today ? renderBlocks(today.lines) : `<p class="muted">未设定</p>`}
    </section>
  </div>

  <section class="panel">
    <h3>总目标里程碑 <span class="count">${c.overallCount.done}/${c.overallCount.total}</span></h3>
    ${overall ? renderBlocks(overall.lines) : `<p class="muted">未设定</p>`}
  </section>

  <section class="panel">
    <h3>完整计划</h3>
    ${plan ? renderBlocks(plan.lines) : `<p class="muted">未设定</p>`}
  </section>

  <section class="panel">
    <h3>学习记录</h3>
    ${recordHtml}
  </section>

  ${extraHtml}
</article>`;
}

function verifyStatus(coursesDir, dash) {
  const script = join(here, "course-state.mjs");
  if (!existsSync(script) || !existsSync(dash)) return { ok: null, text: "未生成 Markdown 看板" };
  const lines = (s) => String(s).split("\n").map((l) => l.trim()).filter(Boolean);
  try {
    const out = execFileSync(process.execPath, [script, "verify", coursesDir, dash], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const l = lines(out);
    return { ok: true, text: l.length ? l[l.length - 1] : "" };
  } catch (err) {
    const failed = lines(err.stderr || err.stdout || "");
    if (!failed.length) return { ok: false, text: "校验失败" };
    const extra = failed.length > 1 ? `（另有 ${failed.length - 1} 项）` : "";
    return { ok: false, text: failed[0] + extra };
  }
}

function main() {
  const files = readdirSync(coursesDir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("."))
    .sort();
  const courses = [];
  const skipped = [];
  for (const file of files) {
    const text = readFileSync(join(coursesDir, file), "utf8");
    if (!text.includes(MARKER)) { skipped.push(file); continue; }
    courses.push(parseCourse(text, file));
  }
  if (!courses.length) {
    console.error(`未找到课程状态文件（需要 ${MARKER} 标记）：${coursesDir}`);
    process.exit(1);
  }

  const dash = join(dirname(coursesDir), "courses.md");
  const verify = verifyStatus(coursesDir, dash);
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const sum = (k, f) => courses.reduce((a, c) => a + c[k][f], 0);
  const badge = verify.ok === true
    ? `<span class="ok">校验通过</span>`
    : verify.ok === false
      ? `<span class="bad">校验异常</span>`
      : `<span class="warn">未校验</span>`;

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>学根 · 课程看板</title>
<style>
:root{--bg:#faf9f7;--fg:#1d1d1b;--muted:#6b6b66;--line:#e4e1dc;--card:#fff;--accent:#2f6f4f;--accent-soft:#eef4ef;--warn:#8a5a2b;--bad:#a33}
@media (prefers-color-scheme:dark){:root{--bg:#141513;--fg:#e8e6e1;--muted:#9a9a94;--line:#2e302c;--card:#1b1d1a;--accent:#7cc59a;--accent-soft:#20302a;--warn:#d2a06a;--bad:#e08a8a}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:32px 20px 72px}
header.top{display:flex;flex-wrap:wrap;align-items:baseline;gap:12px;margin-bottom:6px}
h1{font-size:24px;margin:0;letter-spacing:.01em}
.sub{color:var(--muted);font-size:13px}
.summary{display:flex;flex-wrap:wrap;gap:20px;margin:18px 0 28px;padding:14px 18px;background:var(--card);border:1px solid var(--line);border-radius:12px}
.summary div{display:flex;flex-direction:column}
.summary b{font-size:18px}
.summary span{color:var(--muted);font-size:12px}
.course{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px 24px;margin-bottom:26px}
.chead{display:flex;flex-wrap:wrap;gap:18px;justify-content:space-between;align-items:flex-start}
.chead h2{font-size:19px;margin:0 0 8px}
.meta{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;font-size:13px;color:var(--muted)}
.chip{background:var(--accent-soft);color:var(--accent);border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);padding:2px 10px;border-radius:999px;font-size:12.5px}
.cmetrics{display:flex;gap:22px;min-width:300px;flex:1;max-width:420px}
.metric{flex:1}
.mtop{display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted);margin-bottom:5px}
.mtop b{color:var(--fg);font-variant-numeric:tabular-nums}
.bar{height:6px;border-radius:6px;background:color-mix(in srgb,var(--fg) 10%,transparent);overflow:hidden}
.bar>span{display:block;height:100%;background:var(--accent);border-radius:6px}
.next{margin:18px 0 20px;padding:12px 16px;border-left:3px solid var(--accent);background:var(--accent-soft);border-radius:0 8px 8px 0}
.nlabel{font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin-bottom:2px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width:760px){.cols{grid-template-columns:1fr}}
.panel{border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin-bottom:16px;background:color-mix(in srgb,var(--card) 92%,var(--bg))}
.panel h3{margin:0 0 10px;font-size:14px;letter-spacing:.02em}
.count{float:right;font-weight:500;color:var(--muted);font-variant-numeric:tabular-nums}
.muted{color:var(--muted)}
.small{font-size:12px;font-weight:400}
ul,ol{margin:6px 0;padding-left:20px}
li{margin:3px 0}
li.task{list-style:none;margin-left:-18px;display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px}
li.task>.t{flex:1;min-width:0}
li.task>ul,li.task>ol{flex-basis:100%;margin-left:2px}
li.task.done>.t{color:var(--muted)}
.box{flex:0 0 16px;width:16px;height:16px;margin-top:3px;border:1.5px solid color-mix(in srgb,var(--fg) 30%,transparent);border-radius:4px;font-size:11px;line-height:14px;text-align:center;color:transparent}
.box.on{background:var(--accent);border-color:var(--accent);color:#fff}
pre{background:color-mix(in srgb,var(--fg) 5%,transparent);padding:12px;border-radius:8px;overflow:auto;font-size:12.5px;line-height:1.45}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;background:color-mix(in srgb,var(--fg) 7%,transparent);padding:1px 5px;border-radius:4px}
pre code{background:none;padding:0}
a{color:var(--accent);text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--accent) 35%,transparent)}
a:hover{border-bottom-color:var(--accent)}
blockquote{margin:10px 0;padding:8px 14px;border-left:2px solid var(--line);color:var(--muted)}
.tw{overflow-x:auto;margin:10px 0}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:color-mix(in srgb,var(--fg) 4%,transparent);font-weight:600}
.wl{color:var(--muted);font-size:.92em}
.rec{border-top:1px dashed var(--line);padding:8px 0}
.rec summary{cursor:default;list-style:none}
.rec summary::-webkit-details-marker{display:none}
.rdate{font-weight:600;font-size:13.5px}
.more{margin-top:6px;border:1px solid var(--line);border-radius:10px;padding:10px 16px;background:color-mix(in srgb,var(--card) 92%,var(--bg))}
.more>summary{font-size:13.5px;color:var(--muted);cursor:pointer}
.sub h3{font-size:13.5px;margin:14px 0 6px}
footer{margin-top:34px;color:var(--muted);font-size:12.5px;line-height:1.7;border-top:1px solid var(--line);padding-top:16px}
.ok{color:var(--accent)}.bad{color:var(--bad)}.warn{color:var(--warn)}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <h1>学根 · 课程看板</h1>
    <span class="sub">生成于 ${esc(stamp)}</span>
  </header>
  <div class="sub">标准计划输出：当前周 → 本周 → 今日 → 总目标 → 完整计划 → 学习记录。${badge} ${esc(verify.text)}</div>

  <div class="summary">
    <div><b>${courses.length}</b><span>门课程</span></div>
    <div><b>${sum("weekCount", "done")}/${sum("weekCount", "total")}</b><span>本周已核实计划项</span></div>
    <div><b>${sum("overallCount", "done")}/${sum("overallCount", "total")}</b><span>总目标里程碑</span></div>
    <div><b>${courses.filter((c) => c.lastRecord).length}</b><span>有学习记录</span></div>
  </div>

  ${courses.map((c, i) => renderCourse(c, i)).join("\n")}

  <footer>
    <p>本页是只读视图：没有表单、按钮或任何编辑入口，也不能在这里改计划或打勾。状态只存在于 <code>wiki/courses/*.md</code>（只读锁 0444，目录 0555），由学习会话在明确收课请求后解锁写入、再重新上锁。</p>
    <p>数字是「已核实的计划项」，不是掌握率；“用户自报，未检查”表示完成依据来自你的陈述而非当场核对。</p>
    <p>重新生成：<code>node render-board.mjs wiki/courses wiki/courses.html</code>${skipped.length ? `　已跳过无标记文件：${esc(skipped.join("、"))}` : ""}</p>
  </footer>
</div>
</body>
</html>
`;

  try {
    if (existsSync(outFile)) chmodSync(outFile, 0o644);
  } catch {}
  writeFileSync(outFile, html);
  chmodSync(outFile, 0o444);

  console.log(JSON.stringify({
    path: outFile,
    courses: courses.map((c) => ({
      slug: c.slug,
      week: c.week,
      weekCount: c.weekCount,
      overall: c.overallCount,
    })),
    verify: verify.ok,
    bytes: statSync(outFile).size,
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(`render-board: ${err.message}`);
  process.exit(1);
}
