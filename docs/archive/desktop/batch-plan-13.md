# 批次 PL-13：程序内更新（查 GitHub Releases → 下载 → 替换并重启）

设计稿（用户已批准）：`/Users/gjy/pi-learning/design/animate/src/update.jsx`（`http://localhost:5181/?d=update`）。
前一批 PL-12 已能 `npm run dist` 打出 `dist/xuegen-<version>-arm64-mac.zip`（内含未签名的 `学根.app`）。Claude 发版时把这个 zip 上传到公开仓库 `GongJiYang/xuegen` 的 GitHub Release（tag `v<version>`，正文是 `- ` 开头的更新条目）。

流程：打包后的学根启动 8 秒后静默查一次；菜单「学根 → 检查更新…」手动查。有新版本时对话上方出现一条「学根 v0.3.0 可以更新 · 3 项改进　看看改了什么　稍后　更新并重启」；点「更新并重启」→ 下载（进度条）→「v0.3.0 已就绪……　立即重启」→ 退出、替换应用、重新打开。**不依赖 Apple 签名**：用 `ditto` 解压、清掉隔离属性、由一个后台 shell 脚本在本进程退出后替换应用包。开发模式下不做更新（菜单检查时显示「开发模式不检查更新」）。

## 硬约束（先看这里）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。
- 按步骤**逐条照做**，代码照抄；不要重新设计。做不通时停下报告。
- 只准改 / 新建：`src/shared/update.ts`（新）、`src/shared/update.test.ts`（新）、`src/shared/protocol.ts`、`src/shared/data-protocol.ts`、`src/shared/data-protocol.test.ts`、`src/main/update.ts`（新）、`src/main/index.ts`、`src/main/data/handler.ts`、`src/renderer/core/chat/chat-reducer.ts`、`src/renderer/core/update/use-update.ts`（新）、`src/renderer/core/strings.ts`、`src/renderer/skins/contract.ts`、`src/renderer/App.tsx`、三个皮肤的 `index` 与新 `update-bar.tsx`、`src/renderer/skins/bear/skin.css`、`src/renderer/gallery/Gallery.tsx`、`electron-builder.json`（只加图标），以及类型报错需要补的测试文件。
- 皮肤里不写中文文案。不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron 窗口，不 commit / push，不加依赖，不加 `eslint-disable` / `@ts-ignore`。`App.tsx` ≤ 450 行。
- 以下路径都相对 `apps/desktop/`。

## 第 1 步：`src/shared/update.ts`（新，纯函数）

```ts
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
```

## 第 2 步：`src/shared/update.test.ts`（新）

```ts
import { describe, expect, it } from "vitest";
import { compareVersions, pickRelease, releaseNotes } from "./update.js";

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
});
```

## 第 3 步：协议

1. `src/shared/protocol.ts`：import `type { UpdateStatus } from "./update.js"`；`AgentToHostMessage` 联合里 `| { type: "fatal"; error: string }` 上面加：

```ts
  /** Sent by the main process (not the agent): the in-app update's state changed. */
  | { type: "update-status"; status: UpdateStatus }
```

2. `src/shared/data-protocol.ts`：import `type { UpdateStatus } from "./update.js"`；`DataRequest` 加三项 `| { kind: "update.check" } | { kind: "update.download" } | { kind: "update.install" }`；`DataResponseMap` 加 `"update.check": UpdateStatus; "update.download": UpdateStatus; "update.install": UpdateStatus;`；校验函数里加 `case "update.check": case "update.download": case "update.install": return true;`。`data-protocol.test.ts` 合法请求列表加这三项。
3. `src/main/data/handler.ts`：switch 里加（这三类由主进程在 `index.ts` 里先拦下处理，走到这里说明调用方式错了）：

```ts
    case "update.check":
    case "update.download":
    case "update.install":
      return { ok: false, code: "unknown", error: "更新请求只能由主进程处理。" };
```

4. `src/renderer/core/chat/chat-reducer.ts`：`reduceAgentEvent` 里 `case "commands":` 前面加 `case "update-status":` 与 `return state;`（注释：`// The update bar listens to this itself (core/update/use-update).`）。

## 第 4 步：`src/main/update.ts`（新）

