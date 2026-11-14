import { describe, expect, it } from "vitest";
import type { SubjectInfo, SubjectsOverview } from "@shared/data-protocol.js";
import type { AsyncState } from "./state.js";
import { defaultStyleLabel } from "./default-style.js";

function subject(partial: Partial<SubjectInfo> & { slug: string }): SubjectInfo {
  return {
    title: partial.slug,
    layer: "",
    route: "",
    main: false,
    courses: [],
    materials: [],
    defaultStyle: null,
    ...partial,
  };
}

function ready(subjects: SubjectInfo[]): AsyncState<SubjectsOverview> {
  return { status: "ready", value: { date: "2026-11-08", cycle: null, subjects } };
}

describe("defaultStyleLabel", () => {
  it("is 「默认」 with no active course", () => {
    expect(
      defaultStyleLabel(ready([subject({ slug: "dm", courses: ["epp"], defaultStyle: "detailed" })]), null),
    ).toBe("默认");
  });

  it("names the subject's default style for an active course", () => {
    const subjects = ready([subject({ slug: "dm", courses: ["epp"], defaultStyle: "detailed" })]);
    expect(defaultStyleLabel(subjects, "epp")).toBe("默认 · 细讲");
  });

  it("is 「默认」 when the subject names no default", () => {
    const subjects = ready([subject({ slug: "dm", courses: ["epp"] })]);
    expect(defaultStyleLabel(subjects, "epp")).toBe("默认");
  });

  it("is 「默认」 while the subjects are still loading or the course is unknown", () => {
    expect(defaultStyleLabel({ status: "loading" }, "epp")).toBe("默认");
    expect(defaultStyleLabel(ready([]), "epp")).toBe("默认");
  });
});
