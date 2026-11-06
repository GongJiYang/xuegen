# 批次 PL-12：打包成「学根.app」

用户要求像普通软件一样使用学根，并在程序内更新（更新器在下一批 PL-13）。本批只做打包。

Claude 已用临时配置验证过可行：`electron-builder@26.0.12` 打出的未签名 `学根.app` 能启动，设置 `XUEGEN_REPO_ROOT=<app>/Contents/Resources/xuegen` 后技能脚本（今天、日历）和 Pi 会话都正常。本批把这件事固化下来，并让打包后的应用**不需要**手动设环境变量。

## 硬约束（先看这里）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。
- 按步骤**逐条照做**；不要重新设计。做不通时停下报告。
- 只准改 / 新建：`apps/desktop/package.json`、`apps/desktop/package-lock.json`（由 npm 生成）、`apps/desktop/electron-builder.json`（新）、`apps/desktop/src/agent/environment.ts`、`apps/desktop/src/agent/environment.test.ts`（没有就新建）、`apps/desktop/.gitignore`（没有就新建；若仓库根 `.gitignore` 已管 `apps/desktop` 的忽略，就改根的）。
- 只新增一个开发依赖 `electron-builder`，版本精确锁定 `26.0.12`（`npm install --save-dev --save-exact electron-builder@26.0.12`）。不加其他依赖。
- 不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron 窗口（`npm run dist` 只打包，不运行应用），不 commit / push，不加 `eslint-disable` / `@ts-ignore`。

## 第 1 步：`apps/desktop/electron-builder.json`（新）

```json
{
  "appId": "com.gongjiyang.xuegen",
  "productName": "学根",
  "directories": { "output": "dist" },
  "files": ["out/**", "package.json"],
  "extraResources": [
    { "from": "../../package.json", "to": "xuegen/package.json" },
    { "from": "../../instructions.md", "to": "xuegen/instructions.md" },
    { "from": "../../defaults", "to": "xuegen/defaults" },
    { "from": "../../skills", "to": "xuegen/skills", "filter": ["**/*", "!**/*.test.mjs"] },
    { "from": "../../scripts", "to": "xuegen/scripts", "filter": ["**/*", "!**/*.test.mjs"] }
  ],
  "mac": {
    "target": [{ "target": "zip", "arch": ["arm64"] }],
    "identity": null,
    "category": "public.app-category.education",
    "artifactName": "xuegen-${version}-${arch}-mac.${ext}"
  },
  "publish": null
}
```

## 第 2 步：`apps/desktop/package.json`

1. 安装依赖（见硬约束）。
2. `scripts` 里 `"start"` 下面加：

```json
    "dist": "electron-vite build && electron-builder --config electron-builder.json",
```

3. `"version"` 保持 `0.1.0` 不动（发版时由 Claude 改）。

## 第 3 步：`.gitignore`

忽略 `apps/desktop/dist/`（打包产物）。

## 第 4 步：`apps/desktop/src/agent/environment.ts`

打包后 `import.meta.url` 在 `app.asar` 里，往上找不到仓库根；技能等文件放在 `Contents/Resources/xuegen/`。在 `findRepoRoot` 里，`XUEGEN_REPO_ROOT` 那段**之后**、往上找之前，插入：

```ts
  // Packaged app: the repository files ship as extra resources (electron-builder.json).
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resources) {
    const bundled = join(resources, "xuegen");
    if (existsSync(join(bundled, "package.json")) && existsSync(join(bundled, "instructions.md"))) return bundled;
  }
```

并把函数注释最后一句改为：`The fallbacks are the packaged app's \`Resources/xuegen\` (extra resources) and then walking up from this file until the root \`package.json\` is found, which also covers the smoke script running from source.`

（开发模式下 `process.resourcesPath` 指向 Electron 自带的资源目录，里面没有 `xuegen/`，所以会继续往上找，行为不变。）

## 第 5 步：测试 `apps/desktop/src/agent/environment.test.ts`

若文件已存在就追加，否则新建。用临时目录造一个 `resources/xuegen/{package.json,instructions.md}`，临时设置 `process.resourcesPath`（测试结束恢复）并清掉 `XUEGEN_REPO_ROOT`，断言 `findRepoRoot()` 返回该 `xuegen` 目录；再把 `resourcesPath` 指向一个没有 `xuegen/` 的目录，断言返回的是本仓库根（含 `instructions.md`）。注意 `environment.ts` 在导入时就计算 `repoRoot`，测试只调用 `findRepoRoot()`，不依赖 `repoRoot` 常量。

## 第 6 步：打包验证（不运行应用）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run dist
ls -la dist/
unzip -l dist/xuegen-0.1.0-arm64-mac.zip | grep -E "Resources/xuegen/(instructions.md|skills/cycle-plan/cycle.mjs)" 
```

zip 里必须有 `学根.app/Contents/Resources/xuegen/instructions.md` 和 `…/skills/cycle-plan/cycle.mjs`，且没有 `*.test.mjs`。

## 验收命令（全部贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build && npm run dist
cd /Users/gjy/pi-learning/xuegen && npm test && git status --short
```

## 结束报告

改了哪些文件；每一步是否照做；dist 目录列表与 zip 内关键文件检查结果；zip 大小；偏离之处；未完成项。
