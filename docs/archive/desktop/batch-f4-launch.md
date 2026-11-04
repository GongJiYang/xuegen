# F4：启动体验修复（用户第一次真实试用发现）

1. **默认皮肤**：新安装或 `desktop.json` 没有 `skin` 时默认 `chicago`（不再是 `bare`）。`bare` 仍可在「外观」中选择，但名称显示为「Bare（参照，无样式）」，让人知道它不是坏了。
2. **窗口不出现在最前面**：从终端 `npm run dev` 启动时，窗口创建且 `isVisible()` 为真，但被别的应用/桌面空间挡住，用户以为没启动。改为：`ready-to-show` 时 `show()` + `focus()` + `app.focus({ steal: true })`（仅 macOS 开发与首次启动）；另加保险：`did-finish-load` 后 2 秒仍未显示则强制显示。
3. **程序坞名称**：开发模式下 Dock 显示「Electron」。设置 `app.setName("学根")`（并在 macOS 上设置 Dock 图标为一个 1 位像素风的「学」字图标，PNG 放 `apps/desktop/resources/`，256×256，两色）。打包配置若有 `productName` 一并改为「学根」。
4. **`bodyScale` 兼容**：用户旧设置里有 `"bodyScale": 0.9`。Chicago 只支持整数倍（1 或 2），读取时把非整数映射为最接近的 1/2，并且不要覆盖用户其他皮肤的值。加测试。

验收：全部命令通过（typecheck、lint、test、build、smoke）；单元测试覆盖 1、4；2、3 在报告中写明实现方式。**不要启动开发版应用**（用户正在用 5173 端口的实例），不读写真实 `~/.xuegen`；不 git commit；中文简要报告。