```ts
/**
 * In-app update for the packaged app (design `?d=update`): check this
 * repository's GitHub releases, download the zip with progress, then swap the
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
import { pickRelease, type ReleaseInfo, type UpdateStatus } from "../shared/update.js";

const RELEASES_URL = "https://api.github.com/repos/GongJiYang/xuegen/releases/latest";
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
      const response = await net.fetch(RELEASES_URL, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "xuegen-desktop" },
      });
      if (response.status === 404) return set(manual ? { kind: "latest", current } : { kind: "idle", current });
      if (!response.ok) throw new Error(`GitHub 返回 ${response.status}`);
      const found = pickRelease(await response.json(), current, process.arch);
      if (!found) return set(manual ? { kind: "latest", current } : { kind: "idle", current });
      release = found;
      return set({ kind: "available", current, version: found.version, notes: found.notes });
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
        if (!out.write(value)) await new Promise((resolve) => out.once("drain", resolve));
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
```

## 第 5 步：`src/main/index.ts`

1. import 加 `import { createUpdater, type Updater } from "./update.js";`
2. 模块级（`let mainWindow …` 附近）加 `let updater: Updater | null = null;`
3. `installApplicationMenu` 里 `if (process.platform === "darwin") template.push({ role: "appMenu" });` 改为：

```ts
  if (process.platform === "darwin") {
    template.push({
      label: app.name,
      submenu: [
        { role: "about" },
        { label: "检查更新…", click: () => void updater?.check(true) },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }
```

4. `app.whenReady().then(() => {` 里，`startAgentProcess();` **上面**加：

```ts
  updater = createUpdater((status) => sendToRenderer({ type: "update-status", status }));
```

   `createWindow();` **下面**加：

```ts
  // Packaged builds look for a newer release once, quietly, after start-up.
  if (app.isPackaged) setTimeout(() => void updater?.check(false), 8000);
```

5. `ipcMain.handle(DATA_CHANNEL, …)` 里，`try {` 的**第一行**加：

```ts
      if (request.kind === "update.check" && updater) return { ok: true, data: await updater.check(true) };
      if (request.kind === "update.download" && updater) return { ok: true, data: await updater.download() };
      if (request.kind === "update.install" && updater) return { ok: true, data: await updater.install() };
```

## 第 6 步：渲染层核心

1. `src/renderer/core/update/use-update.ts`（新）：

```ts
/**
 * The update bar's state: the latest status the main process pushed, the
 * user's 「稍后」 for the current offer, and the actions.
 */

import { useCallback, useEffect, useState } from "react";
import type { UpdateStatus } from "@shared/update.js";
import * as client from "../client.js";

export interface UpdateBarState {
  status: UpdateStatus;
  /** True after 「稍后」 until the next status change. */
  dismissed: boolean;
  onDownload(): void;
  onInstall(): void;
  onDismiss(): void;
}

export function useUpdate(): UpdateBarState {
  const [status, setStatus] = useState<UpdateStatus>({ kind: "idle", current: "" });
  const [dismissed, setDismissed] = useState(false);
  useEffect(
    () =>
      client.subscribe((event) => {
        if (event.type !== "update-status") return;
        setStatus(event.status);
        setDismissed(false);
      }),
    [],
  );
  const call = useCallback((kind: "update.download" | "update.install") => {
    void client.data({ kind }).then((result) => {
      if (result.ok) setStatus(result.data);
    });
  }, []);
  return {
    status,
    dismissed,
    onDownload: () => call("update.download"),
    onInstall: () => call("update.install"),
    onDismiss: () => setDismissed(true),
  };
}
```

2. `src/renderer/core/strings.ts`：顶层加一块（放在 `plan: {` 前面）：

```ts
  update: {
    available: (version: string, count: number): string => `学根 v${version} 可以更新${count > 0 ? ` · ${count} 项改进` : ""}`,
    showNotes: "看看改了什么",
    hideNotes: "收起",
    later: "稍后",
    install: "更新并重启",
    downloading: (version: string): string => `正在下载 v${version}`,
    ready: (version: string): string => `v${version} 已就绪，学根将关闭并重新打开（对话和进度都会保留）`,
    restart: "立即重启",
    checking: "正在检查更新…",
    latest: (version: string): string => `已是最新版本 v${version}`,
    unsupported: "开发模式不检查更新",
    close: "关闭",
  },
```

## 第 7 步：契约与组装

1. `src/renderer/skins/contract.ts`：import `type { UpdateBarState } from "../core/update/use-update.js";`；加

