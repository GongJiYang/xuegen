# main — 主进程

负责：窗口与菜单（自建菜单不含页面缩放项；页面缩放锁在 1，⌘+ / ⌘- 由渲染进程改正文档位）、IPC 路由（`IPC_CHANNEL` / `SETTINGS_CHANNEL` / `DATA_CHANNEL`）、启动与守护 agent 进程（崩溃时报告并可重启）、监听 `wiki/courses/*.md` 与 `notes/` 文件变化并通知渲染进程、读写界面设置 `~/.xuegen/desktop.json`（`settings.ts`，原子写入）、知识库数据通道（`data/`）。

不负责：模型调用、会话逻辑、界面渲染。

`data/`：数据通道实现——调用 skill 脚本、只读 AnkiConnect、技能列举与安装。详见 `data/README.md`。
