/**
 * 「讲解偏好」的视图模型：按科目分组、每行一个 key，删一行时只禁用那一行。
 */

import { describe, expect, it } from "vitest";
import type { SubjectPrefs } from "@shared/data-protocol.js";
import { prefsView } from "./prefs-view.js";

const DISCRETE: SubjectPrefs = {
  subject: "discrete-math",
  title: "离散数学",
  lines: [
    { text: "先用例子再定义", style: false },
    { text: "板书只写关键词", style: true },
  ],
};

const CTM: SubjectPrefs = { subject: "ctm", title: "CTM", lines: [{ text: "多画图", style: false }] };

describe("prefsView", () => {
  it("正在读 when the list has not loaded", () => {
    const view = prefsView(null, null, {});
    expect(view.status).toBe("正在读…");
    expect(view.groups).toEqual([]);
    expect(view.empty).toBe(false);
  });

  it("空列表或所有科目都没有行时是空", () => {
    const blank: SubjectPrefs = { subject: "ctm", title: "CTM", lines: [] };
    for (const list of [[], [blank]]) {
      const view = prefsView(list, null, {});
      expect(view.status).toBeNull();
      expect(view.empty).toBe(true);
      expect(view.emptyText).toBe(
        "还没有记下的偏好。课上说「以后讲 … 都 …」时会记在这里。",
      );
    }
  });

  it("按传入顺序分组，只保留有行的科目，key 用科目 slug", () => {
    const view = prefsView([DISCRETE, { ...CTM, lines: [] }, CTM], null, {});
    expect(view.status).toBeNull();
    expect(view.empty).toBe(false);
    expect(view.groups.map((group) => group.subject)).toEqual(["discrete-math", "ctm"]);
    expect(view.groups[0]?.title).toBe("离散数学");
    expect(view.groups[0]?.lines).toEqual([
      { key: "discrete-math\n先用例子再定义", text: "先用例子再定义", style: false, removing: false },
      { key: "discrete-math\n板书只写关键词", text: "板书只写关键词", style: true, removing: false },
    ]);
    expect(view.groups[1]?.lines[0]?.key).toBe("ctm\n多画图");
  });

  it("只禁用 pendingKey 那行", () => {
    const view = prefsView([DISCRETE], "discrete-math\n板书只写关键词", {});
    expect(view.groups[0]?.lines.map((line) => line.removing)).toEqual([false, true]);
  });

  it("style 为 true 的行原样保留文字和标记", () => {
    const view = prefsView([DISCRETE], null, {});
    expect(view.groups[0]?.lines[1]).toEqual({
      key: "discrete-math\n板书只写关键词",
      text: "板书只写关键词",
      style: true,
      removing: false,
    });
  });

  it("错误只落在对应科目上", () => {
    const view = prefsView([DISCRETE, CTM], null, { "discrete-math": "这条偏好已经不在了" });
    expect(view.groups[0]?.error).toBe("没删掉：这条偏好已经不在了");
    expect(view.groups[1]?.error).toBeNull();
  });

  it("读取失败时状态行写失败原因", () => {
    const view = prefsView(null, null, {}, "库打不开");
    expect(view.status).toBe("读不到偏好：库打不开");
  });
});
