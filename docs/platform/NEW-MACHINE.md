# 换电脑清单（学根，2026-11-09）

你的全部学习数据都在 `~/学根/` 里：

| 文件夹 | 是什么 | 怎么带走 |
|---|---|---|
| `库/` | wiki、原料、书房、课程页（Obsidian 打开这一层） | 私有仓库 `GongJiYang/xuegen-vault`（jj/git）；教材 `raw/学习路径/` 和 `raw/materials/*/code/` 不在仓库里，要拷文件夹 |
| `会话/` | 和学根的全部对话记录 | 拷文件夹 |
| `工作区/` | 学根做实验用的目录 | 拷文件夹 |

不在 `~/学根/` 里的：登录凭证（`~/.xuegen/auth.json`，新电脑重新登录）、Anki 收藏集（用 AnkiWeb 同步）。

## 新电脑上的步骤

1. **拷数据**：整个 `~/学根/` 拷到新电脑同一位置（最省事）；或者只拷 `会话/`、`工作区/`、`库/raw/学习路径/`，库本身用 `jj git clone https://github.com/GongJiYang/xuegen-vault ~/学根/库` 拉下来再把教材放回去。
2. **装程序**：GitHub Releases 下载学根，拖进「应用程序」，第一次打开前在终端运行 `xattr -dr com.apple.quarantine /Applications/学根.app`。装 jj：`brew install jj`。
3. **接上数据**（终端里运行，仓库里的设置脚本）：
   ```sh
   node <xuegen 仓库>/bin/xuegen-data-root.mjs ~/学根
   ```
   它会建 `~/.xuegen/sessions` → `会话`、`~/learning` → `工作区` 两个链接并写 `~/.xuegen/wiki.json`；加 `--dry-run` 先只看要做什么。已有链接或真实目录不会被覆盖。
4. **登录模型**：终端运行 `xuegen login`（或学根里按提示登录）。
5. **Anki**：装 Anki 和 AnkiConnect 插件，登录 AnkiWeb 同步。
6. **Obsidian**：「打开文件夹作为仓库」选 `~/学根/库`；社区插件按 `.obsidian/community-plugins.json` 里的列表重新装（插件设置已在仓库里）。
7. 打开学根，看总控今日卡和书房是否正常。

## 平时的备份

- 库：在 `~/学根/库` 里运行 `jj git push --bookmark main`（以后由学根在收课提交后自动做）。
- 会话、工作区、教材：暂时靠整机备份或手动拷贝；以后考虑放进第二个私有仓库或网盘。
