# 发版日：库改英文名 + 数据根改名（操作清单）

前提：新版本（含新旧布局都认的代码、`rename-vault.mjs`、`vault-lint.mjs`）已发版并安装；用户说了「发版」。全程 Claude 执行，每步核对通过才进下一步；任何一步不对就按「撤回」做，停下告诉用户。

## 0. 请用户自己退出学根和 Obsidian（不替用户退出）
- 核对：`pgrep -fl "学根.app/Contents/MacOS|Obsidian.app/Contents/MacOS"` 无输出。

## 1. 改名前快照
- `cd ~/学根/库 && jj st` → 必须「no changes」（有改动先请用户确认是否提交）。
- `jj log -r @- --no-graph -T 'commit_id.short()'` 记下基线提交 ID，写进这份清单末尾。
- 独立断链扫描：`python3 -I /tmp/xg-rename-check/tools/links.py ~/学根/库 /tmp/rename-day-before.json`（脚本若已被清理，从 `docs/platform/` 的说明重建）。

## 2. 试运行
- `node ~/.xuegen/app/skills/wiki-save/rename-vault.mjs ~/学根/库 <仓库>/docs/platform/vault-rename-map.json`
- 核对：前置检查通过；`.gitignore` 将改 `raw/学习路径/` → `raw/library/`；计划数与 11-09 副本核对一致（30 目录、160 文件、约 892 条链接）。

## 3. 正式改名
- 同一命令加 `--apply`。
- 核对：
  - `links.py` 改名后扫描，与第 1 步比对：**新增断链 0**；
  - 权限：`stat -f %Lp ~/学根/库/wiki/courses ~/学根/库/wiki/courses/*.md` 与改名前一致（0555 / 0444）；
  - `jj st` 里没有 `A raw/library/` 开头的行（教材没被收进版本库）；
  - `node ~/.xuegen/app/skills/reading/bookshelf.mjs today ~/学根/库 --json` 正常输出；
  - `node ~/.xuegen/app/skills/wiki-save/vault-lint.mjs ~/学根/库` 只剩已知的历史问题。
- 撤回：`cd ~/学根/库 && jj restore --from <基线提交>`（或 `jj undo`），再查 `.gitignore` 与权限。

## 4. 提交推送
- `jj commit -m "改名：库全英文命名（rename-vault）"` → `jj git push`（私有远端 `GongJiYang/xuegen-vault`）。

## 5. 数据根改名 `~/学根` → `~/xuegen-data`
- `mv ~/学根 ~/xuegen-data`；子目录改名：`库→vault`、`会话→sessions`、`工作区→workspace`。
- 旧位置留链接：`ln -s ~/xuegen-data ~/学根`，并在 `~/xuegen-data` 里留 `库 → vault`、`会话 → sessions`、`工作区 → workspace` 三个链接（旧会话文件里的路径还能解析）。
- 跑 `node ~/.xuegen/app/bin/xuegen-data-root.mjs ~/xuegen-data --dry-run` 看计划，再去掉 `--dry-run`：它会更新 `~/.xuegen/sessions`、`~/learning` 两条链接与 `~/.xuegen/wiki.json`（`root` 指新路径）。
- 核对：`readlink ~/.xuegen/sessions ~/learning`；`cat ~/.xuegen/wiki.json`；`cd ~/xuegen-data/vault && jj st` 正常。
- 撤回：`rm ~/学根 && mv ~/xuegen-data ~/学根`，子目录改回，`xuegen-data-root.mjs ~/学根` 重接。

## 6. 收尾
- 去掉库 `AGENTS.md` 里的「Migration status」说明，`jj commit` + push。
- 更新 `docs/platform/NEW-MACHINE.md`、`PROGRESS.md` 里的路径（`~/学根/库` → `~/xuegen-data/vault`），`/tmp/xg-e2e/prepare.sh` 的 `REAL=`。
- 请用户打开 Obsidian，**重新选库**为 `~/xuegen-data/vault`，删掉旧入口。
- 请用户打开学根，点开「今天」、书房、一门课，看是否正常。

## 7. 卡片（改名后另做）
- 请用户在 Obsidian 里**停用 Obsidian_to_Anki 插件**；打开 Anki。
- `node ~/.xuegen/app/skills/wiki-save/anki-sync.mjs push ~/xuegen-data/vault --dry-run --json` → 给用户看要加多少张、哪些牌组。
- 用户同意后去掉 `--dry-run`（首次全量在命令行跑，不走 120 秒的按钮）。

基线提交 ID：（执行时填）
