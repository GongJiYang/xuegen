# 动效批：明显、有节奏感

前置：修复 B 已验收。先读 `apps/desktop/AGENTS.md` 第 12、13 节（第 13 节已更新为「明显、有节奏感」档位及参数表），以及 `~/.commandcode/skills/` 下 `gsap-react`、`gsap-core`、`gsap-timeline`、`gsap-plugins`（Flip）、`gsap-performance`。只改 `src/renderer/` 与必要配置。

## 0. 动效参数集中化

新建 `src/renderer/motion/tokens.ts`：按第 13 节参数表导出时长、位移、缓动、间隔常量。现有两个 hook 改为引用这些常量，并按新档位调参。所有新动效只引用常量。

## 1. 消息出现（改造现有 `useMessageAppearAnimation`）

- 新消息：`autoAlpha 0→1`、`y 20→0`、`scale 0.98→1`，0.4s，`power3.out`。
- 加载历史（`history` 事件、切换会话）：消息按顺序依次出现，间隔 0.04s，总时长封顶 0.6s（超过 15 条时只对最后 15 条做依次动画，其余直接显示）。用一个列表级 hook（如 `useStaggeredAppear`）实现，不让每条消息各自计时。

## 2. 发送消息：Flip 飞入

- 用户点击发送时，消息内容从输入框位置移动到对话列表中的最终位置（GSAP Flip 插件，`Flip.getState` → 状态变更 → `Flip.from`），0.45s，`power3.out`。
- 输入框同时清空并轻微回弹（scale 0.99→1）。
- 减少动效时直接出现在列表中。

## 3. 思考中指示器

- 已发送、助手尚未产生第一个文本增量时，在助手位置显示三个点的跳动指示（循环周期 1s，`sine.inOut`，三点相位依次错开）。
- 收到第一个 `message-delta` 时指示器淡出（0.2s）并卸载，循环动画随之清理。
- 新增 `components/chat/ThinkingIndicator.tsx` 与 `hooks/useThinkingAnimation.ts`。

## 4. 工具卡片状态

- 运行中：状态 `Badge` 呼吸闪烁（opacity 0.6↔1，周期 1.1s，`sine.inOut`）。
- 完成：停止呼吸，`Badge` 颜色切换为成功/失败，同时做一次强调弹跳（scale 1→1.08→1，0.3s，`back.out(2)`）。
- 展开内容：沿用 `Collapsible` 的高度过渡，GSAP 内容淡入改用新参数。

## 5. 错误提示

- 错误 `Alert` 从顶部滑入（y -16→0，0.35s，`power3.out`），随后左右轻微抖动一次（x 0→-6→6→-3→0，总 0.3s）。
- 关闭或被新状态替换时向上滑出（0.2s，`power2.in`）。

## 6. 进度与数字组件（为看板准备）

- 新增通用 `components/motion/AnimatedNumber.tsx`（数值变化时从旧值滚动到新值，0.8s，`power2.out`）与 `components/motion/AnimatedProgress.tsx`（包装 shadcn `Progress`，指示条用 `scaleX` 从旧值过渡到新值，**不动画 width**）。
- 本批放进开发模式的「渲染示例」中演示（按钮触发随机值变化），第 2 批看板直接复用。

## 7. 暗色正文对比度

截图中暗色主题的消息正文明显偏灰。检查正文是否误用 `text-muted-foreground` 或残留透明度，正文改为 `text-foreground`，确保两种主题下正文与背景对比度达到 WCAG AA（4.5:1）。

## 测试

- 纯函数部分写单元测试：依次动画的截断规则（>15 条只动最后 15 条）、tokens 取值范围符合第 13 节表格。
- 动画本身不写快照测试。

## 验收

- 修复 A 的全部命令仍通过（typecheck、lint、test、build、smoke）。
- `npm run dev` 下用「渲染示例」与一次模拟流程（不发模型请求：开发模式可注入假的 agent 事件序列：发送 → 思考中 → 文本流 → 工具运行 → 工具成功 → 错误）逐项演示 1–6。
- 用 CDP 或 Electron 录制演示过程，保存为 `docs/desktop/screenshots/motion-demo.mp4`（或连续截图 `motion-*.png`，每项至少一张中间帧）。
- 打开系统「减少动态效果」时再验证一次：无循环动画、元素直接到终态（在报告中说明验证方法）。
- 报告逐项说明处理结果。不 git commit。
