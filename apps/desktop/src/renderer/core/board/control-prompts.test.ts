import { describe, expect, it } from "vitest";
import { strings } from "../strings.js";
import { splitActionMarker } from "../chat/action-marker.js";
import {
  addBookPrompt,
  changeModePrompt,
  pausePrompt,
  resumePrompt,
  setTargetPrompt,
} from "./control-prompts.js";

const EPP = { slug: "epp", short: "Epp" };

describe("总控书房按钮发给总控的话", () => {
  it("加书：按 reading 技能排进书房，读法是自读", () => {
    const marked = splitActionMarker(
      addBookPrompt({
        title: "Discrete Mathematics",
        slug: "epp",
        subject: "",
        mode: "self",
        days: [],
        target: "2027-01-15",
      }),
    );
    expect(marked.action).toBe("ask");
    expect(marked.courseTitle).toBe("Discrete Mathematics");
    expect(marked.body).toContain("/skill:reading");
    expect(marked.body).toContain("2027-01-15");
    expect(marked.body).toContain(strings.panel.askConfirm);
  });

  it("加书：带读排到指定的星期几，并提醒同一天只排一本", () => {
    const marked = splitActionMarker(
      addBookPrompt({
        title: "SICP",
        slug: "sicp",
        subject: "programming-paradigms",
        mode: "guide",
        days: ["周一", "周三"],
        target: null,
      }),
    );
    expect(marked.action).toBe("ask");
    expect(marked.body).toContain("/skill:course");
    expect(marked.body).toContain("周一、周三");
    expect(marked.body).toContain("同一天只排一本");
    expect(marked.body).toContain(strings.panel.askConfirm);
  });

  it("改读法：先问换成哪种读法，再按技能改", () => {
    const marked = splitActionMarker(changeModePrompt(EPP));
    expect(marked.action).toBe("ask");
    expect(marked.courseTitle).toBe("Epp");
    expect(marked.body).toContain("讲后读");
    expect(marked.body).toContain("带读");
    expect(marked.body).toContain("自读");
    expect(marked.body).toContain(strings.panel.askConfirm);
  });

  it("设目标：用 bookshelf.mjs target 设 / 清目标日期", () => {
    const set = splitActionMarker(setTargetPrompt(EPP, "2027-01-15"));
    expect(set.action).toBe("ask");
    expect(set.body).toContain("bookshelf.mjs target");
    expect(set.body).toContain("--date 2027-01-15");
    expect(set.body).toContain(strings.panel.askConfirm);
    const cleared = splitActionMarker(setTargetPrompt(EPP, null));
    expect(cleared.body).toContain("--clear");
  });

  it("暂停 / 恢复：用 bookshelf.mjs pause / resume，带读的书按 course 技能停 / 接着排", () => {
    const paused = splitActionMarker(pausePrompt(EPP));
    expect(paused.action).toBe("ask");
    expect(paused.courseTitle).toBe("Epp");
    expect(paused.body).toContain("bookshelf.mjs pause");
    expect(paused.body).toContain("带读");
    expect(paused.body).toContain("/skill:course");
    expect(paused.body).toContain(strings.panel.askConfirm);
    const resumed = splitActionMarker(resumePrompt(EPP));
    expect(resumed.action).toBe("ask");
    expect(resumed.body).toContain("bookshelf.mjs resume");
    expect(resumed.body).toContain(strings.panel.askConfirm);
  });
});
