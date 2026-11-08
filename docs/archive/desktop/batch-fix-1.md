# batch-fix-1：检查更新不走 API、关提示关对那一条、开课给完整路径

## 硬约束（先看这里，压缩后也要遵守）

- 只改下面「步骤」里点名的文件；不建步骤之外的新文件。
- 纯函数要有同名测试；纯函数不读时钟、环境、全局。
- 界面文案只写在 `src/renderer/core/strings.ts`。
- `src/renderer/App.tsx` 最终 ≤ 450 行。
- 不加 `eslint-disable`、`@ts-ignore`、`@ts-expect-error`；lint 拦住就改代码。
- 禁止：读写 `~/.xuegen/`、碰 Obsidian 库、启动 Electron、git commit / push、加依赖、访问网络（测试里不发真实请求）。
- 工作区里已有 Claude 的未提交改动（`core/chat/chat-reducer.ts`、`chat-reducer.test.ts`），不要动、不要回退。

先读：`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。

## 背景

1. **检查更新会失败（403）**：`src/main/update.ts` 查 `api.github.com/.../releases/latest`，未登录每小时 60 次、按出口 IP 计，用完就 403。改成不走 API：请求 `https://github.com/GongJiYang/xuegen/releases/latest`，它会跳转到 `.../releases/tag/v0.4.0`，从最终地址读出版本号；安装包地址按固定规则拼出；更新说明从同一个 release 的附件 `notes.md` 读（读不到就没有说明，不算失败）。
2. **关提示可能关错**：`App.tsx` 把合并后的提示列表下标直接交给 `controller.dismissNotice`，但列表最前面可能有一条皮肤提示（不可关），下标就错位了。
3. **开课太慢**：开课那句话里课程文件是相对路径 `wiki/courses/<slug>.md`，学根的工作目录不是库，它要先到处找库在哪（实测一次开课 50 多次工具调用）。改成给出课程文件的绝对路径和库根。

## 步骤

### 1. 纯函数：从跳转地址得到 release（`src/shared/update.ts`）

在文件末尾加：

```ts
/** The repository's 「latest release」 page; it redirects to `…/releases/tag/v<version>`. */
export const LATEST_RELEASE_PAGE = "https://github.com/GongJiYang/xuegen/releases/latest";

/** The version in a `…/releases/tag/v1.2.3` URL, or null. */
export function versionFromTagUrl(url: string): string | null {
  const match = /\/GongJiYang\/xuegen\/releases\/tag\/v(\d+\.\d+\.\d+)\/?$/.exec(url);
  return match ? match[1]! : null;
}

/**
 * The newer release named by the latest-release redirect, or null when the
 * redirect names no release or not a newer one. The asset URL follows the
 * fixed naming `xuegen-<version>-<arch>-mac.zip`; notes come separately.
 */
export function releaseFromTagUrl(url: string, current: string, arch: string): ReleaseInfo | null {
  const version = versionFromTagUrl(url);
  if (!version || compareVersions(version, current) <= 0) return null;
  return {
    version,
    notes: [],
    assetUrl: `${RELEASE_ASSET_PREFIX}v${version}/xuegen-${version}-${arch}-mac.zip`,
    size: 0,
  };
}

/** Where a release's `notes.md` asset lives. */
export function notesUrl(version: string): string {
  return `${RELEASE_ASSET_PREFIX}v${version}/notes.md`;
}
```

`pickRelease` 保留不删（旧测试仍用）。

在 `src/shared/update.test.ts` 加测试：
- `versionFromTagUrl("https://github.com/GongJiYang/xuegen/releases/tag/v0.4.0")` → `"0.4.0"`；末尾带 `/` 也行；`".../releases"`（没有 tag）、别的仓库的 tag 地址、`v0.4` → null。
- `releaseFromTagUrl(该地址, "0.3.0", "arm64")` → `{ version: "0.4.0", notes: [], assetUrl: "https://github.com/GongJiYang/xuegen/releases/download/v0.4.0/xuegen-0.4.0-arm64-mac.zip", size: 0 }`；`current` 为 `"0.4.0"` 或 `"0.5.0"` → null。
- `notesUrl("0.4.0")` → `"https://github.com/GongJiYang/xuegen/releases/download/v0.4.0/notes.md"`。

