# 发版（学根桌面版）

用户说「发版」时由 Claude 执行。程序内更新只认 `GongJiYang/xuegen` 公开仓库 GitHub Releases 里的 `xuegen-<版本>-arm64-mac.zip`（见 `apps/desktop/src/shared/update.ts`、`src/main/update.ts`）。

## 步骤

1. 工作区干净、全部检查通过：`apps/desktop` 下 `npm run typecheck && npm run lint && npm test`，仓库根 `npm test && npm run lint:skills`。
2. 定版本号（`x.y.z`，只增不减）：新功能升 y，修复升 z。改 `apps/desktop/package.json` 的 `version`。
3. `CHANGELOG.md`：把 `## Unreleased` 下的条目移到新标题 `## v<版本> — YYYY-MM-DD`，`## Unreleased` 留空。另写一份给用户看的更新说明 `/tmp/xuegen-notes.md`：3–8 行，每行 `- ` 开头、一句中文、说用户能感到的变化（界面会把这些行显示在「看看改了什么」里）。
4. 打包：`cd apps/desktop && npm run dist`，确认 `dist/xuegen-<版本>-arm64-mac.zip` 存在。
5. 提交并推送：`git commit -am "Release v<版本>"`，`git tag v<版本>`，`git push origin desktop desktop:main v<版本>`。
6. 发布：`gh release create v<版本> apps/desktop/dist/xuegen-<版本>-arm64-mac.zip --repo GongJiYang/xuegen --title "学根 v<版本>" --notes-file /tmp/xuegen-notes.md`。
7. 验证：`gh release view v<版本> --repo GongJiYang/xuegen` 能看到 zip；在已安装的学根里点「学根 → 检查更新…」应出现更新条。

## 首次安装

`/Applications/学根.app` 由 Claude 从 `dist/mac-arm64/学根.app` 拷贝，并执行 `xattr -dr com.apple.quarantine /Applications/学根.app`。之后都走程序内更新。

## 注意

- 未签名：不要改 `electron-builder.json` 的 `identity: null`，除非将来有 Apple 开发者证书。
- 测试仍用开发模式窗口（端口 9460，`XUEGEN_HOME=/tmp/xg-e2e/home`），不要拿用户已安装的学根做测试。
