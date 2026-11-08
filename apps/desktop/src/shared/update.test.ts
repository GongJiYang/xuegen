import { describe, expect, it } from "vitest";
import { compareVersions, notesUrl, pickRelease, releaseFromTagUrl, releaseNotes, versionFromTagUrl } from "./update.js";

const ASSET = "https://github.com/GongJiYang/xuegen/releases/download/v0.3.0/xuegen-0.3.0-arm64-mac.zip";
const RELEASE = {
  tag_name: "v0.3.0",
  draft: false,
  prerelease: false,
  body: "## 学根 v0.3.0\n\n- 总进度第四版\n- 对话左侧钉板\n* 每天一个主项 + 一个辅助\n\n说明文字",
  assets: [
    { name: "xuegen-0.3.0-x64-mac.zip", browser_download_url: ASSET.replace("arm64", "x64"), size: 1 },
    { name: "xuegen-0.3.0-arm64-mac.zip", browser_download_url: ASSET, size: 150 },
  ],
};

describe("update helpers", () => {
  it("compareVersions is numeric and ignores a leading v", () => {
    expect(compareVersions("0.10.0", "0.9.1")).toBeGreaterThan(0);
    expect(compareVersions("v0.3.0", "0.3.0")).toBe(0);
    expect(compareVersions("0.2.9", "0.3")).toBeLessThan(0);
  });
  it("releaseNotes keeps list lines only", () => {
    expect(releaseNotes(RELEASE.body)).toEqual(["总进度第四版", "对话左侧钉板", "每天一个主项 + 一个辅助"]);
  });
  it("pickRelease returns the newer release's asset for the arch", () => {
    expect(pickRelease(RELEASE, "0.2.0", "arm64")).toEqual({
      version: "0.3.0",
      notes: ["总进度第四版", "对话左侧钉板", "每天一个主项 + 一个辅助"],
      assetUrl: ASSET,
      size: 150,
    });
  });
  it("pickRelease ignores same/older versions, drafts, other repos and missing assets", () => {
    expect(pickRelease(RELEASE, "0.3.0", "arm64")).toBeNull();
    expect(pickRelease({ ...RELEASE, draft: true }, "0.2.0", "arm64")).toBeNull();
    expect(pickRelease({ ...RELEASE, tag_name: "nightly" }, "0.2.0", "arm64")).toBeNull();
    expect(
      pickRelease({ ...RELEASE, assets: [{ name: "xuegen-0.3.0-arm64-mac.zip", browser_download_url: "https://evil.example/x.zip", size: 1 }] }, "0.2.0", "arm64"),
    ).toBeNull();
    expect(pickRelease({ ...RELEASE, assets: [] }, "0.2.0", "arm64")).toBeNull();
    expect(pickRelease(null, "0.2.0", "arm64")).toBeNull();
  });
  it("versionFromTagUrl reads the version from this repo's tag URL only", () => {
    expect(versionFromTagUrl("https://github.com/GongJiYang/xuegen/releases/tag/v0.4.0")).toBe("0.4.0");
    expect(versionFromTagUrl("https://github.com/GongJiYang/xuegen/releases/tag/v0.4.0/")).toBe("0.4.0");
    expect(versionFromTagUrl("https://github.com/GongJiYang/xuegen/releases")).toBeNull();
    expect(versionFromTagUrl("https://github.com/other/repo/releases/tag/v0.4.0")).toBeNull();
    expect(versionFromTagUrl("https://github.com/GongJiYang/xuegen/releases/tag/v0.4")).toBeNull();
  });
  it("releaseFromTagUrl builds the asset URL for a newer release only", () => {
    expect(releaseFromTagUrl("https://github.com/GongJiYang/xuegen/releases/tag/v0.4.0", "0.3.0", "arm64")).toEqual({
      version: "0.4.0",
      notes: [],
      assetUrl: "https://github.com/GongJiYang/xuegen/releases/download/v0.4.0/xuegen-0.4.0-arm64-mac.zip",
      size: 0,
    });
    expect(releaseFromTagUrl("https://github.com/GongJiYang/xuegen/releases/tag/v0.4.0", "0.4.0", "arm64")).toBeNull();
    expect(releaseFromTagUrl("https://github.com/GongJiYang/xuegen/releases/tag/v0.4.0", "0.5.0", "arm64")).toBeNull();
  });
  it("notesUrl points at the release's notes.md asset", () => {
    expect(notesUrl("0.4.0")).toBe("https://github.com/GongJiYang/xuegen/releases/download/v0.4.0/notes.md");
  });
});
