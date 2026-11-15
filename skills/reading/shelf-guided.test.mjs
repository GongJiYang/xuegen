#!/usr/bin/env node
// shelf-guided.mjs 的测试：node:test + node:assert，无第三方依赖。
// 日期语义：2026-11-15 是周日，11-16 周一、11-17 周二、11-18 周三、11-19 周四。
import { test } from "node:test";
import assert from "node:assert/strict";
import { guidedEnd, guidedSchedule, nextGuidedDay, parseDays } from "./shelf-guided.mjs";

const SEGMENTS = [
  { title: "§1.1–1.2 概览", from: 4, to: 73 },
  { title: "§1.3 背包、队列和栈", from: 74, to: 107 },
  { title: "§1.4 算法分析", from: 108, to: 135 },
  { title: "§1.5 union-find", from: 136, to: 151 },
];

const args = (overrides = {}) => ({
  segments: SEGMENTS,
  position: 0,
  started: "2026-11-15",
  days: parseDays("tue,thu"),
  today: "2026-11-15",
  readDates: new Map(),
  ...overrides,
});

test("parseDays：mon,wed → [1,3]，0 是周日；去重保序", () => {
  assert.deepEqual(parseDays("mon,wed"), [1, 3]);
  assert.deepEqual(parseDays("sun"), [0]);
  assert.deepEqual(parseDays("tue,thu"), [2, 4]);
  assert.deepEqual(parseDays(" sat,sun ,mon"), [6, 0, 1]);
  assert.deepEqual(parseDays("mon,mon,wed"), [1, 3]);
});

test("parseDays：空串与不认识的值报错", () => {
  assert.throws(() => parseDays(""), /days 为空/);
  assert.throws(() => parseDays("   "), /days 为空/);
  assert.throws(() => parseDays("monday"), /「monday」不认识/);
  assert.throws(() => parseDays("mon,foo"), /「foo」不认识/);
});

test("nextGuidedDay：今天就是导读日返回今天，否则找下一个", () => {
  const days = parseDays("tue,thu");
  assert.equal(nextGuidedDay(days, "2026-11-17"), "2026-11-17"); // 周二
  assert.equal(nextGuidedDay(days, "2026-11-15"), "2026-11-17"); // 周日 → 周二
  assert.equal(nextGuidedDay(days, "2026-11-20"), "2026-11-24"); // 周五 → 下周二
  assert.equal(nextGuidedDay(parseDays("sun"), "2026-11-16"), "2026-11-22"); // 只有周日
});

test("guidedSchedule：周一三的书 11-15（周日）起，第一段排 11-16", () => {
  const rows = guidedSchedule(args({ days: parseDays("mon,wed") }));
  assert.deepEqual(
    rows.map((row) => [row.index, row.date, row.done]),
    [
      [1, "2026-11-16", false],
      [2, "2026-11-18", false],
      [3, "2026-11-23", false],
      [4, "2026-11-25", false],
    ],
  );
  assert.equal(rows[0].title, "§1.1–1.2 概览");
  assert.deepEqual([rows[0].from, rows[0].to], [4, 73]);
});

test("guidedSchedule：今天周一没读，今天那段还是今天，后面依次周三、周一", () => {
  const rows = guidedSchedule(args({ days: parseDays("mon,wed"), today: "2026-11-16" }));
  assert.deepEqual(
    rows.map((row) => row.date),
    ["2026-11-16", "2026-11-18", "2026-11-23", "2026-11-25"],
  );
});

test("guidedSchedule：已读段的日子取读书记录；没记录的按 started 顺推", () => {
  const rows = guidedSchedule(
    args({
      position: 2,
      readDates: new Map([
        [1, "2026-11-17"],
        [2, "2026-11-19"],
      ]),
      today: "2026-11-20",
    }),
  );
  assert.deepEqual(
    rows.map((row) => [row.index, row.date, row.done]),
    [
      [1, "2026-11-17", true],
      [2, "2026-11-19", true],
      [3, "2026-11-24", false],
      [4, "2026-11-26", false],
    ],
  );
  // 第 2 段没记录：名义日期 = 从 started（11-15 周日）起的第 2 个导读日 = 11-19
  const noRecord = guidedSchedule(args({ position: 2, today: "2026-11-20" }));
  assert.equal(noRecord[1].date, "2026-11-19");
});

test("guidedSchedule：started 比今天晚时，未读段从 started 后的导读日起", () => {
  const rows = guidedSchedule(args({ started: "2026-11-25", today: "2026-11-15" }));
  assert.equal(rows[0].date, "2026-11-26"); // 11-25 周三不是导读日 → 11-26 周四
});

test("guidedSchedule：全部读完的行都 done，日期取读书记录", () => {
  const rows = guidedSchedule(
    args({
      position: 4,
      readDates: new Map([
        [1, "2026-11-17"],
        [2, "2026-11-19"],
        [3, "2026-11-24"],
        [4, "2026-11-26"],
      ]),
      today: "2026-11-27",
    }),
  );
  assert.equal(rows.every((row) => row.done), true);
  assert.equal(rows[3].date, "2026-11-26");
});

test("guidedEnd：最后一段的日期；没有分段为 null", () => {
  assert.equal(guidedEnd(args()), "2026-11-26");
  assert.equal(guidedEnd(args({ today: "2026-11-17" })), "2026-11-26");
  assert.equal(guidedEnd(args({ segments: [] })), null);
});
