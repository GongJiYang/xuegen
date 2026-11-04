# preload — 安全桥

通过 contextBridge 向渲染进程暴露最小、类型化的 API（`send`、`subscribe`、`getSettings`、`setSettings`）。渲染进程不得直接使用 Node 或 Electron 模块。