```ts
/** The update bar above the transcript (design `?d=update`). Renders nothing when idle or dismissed. */
export type UpdateBarProps = UpdateBarState;
```

   `SkinSlots` 里 `Thinking: …` 下面加 `UpdateBar: ComponentType<UpdateBarProps>;`。
2. `src/renderer/App.tsx`：
   - 加 `import { useUpdate } from "./core/update/use-update.js";`
   - 在组件里其他 hook 附近加 `const update = useUpdate();`
   - `const { Shell, Thread, Composer, DayEditor } = skin.slots;` 改为 `const { Shell, Thread, Composer, DayEditor, UpdateBar } = skin.slots;`
   - `children: (` 里 `<>` 下面第一行（`<Thread` 之前）加 `<UpdateBar {...update} />`
   - 改完 `wc -l` 必须 ≤ 450；超了就把新加的 import 与已有的同目录 import 合并到一行，不删别的代码。

## 第 8 步：三个皮肤的 `UpdateBar`

三个皮肤共用同一显示规则：`dismissed` 为真，或 `status.kind` 是 `idle`，就返回 `null`；`available` 显示圆点 + `available(version, notes.length)` + 「看看改了什么/收起」切换（展开时下面列出 `notes`）+「稍后」(onDismiss) +「更新并重启」(onDownload)；`downloading` 显示 `downloading(version)` + 进度条 + `percent%`；`ready` 显示 `ready(version)` +「立即重启」(onInstall)；`checking` 显示 `checking`；`latest` 显示 `latest(current)` +「关闭」(onDismiss)；`unsupported` 显示 `unsupported` +「关闭」；`error` 显示 `message` +「关闭」。

1. `src/renderer/skins/bear/update-bar.tsx`（新）：

