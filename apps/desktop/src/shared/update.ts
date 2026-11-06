/**
 * In-app update: the status the main process reports, and the pure helpers
 * that read a GitHub release. The download URL is only trusted when it points
 * at this repository's own release assets.
 */

export type UpdateStatus =
  | { kind: "idle"; current: string }
  | { kind: "unsupported"; current: string }
  | { kind: "checking"; current: string }
  | { kind: "latest"; current: string }
  | { kind: "available"; current: string; version: string; notes: string[] }
  | { kind: "downloading"; current: string; version: string; percent: number }
  | { kind: "ready"; current: string; version: string }
  | { kind: "error"; current: string; message: string };

export interface ReleaseInfo {
  version: string;
  notes: string[];
  assetUrl: string;
  size: number;
}

/** Only assets of this repository's releases are downloaded. */
export const RELEASE_ASSET_PREFIX = "https://github.com/GongJiYang/xuegen/releases/download/";

/** Compare dotted versions numerically (a leading `v` is ignored): <0, 0, >0. */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string): number[] => value.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** The release body's `- ` / `* ` lines, at most eight. */
export function releaseNotes(body: string): string[] {
  return body
    .split("\n")
    .map((line) => /^\s*[-*]\s+(.+)$/.exec(line)?.[1]?.trim() ?? "")
    .filter((line) => line !== "")
    .slice(0, 8);
}

/** The newer release for this arch from GitHub's `releases/latest` JSON, or null. */
export function pickRelease(json: unknown, current: string, arch: string): ReleaseInfo | null {
  if (typeof json !== "object" || json === null) return null;
  const release = json as { tag_name?: unknown; draft?: unknown; prerelease?: unknown; body?: unknown; assets?: unknown };
  if (release.draft === true || release.prerelease === true) return null;
  const version = typeof release.tag_name === "string" ? release.tag_name.replace(/^v/, "") : "";
  if (!/^\d+\.\d+\.\d+$/.test(version) || compareVersions(version, current) <= 0) return null;
  const assets = Array.isArray(release.assets) ? (release.assets as { name?: unknown; browser_download_url?: unknown; size?: unknown }[]) : [];
  const asset = assets.find(
    (item) =>
      typeof item.name === "string" &&
      item.name.endsWith(`-${arch}-mac.zip`) &&
      typeof item.browser_download_url === "string" &&
      item.browser_download_url.startsWith(RELEASE_ASSET_PREFIX),
  );
  if (!asset) return null;
  return {
    version,
    notes: releaseNotes(typeof release.body === "string" ? release.body : ""),
    assetUrl: asset.browser_download_url as string,
    size: typeof asset.size === "number" ? asset.size : 0,
  };
}