### 2. 主进程检查更新（`src/main/update.ts`）

a. 删掉常量 `RELEASES_URL`；导入改为 `import { LATEST_RELEASE_PAGE, notesUrl, releaseFromTagUrl, releaseNotes, type ReleaseInfo, type UpdateStatus } from "../shared/update.js";`（`pickRelease` 不再在这里用）。

b. `check` 里 `try { … }` 的内容整段换成：

```ts
      // The release page redirects to …/releases/tag/v<version>; no API call,
      // so no 60-per-hour limit.
      const response = await net.fetch(LATEST_RELEASE_PAGE, { headers: { "User-Agent": "xuegen-desktop" } });
      if (response.status === 404) return set(manual ? { kind: "latest", current } : { kind: "idle", current });
      if (!response.ok) throw new Error(`GitHub 返回 ${response.status}`);
      const found = releaseFromTagUrl(response.url, current, process.arch);
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
```

（`catch (error)` 那段保持不变：手动检查失败时显示错误，自动检查失败时静默。）

c. 文件顶部注释里「check this repository's GitHub releases」后补一句：`(via the latest-release redirect, not the rate-limited API)`。

### 3. 关提示关对那一条

a. `src/renderer/core/chat/view-models.ts` 末尾加：

```ts
/** What closing the notice at `index` of the shell's list means: [skin notices…, chat notices…, freshness notice?]. */
export type NoticeDismiss = { kind: "none" } | { kind: "chat"; index: number } | { kind: "freshness" };

export function routeDismiss(index: number, skinCount: number, chatCount: number, hasFreshness: boolean): NoticeDismiss {
  if (index < skinCount) return { kind: "none" };
  if (index < skinCount + chatCount) return { kind: "chat", index: index - skinCount };
  if (hasFreshness && index === skinCount + chatCount) return { kind: "freshness" };
  return { kind: "none" };
}
```

`view-models.test.ts` 加测试：`routeDismiss(0, 1, 2, true)` → none；`(1, 1, 2, true)` → chat 0；`(2, 1, 2, true)` → chat 1；`(3, 1, 2, true)` → freshness；`(3, 1, 2, false)` → none；`(0, 0, 1, false)` → chat 0。

b. `src/renderer/App.tsx` 把

```ts
    onDismissNotice: (index) => (freshness.notice && index === notices.length - 1 ? freshness.dismiss() : controller.dismissNotice(index)),
```

换成

```ts
    onDismissNotice: (index) => {
      const target = routeDismiss(index, notice ? 1 : 0, controller.notices.length, freshness.notice !== null);
      if (target.kind === "chat") controller.dismissNotice(target.index);
      else if (target.kind === "freshness") freshness.dismiss();
    },
```

并从 `./core/chat/view-models.js` 导入 `routeDismiss`（若 App 里已有对该文件的导入就并进去）。

### 4. 开课给课程文件的绝对路径和库根

a. `skills/course/course-state.mjs` 的 `listCommand`：上一批已加了 `changedAt`；在同一处再加 `file`：

```js
    const file = join(coursesDir, `${course.slug}.md`);
    const changedAt = (await stat(file)).mtimeMs;
    entries.push({ ...toListEntry(course), changedAt: Math.floor(changedAt), file });
```

（`coursesDir` 已是 `resolve` 过的绝对路径。）同步更新 `skills/course/course-parse.test.mjs` 里对 `list --json` 字段集合的断言，加上 `file`，并断言它以 `/wiki/courses/<slug>.md` 结尾（按该测试夹具的实际目录写）。

