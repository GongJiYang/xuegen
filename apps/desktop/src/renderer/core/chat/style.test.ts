import { describe, expect, it } from "vitest";
import { courseStylesOf, emptySessionStyles, resolveStyle, withStyleChoice } from "./style.js";

const TODAY = "2026-11-08";
const TOMORROW = "2026-11-09";

describe("resolveStyle", () => {
  it("is 「默认」 when nothing was picked", () => {
    const styles = emptySessionStyles(TODAY);
    expect(resolveStyle(styles, TODAY, "ctm")).toBe("default");
    expect(resolveStyle(styles, TODAY, null)).toBe("default");
  });

  it("keeps course and free-chat picks apart on the same day", () => {
    let styles = emptySessionStyles(TODAY);
    styles = withStyleChoice(styles, TODAY, "ctm", "deep");
    styles = withStyleChoice(styles, TODAY, null, "plain");
    expect(resolveStyle(styles, TODAY, "ctm")).toBe("deep");
    expect(resolveStyle(styles, TODAY, "other")).toBe("default");
    expect(resolveStyle(styles, TODAY, null)).toBe("plain");
  });

  it("forgets every pick once the day turns over", () => {
    let styles = emptySessionStyles(TODAY);
    styles = withStyleChoice(styles, TODAY, "ctm", "deep");
    styles = withStyleChoice(styles, TODAY, null, "plain");
    expect(resolveStyle(styles, TOMORROW, "ctm")).toBe("default");
    expect(resolveStyle(styles, TOMORROW, null)).toBe("default");
  });
});

describe("withStyleChoice", () => {
  it("accumulates picks made on the same day", () => {
    let styles = emptySessionStyles(TODAY);
    styles = withStyleChoice(styles, TODAY, "ctm", "deep");
    styles = withStyleChoice(styles, TODAY, "algebra", "detailed");
    expect(styles.byCourse).toEqual({ ctm: "deep", algebra: "detailed" });
  });

  it("drops yesterday's picks instead of merging them", () => {
    let styles = emptySessionStyles(TODAY);
    styles = withStyleChoice(styles, TODAY, "ctm", "deep");
    styles = withStyleChoice(styles, TOMORROW, "algebra", "plain");
    expect(styles.date).toBe(TOMORROW);
    expect(styles.byCourse).toEqual({ algebra: "plain" });
    expect(styles.free).toBe("default");
  });
});

describe("courseStylesOf", () => {
  it("returns today's picks and empties out after midnight", () => {
    const styles = withStyleChoice(emptySessionStyles(TODAY), TODAY, "ctm", "deep");
    expect(courseStylesOf(styles, TODAY)).toEqual({ ctm: "deep" });
    expect(courseStylesOf(styles, TOMORROW)).toEqual({});
  });
});
