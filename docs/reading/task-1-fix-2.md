# 渐进阅读 · 任务 1 修复 2：库目录布局

## 问题

`reading-queue.mjs` 把命令参数 `<wiki>` 当成同时包含 `raw/` 和 `reading/` 的目录。真实库的布局是：

```text
<库根目录>/            ← wiki.json 的 root，命令参数传这个
├── raw/              ← 原文（只读）
├── Clippings/        ← 网页剪藏（只读）
└── wiki/
    ├── log.md
    ├── reading/<slug>.md
    └── extracts/<slug>/*.md
```

当前实现传库根目录时会在根目录下新建 `reading/` 和 `log.md`；传 `wiki/` 时又找不到 `raw/`。测试按错误布局搭建，所以没发现。

## 要求

1. 命令参数改名为 `<vault>`（库根目录），帮助文本与报错同步改名。
2. 路径解析：原文 = `<vault>/<相对路径>`（必须以 `raw/` 或 `Clippings/` 开头）；阅读页 = `<vault>/wiki/reading/`；摘录 = `<vault>/wiki/extracts/`；日志 = `<vault>/wiki/log.md`。
3. `<vault>/wiki/` 不存在时报错「不是 Wiki 库根目录」，不自动创建 `wiki/`（可以创建 `wiki/reading/`）。
4. `verify`：`source` 链接相对 `<vault>` 解析；Extracts 段的 `[[extracts/...]]` 链接相对 `<vault>/wiki` 解析。
5. 所有测试改为真实布局（临时目录下建 `raw/`、`Clippings/`、`wiki/`），并新增：
   - add 后 `<vault>/reading` 与 `<vault>/log.md` **不存在**，`<vault>/wiki/reading/<slug>.md` 与 `<vault>/wiki/log.md` 存在；
   - 传入没有 `wiki/` 子目录的路径时报错；
   - 原文在 `Clippings/` 下也能入队；
   - verify 能找到 `wiki/extracts/` 下的摘录链接。
6. 运行 `npm test` 并贴出输出；在临时目录按真实布局演示 add → review next → verify，贴出 `find` 结果证明文件位置正确。

只改 `skills/reading/reading-queue.mjs` 与其测试文件。不 git commit，不碰 `apps/desktop/`。中文简短报告。