b. `src/shared/data-protocol.ts` 的 `CourseSummary`，在 `changedAt?: number;` 后加：

```ts
  /** The course file's absolute path, from `course-state.mjs list`. */
  file?: string;
```

c. `src/renderer/core/today.ts`：把

```ts
function courseFileHint(slug: string): string {
  return `（课程文件：wiki/courses/${slug}.md，下次起点以此为准，不必先列目录或读看板）`;
}
```

换成

```ts
/** Where the course file is: its absolute path and the vault root when known, else the vault-relative path. */
export function courseFileHint(course: Pick<CourseSummary, "slug" | "file">): string {
  const file = course.file;
  const root = file && file.endsWith(`/wiki/courses/${course.slug}.md`) ? file.slice(0, -`/wiki/courses/${course.slug}.md`.length) : null;
  if (file && root) {
    return `（课程文件：${file}；库根：${root}。下次起点以此为准，不必先找库、列目录或读看板）`;
  }
  return `（课程文件：wiki/courses/${course.slug}.md，下次起点以此为准，不必先列目录或读看板）`;
}
```

两处调用改为 `courseFileHint(resume.course)` 与 `courseFileHint(course)`。确认 `CourseSummary` 已从 `@shared/data-protocol.js` 导入（没有就加 `import type`）。

`src/renderer/core/today.test.ts`：已有的四条期望（课程没有 `file`）保持不变；新增一条：课程带 `file: "/Users/x/V/wiki/courses/a.md"` 时，`studyPrompt` 结果以 `（课程文件：/Users/x/V/wiki/courses/a.md；库根：/Users/x/V。下次起点以此为准，不必先找库、列目录或读看板）` 结尾；`file` 不以 `/wiki/courses/a.md` 结尾时退回相对路径写法。

d. `src/renderer/core/board/course-prompts.ts` 的 `editPlanPrompt`：签名改为 `editPlanPrompt(course: Pick<CourseSummary, "slug" | "title" | "file">, change: string)`，返回

```ts
  return `/skill:course 修改「${course.title}」的学习计划：${change.trim()}。改完后告诉我新的本周安排，并刷新课程看板。${courseFileHint(course)}`;
```

（从 `../today.js` 导入 `courseFileHint`；若产生循环导入导致 lint/构建报错，就把 `courseFileHint` 挪到新文件 `src/renderer/core/course-file-hint.ts`（带同名测试，测试内容即 4c 的新增测试），两处都从那里导入。）调用处 `use-course-sessions.ts` 的 `editPlanPrompt(course.title, change)` 改为 `editPlanPrompt(course, change)`；更新 `course-prompts.test.ts` 里对应的期望。

### 5. 发版说明（`docs/desktop/RELEASE.md`）

第 6 步的发布命令改为（把更新说明另存为 `notes.md` 一起上传）：

```
cp /tmp/xuegen-notes.md apps/desktop/dist/notes.md
gh release create v<版本> apps/desktop/dist/xuegen-<版本>-arm64-mac.zip apps/desktop/dist/notes.md --repo GongJiYang/xuegen --title "学根 v<版本>" --notes-file /tmp/xuegen-notes.md
```

并在文件开头那段说明里，把「程序内更新只认 … Releases 里的 `xuegen-<版本>-arm64-mac.zip`」后补一句：「检查更新读 `releases/latest` 的跳转得到版本号（不走限流的 API），更新说明读同一 release 的 `notes.md` 附件。」

## 验收命令（贴出每条最后几行）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && npm test && npm run lint:skills
wc -l apps/desktop/src/renderer/App.tsx
grep -rn "api.github.com" apps/desktop/src
git status --short
```

`grep api.github.com` 应无结果。`git status --short` 只应出现本批文件和 Claude 已有的两处改动。

## 结束报告

改了哪些文件；每一步是否照做，偏离之处和原因；未完成项。
