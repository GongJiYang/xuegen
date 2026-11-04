// @vitest-environment node
// Runs in the Node environment (not jsdom): skills.ts loads environment.ts,
// which calls fileURLToPath at import time — unavailable under jsdom.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discardSkill, fetchSkill, listSkills, promotePendingSkill, reviewSkill } from "./skills.js";

/** Write a minimal valid SKILL.md into `<dir>/<name>/SKILL.md`. */
function writeSkill(dir: string, name: string, description = "示例技能。"): void {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`, "utf8");
}

describe("skills inventory", () => {
  let home: string;
  const originalHome = process.env.XUEGEN_HOME;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "xuegen-skills-"));
    process.env.XUEGEN_HOME = home;
  });

  afterEach(() => {
    process.env.XUEGEN_HOME = originalHome;
    rmSync(home, { recursive: true, force: true });
  });

  it("lists builtin skills and marks disabled ones", () => {
    const skills = listSkills(["reading"]);
    const names = skills.map((skill) => skill.name);
    expect(names).toContain("calendar");
    expect(skills.every((skill) => skill.source === "builtin")).toBe(true);
    expect(skills.find((skill) => skill.name === "reading")?.enabled).toBe(false);
    expect(skills.find((skill) => skill.name === "teach")?.enabled).toBe(true);
  });

  it("includes personal skills and reports them as enabled unless disabled", () => {
    writeSkill(join(home, "skills"), "my-skill", "个人技能。");
    const skills = listSkills([]);
    const mine = skills.find((skill) => skill.name === "my-skill");
    expect(mine?.source).toBe("personal");
    expect(mine?.enabled).toBe(true);
    expect(mine?.description).toBe("个人技能。");
  });

  it("shows pending skills as disabled", () => {
    writeSkill(join(home, "skills-pending"), "remote-skill");
    const pending = listSkills([]).find((skill) => skill.name === "remote-skill");
    expect(pending?.source).toBe("pending");
    expect(pending?.enabled).toBe(false);
  });

  it("promotePendingSkill moves a pending skill into personal skills", () => {
    writeSkill(join(home, "skills-pending"), "remote-skill");
    promotePendingSkill("remote-skill");
    const skills = listSkills([]);
    const promoted = skills.find((skill) => skill.name === "remote-skill");
    expect(promoted?.source).toBe("personal");
    expect(promoted?.enabled).toBe(true);
  });

  it("promotePendingSkill accepts an already-installed skill", () => {
    expect(() => promotePendingSkill("teach")).not.toThrow();
  });

  it("promotePendingSkill reports a skill that exists nowhere instead of doing nothing", () => {
    expect(() => promotePendingSkill("does-not-exist")).toThrow(/找不到技能/);
  });

  it("reviewSkill shows provenance, files, and flags executable scripts", () => {
    const dir = join(home, "skills-pending", "remote-skill");
    writeSkill(join(home, "skills-pending"), "remote-skill", "远程技能。");
    mkdirSync(join(dir, "scripts"), { recursive: true });
    writeFileSync(join(dir, "scripts", "run.mjs"), "console.log(1)\n", "utf8");
    writeFileSync(
      join(dir, ".xuegen-source.json"),
      JSON.stringify({ url: "https://example.com/r", commit: "abc123", subdir: "skills/remote-skill" }),
      "utf8",
    );
    const review = reviewSkill("remote-skill");
    expect(review.url).toBe("https://example.com/r");
    expect(review.commit).toBe("abc123");
    expect(review.subdir).toBe("skills/remote-skill");
    expect(review.skillMd).toContain("name: remote-skill");
    expect(review.files.map((file) => file.path)).toEqual(["SKILL.md", "scripts/run.mjs"]);
    expect(review.files.find((file) => file.path === "scripts/run.mjs")?.executable).toBe(true);
    expect(Array.isArray(review.lint.errors)).toBe(true);
  });

  it("reviewSkill and discardSkill reject names that are not plain skill names", () => {
    expect(() => reviewSkill("../skills")).toThrow(/技能名不合法/);
    expect(() => discardSkill("../../x")).toThrow(/技能名不合法/);
  });

  it("discardSkill removes a pending skill", () => {
    writeSkill(join(home, "skills-pending"), "remote-skill");
    discardSkill("remote-skill");
    expect(listSkills([]).some((skill) => skill.name === "remote-skill")).toBe(false);
  });

  it("reads a multi-line (block scalar) description", () => {
    const dir = join(home, "skills-pending", "block-skill");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "SKILL.md"),
      "---\nname: block-skill\ndescription: |\n  第一行说明。\n  第二行说明。\n---\n\n# x\n",
      "utf8",
    );
    const skill = listSkills([]).find((entry) => entry.name === "block-skill");
    expect(skill?.description).toBe("第一行说明。\n第二行说明。");
  });

  it("fetchSkill refuses anything but an https URL", async () => {
    await expect(fetchSkill("git@github.com:a/b.git")).rejects.toThrow(/https/);
    await expect(fetchSkill("--upload-pack=evil")).rejects.toThrow(/https/);
  });
});
