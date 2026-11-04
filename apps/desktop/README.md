# Xuegen Desktop

Xuegen 的 Electron 桌面版。设计见 `docs/desktop/ARCHITECTURE.md`，分批计划见 `docs/desktop/ROADMAP.md`。

独立 npm 项目，不影响根目录 CLI。进程划分：`src/main`（窗口与守护）、`src/agent`（Pi 会话与事件映射）、`src/preload`（最小类型化桥）、`src/renderer`（React 界面）、`src/shared`（三端共用协议）。

## 命令

```sh
npm ci          # 安装（含 devDependencies，见 .npmrc）
npm run typecheck
npm run lint
npm run format
npm test        # Vitest（jsdom）：纯函数模块 + core 内容/设置/聊天 + 皮肤契约测试
npm run build
npm run smoke   # 集成冒烟：创建会话、校验 skills/系统提示/扩展，不发模型请求
```