```tsx
/** Bear update bar (design `?d=update`): one quiet line above the transcript. */

import { useState } from "react";
import type { UpdateBarProps } from "../contract.js";
import { strings } from "../../core/strings.js";

export function UpdateBar({ status, dismissed, onDownload, onInstall, onDismiss }: UpdateBarProps) {
  const [notes, setNotes] = useState(false);
  if (dismissed || status.kind === "idle") return null;
  const close = (
    <button type="button" className="bear-up-link" onClick={onDismiss}>
      {strings.update.close}
    </button>
  );
  let line;
  switch (status.kind) {
    case "available":
      line = (
        <>
          <span className="bear-up-dot" />
          <span>{strings.update.available(status.version, status.notes.length)}</span>
          {status.notes.length > 0 && (
            <button type="button" className="bear-up-link" onClick={() => setNotes((value) => !value)}>
              {notes ? strings.update.hideNotes : strings.update.showNotes}
            </button>
          )}
          <span className="bear-up-gap" />
          <button type="button" className="bear-up-link" onClick={onDismiss}>
            {strings.update.later}
          </button>
          <button type="button" className="bear-up-btn" onClick={onDownload}>
            {strings.update.install}
          </button>
        </>
      );
      break;
    case "downloading":
      line = (
        <>
          <span>{strings.update.downloading(status.version)}</span>
          <span className="bear-up-prog">
            <i style={{ width: `${status.percent}%` }} />
          </span>
          <span className="bear-up-pct">{status.percent}%</span>
        </>
      );
      break;
    case "ready":
      line = (
        <>
          <span className="bear-up-dot is-ok" />
          <span>{strings.update.ready(status.version)}</span>
          <span className="bear-up-gap" />
          <button type="button" className="bear-up-btn" onClick={onInstall}>
            {strings.update.restart}
          </button>
        </>
      );
      break;
    case "checking":
      line = <span>{strings.update.checking}</span>;
      break;
    case "latest":
      line = (
        <>
          <span>{strings.update.latest(status.current)}</span>
          <span className="bear-up-gap" />
          {close}
        </>
      );
      break;
    case "unsupported":
      line = (
        <>
          <span>{strings.update.unsupported}</span>
          <span className="bear-up-gap" />
          {close}
        </>
      );
      break;
    case "error":
      line = (
        <>
          <span className="bear-up-error">{status.message}</span>
          <span className="bear-up-gap" />
          {close}
        </>
      );
      break;
  }
  return (
    <div className="bear-up" role="status">
      <div className="bear-up-bar">{line}</div>
      {status.kind === "available" && notes && (
        <ul className="bear-up-notes">
          {status.notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

   （若 lint 要求 `switch` 穷尽或不允许未初始化的 `let`，改成一个返回 JSX 的小函数 `lineFor(status)`，各分支 `return`，`default` 用 `assertNever`。）

2. `bear/index.ts`：import 并在 slots 里加 `UpdateBar`。`bear/skin.css` 末尾追加：

```css
/* Update bar (design ?d=update). */
[data-skin="bear"] .bear-up {
  flex: none;
  margin: 0.6em 0 0.2em;
  font-family: var(--font-ui);
  font-size: 13px;
}
[data-skin="bear"] .bear-up-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border: 1px solid var(--rule);
  border-radius: 8px;
  background: #fff;
  color: var(--ink);
}
[data-skin="bear"] .bear-up-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
}
[data-skin="bear"] .bear-up-dot.is-ok {
  background: var(--done);
}
[data-skin="bear"] .bear-up-gap {
  flex: 1;
}
[data-skin="bear"] .bear-up-link {
  font-size: 12.5px;
  color: var(--soft);
}
[data-skin="bear"] .bear-up-link:hover {
  color: var(--ink);
}
[data-skin="bear"] .bear-up-btn {
  padding: 3px 12px;
  border-radius: 6px;
  background: var(--ink);
  color: var(--paper);
  font-size: 12.5px;
}
[data-skin="bear"] .bear-up-prog {
  flex: 1;
  height: 4px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--hairline);
}
[data-skin="bear"] .bear-up-prog i {
  display: block;
  height: 100%;
  background: var(--accent);
}
[data-skin="bear"] .bear-up-pct {
  width: 3em;
  text-align: right;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-up-error {
  color: var(--danger);
}
[data-skin="bear"] .bear-up-notes {
  margin: 6px 0 0;
  padding: 8px 12px 8px 28px;
  border-radius: 8px;
  background: var(--code-bg);
  font-size: 12.5px;
  color: #4a4f55;
}
```

3. bare：新建 `src/renderer/skins/bare/update-bar.tsx`，同样的显示规则，用 `<div data-slot="update" role="status">` 包裹，文字用 `<span>`、按钮用普通 `<button type="button">`、进度用 `<progress value={percent} max={100} />`、更新条目用 `<ul>`；在 `bare/index.tsx` 的 slots 里注册。
4. chicago：新建 `src/renderer/skins/chicago/update-bar.tsx`，同样的显示规则，外层 `<div className="chicago-pane-inner" role="status">`，文字放 `Note`（从 `./panel-shared.js`），按钮包在 `<span className="chicago-def"><button type="button">…</button></span>`（照 `chicago/progress-panel.tsx` 里「新课程」按钮的写法），进度用 `Bar`（`./widgets.js` 的 `Bar percent`）；在 `chicago/index.ts` 的 slots 里注册。
5. `src/renderer/gallery/Gallery.tsx`：在 Thinking 样例附近加一个 UpdateBar 样例：`status={{ kind: "available", current: "0.2.0", version: "0.3.0", notes: ["总进度第四版", "对话左侧钉板"] }} dismissed={false}`，三个回调用 `() => undefined`。

## 第 9 步：测试

新建 `src/renderer/skins/bear/update-bar.test.tsx`：
- `available` 时能看到 `strings.update.available("0.3.0", 2)`，点 `showNotes` 后看到两条更新；点「更新并重启」调用 `onDownload`；点「稍后」调用 `onDismiss`。
- `downloading`（percent 42）时能看到 `42%`。
- `ready` 时点 `restart` 调用 `onInstall`。
- `idle` 或 `dismissed: true` 时容器为空（`container.innerHTML === ""`）。

契约测试（`skins/contract.test.tsx` 等）若要求每个皮肤都有全部 slots，确认三个皮肤都注册了 `UpdateBar`。

## 第 10 步：`electron-builder.json`

`mac` 里加 `"icon": "resources/app-icon.png"`（该文件已存在；若尺寸小于 512×512 导致打包报错，删掉这一行并在报告里写明）。

## 验收命令（全部贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build && npm run dist
wc -l src/renderer/App.tsx
cd /Users/gjy/pi-learning/xuegen && npm test && git status --short
```

## 结束报告

改了哪些文件；每一步是否照做；偏离之处与原因；未完成项。
