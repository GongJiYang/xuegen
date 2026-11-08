/**
 * In-app update for the packaged app (design `?d=update`): check this
 * repository's GitHub releases (via the latest-release redirect, not the
 * rate-limited API), download the zip with progress, then swap the
 * app bundle and relaunch. No code signing is involved: the zip is unpacked
 * with `ditto`, the quarantine flag is cleared, and a detached shell script
 * replaces the bundle once this process has exited (restoring the old bundle
 * if the move fails).
 */

import { app, net } from "electron";
import { execFile, spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { LATEST_RELEASE_PAGE, notesUrl, releaseFromTagUrl, releaseNotes, type ReleaseInfo, type UpdateStatus } from "../shared/update.js";

const run = promisify(execFile);

const INSTALL_SCRIPT = `#!/bin/sh
# $1 = pid of the running app, $2 = the new .app, $3 = the installed .app
while kill -0 "$1" 2>/dev/null; do sleep 0.3; done
rm -rf "$3.old"
if mv "$3" "$3.old"; then
  if mv "$2" "$3"; then rm -rf "$3.old"; else mv "$3.old" "$3"; fi
fi
xattr -dr com.apple.quarantine "$3" 2>/dev/null
open "$3"
`;

/**
 * Where the latest-release page redirects to, or "" when it does not redirect
 * (no release yet). `net.fetch` follows redirects without exposing the final
 * URL (its `response.url` is empty), so read the redirect from `net.request`.
 */
function latestReleaseUrl(): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url: LATEST_RELEASE_PAGE, redirect: "manual" });
    request.setHeader("User-Agent", "xuegen-desktop");
    request.on("redirect", (_status, _method, url) => {
      request.abort();
      resolve(url);
    });
    request.on("response", (response) => {
      response.on("data", () => undefined);
      if (response.statusCode >= 400 && response.statusCode !== 404) reject(new Error(`GitHub 返回 ${response.statusCode}`));
      else resolve("");
    });
    request.on("error", reject);
    request.end();
  });
}

export interface Updater {
  check(manual: boolean): Promise<UpdateStatus>;
  download(): Promise<UpdateStatus>;
  install(): Promise<UpdateStatus>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createUpdater(notify: (status: UpdateStatus) => void): Updater {
  const current = app.getVersion();
  const dir = join(app.getPath("userData"), "updates");
  let status: UpdateStatus = { kind: "idle", current };
  let release: ReleaseInfo | null = null;
  let bundle: string | null = null;
  const set = (next: UpdateStatus): UpdateStatus => {
    status = next;
    notify(next);
    return next;
  };

  async function check(manual: boolean): Promise<UpdateStatus> {
    if (!app.isPackaged) return manual ? set({ kind: "unsupported", current }) : status;
    if (status.kind === "downloading" || status.kind === "ready") return status;
    if (manual) set({ kind: "checking", current });
    try {
      // The release page redirects to …/releases/tag/v<version>; no API call,
      // so no 60-per-hour limit.
      const found = releaseFromTagUrl(await latestReleaseUrl(), current, process.arch);
      if (!found) return set(manual ? { kind: "latest", current } : { kind: "idle", current });
      let notes: string[] = [];
      try {
        const notesResponse = await net.fetch(notesUrl(found.version), { headers: { "User-Agent": "xuegen-desktop" } });
        if (notesResponse.ok) notes = releaseNotes(await notesResponse.text());
      } catch {
        // Notes are optional: the update still works without them.
      }
      release = { ...found, notes };
      return set({ kind: "available", current, version: found.version, notes });
    } catch (error) {
      return set(manual ? { kind: "error", current, message: `检查更新失败：${messageOf(error)}` } : { kind: "idle", current });
    }
  }

  async function download(): Promise<UpdateStatus> {
    const target = release;
    if (!target || status.kind !== "available") return status;
    try {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `xuegen-${target.version}.zip`);
      set({ kind: "downloading", current, version: target.version, percent: 0 });
      const response = await net.fetch(target.assetUrl);
      if (!response.ok || !response.body) throw new Error(`下载失败（HTTP ${response.status}）`);
      const total = Number(response.headers.get("content-length")) || target.size;
      const out = createWriteStream(file);
      const reader = response.body.getReader();
      let received = 0;
      let last = -1;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (!out.write(value)) await new Promise<void>((resolve) => out.once("drain", () => resolve()));
        const percent = total > 0 ? Math.min(99, Math.floor((received / total) * 100)) : 0;
        if (percent !== last) {
          last = percent;
          set({ kind: "downloading", current, version: target.version, percent });
        }
      }
      await new Promise<void>((resolve, reject) => {
        out.on("error", reject);
        out.end(() => resolve());
      });
      const unpacked = join(dir, "unpacked");
      mkdirSync(unpacked, { recursive: true });
      await run("/usr/bin/ditto", ["-x", "-k", file, unpacked]);
      const name = readdirSync(unpacked).find((entry) => entry.endsWith(".app"));
      if (!name) throw new Error("更新包里没有找到应用");
      bundle = join(unpacked, name);
      await run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", bundle]).catch(() => undefined);
      return set({ kind: "ready", current, version: target.version });
    } catch (error) {
      return set({ kind: "error", current, message: `更新失败：${messageOf(error)}` });
    }
  }

  async function install(): Promise<UpdateStatus> {
    if (status.kind !== "ready" || !bundle) return status;
    // process.execPath = …/学根.app/Contents/MacOS/学根
    const installed = dirname(dirname(dirname(process.execPath)));
    if (!installed.endsWith(".app")) {
      return set({ kind: "error", current, message: `无法定位应用位置：${installed}` });
    }
    const script = join(dir, "install.sh");
    writeFileSync(script, INSTALL_SCRIPT, { mode: 0o755 });
    spawn("/bin/sh", [script, String(process.pid), bundle, installed], { detached: true, stdio: "ignore" }).unref();
    app.quit();
    return status;
  }

  return { check, download, install };
}
