/**
 * Fixed samples for the skin gallery.
 *
 * The gallery renders every slot and every content kind with these, so a skin can
 * be reviewed (and screenshotted) without sending a model request. The Markdown
 * covers each node kind the content pipeline classifies.
 */

import type { ChatMessage, ModelInfo, ToolCallView } from "@shared/protocol.js";

export const SAMPLE_MARKDOWN = `## 二次函数的图像

**行内公式**：质能方程 $E=mc^2$，以及简单的二次函数 $y = ax^2 + bx + c$。

**块公式**：

$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

**表格**：

| 语言 | 类型 | 用途 |
| --- | --- | --- |
| TypeScript | 静态 | 界面与协议 |
| Markdown | 文本 | 学习状态唯一真相源 |

**Mermaid 图**：

\`\`\`mermaid
graph TD
  A[单赋值存储] --> B[合一]
  B --> C[数据流变量]
  A --> D[可变单元]
  style B fill-pattern
\`\`\`

**代码块**：

\`\`\`typescript
export function add(a: number, b: number): number {
  return a + b;
}
\`\`\`

**终端字符图**（设计稿「用图看一遍」）：

\`\`\`
┌───────┐   ┌───────┐   ┌───────┐
│ X = Y │──▸│ Y = 3 │──▸│ X = 4 │
└───────┘   └───────┘   └───────┘
  合一：X≡Y       绑定：X,Y→3    断言 3=4 → 失败 ✗
\`\`\`

\`\`\`text
本周练习正确率（满分 10）
单赋值存储 │██████████████████░░ 9
合一       │██████████████░░░░░░ 7
数据流变量 │████████░░░░░░░░░░░░ 4
可变单元   │████░░░░░░░░░░░░░░░░ 2
\`\`\`

\`\`\`
复习量  ⣀⣠⣤⣶⣾⣷⣶⣤⣀⣀⣠⣴⣾⣿⣷⣤
记忆率  ▂▃▅▆▇█▇▆▅▅▆▇██▇▆
\`\`\`

\`\`\`plain
╔══════════════╦════════════════════╗
║ 情形         ║ 结果               ║
╠══════════════╬════════════════════╣
║ X 未绑定     ║ 等待（数据流）     ║
║ X 已绑定为 3 ║ X=3 成功，X=4 失败 ║
╚══════════════╩════════════════════╝
\`\`\`

\`\`\`
╭─ 声明式模型
│  ├─ 单赋值存储
│  │  └─ 合一 ◆ 本周重点
│  └─ 数据流变量
╰─ 有状态模型
   └─ 可变单元 ○ 下周
\`\`\`

> [!note] 提示
> 先判断二次项系数的符号，再画图。

> [!warning] 注意
> 不要混淆顶点式与一般式。
`;

/**
 * The exercise sample is kept separate from {@link SAMPLE_MARKDOWN} because the
 * question callout routes to the Exercise slot, not to generic content.
 */
export const SAMPLE_QUESTION = `> [!question] 检验题：判断开口方向
> 若先执行 $X=Y$，再执行 $Y=3$，最后执行 $X=4$，会发生什么？为什么？`;

export const SAMPLE_MODELS: ModelInfo[] = [
  { provider: "anthropic", id: "claude", name: "Claude" },
  { provider: "openai", id: "gpt", name: "GPT" },
];

export const SAMPLE_TOOL_RUNNING: ToolCallView = {
  toolCallId: "gallery-running",
  toolName: "read_file",
  argsSummary: "{ path: 'wiki/courses/mech.md' }",
  status: "running",
};

export const SAMPLE_TOOL_SUCCESS: ToolCallView = {
  toolCallId: "gallery-success",
  toolName: "read_file",
  argsSummary: "{ path: 'wiki/courses/mech.md' }",
  status: "success",
  resultText: "# 机械可解释性课程\n\n本周活动：…",
};

export const SAMPLE_TOOL_ERROR: ToolCallView = {
  toolCallId: "gallery-error",
  toolName: "read_file",
  argsSummary: "{ path: 'missing.md' }",
  status: "error",
  resultText: "ENOENT: no such file or directory",
};

export const SAMPLE_USER_MESSAGE: ChatMessage = {
  id: "gallery-user",
  role: "user",
  markdown: "请解释一下二次函数的图像特征。",
  streaming: false,
  toolCalls: [],
};

export const SAMPLE_ASSISTANT_MESSAGE: ChatMessage = {
  id: "gallery-assistant",
  role: "assistant",
  markdown: SAMPLE_MARKDOWN,
  streaming: false,
  toolCalls: [],
};

export const SAMPLE_ERROR_MESSAGE: ChatMessage = {
  id: "gallery-error-message",
  role: "assistant",
  markdown: "部分内容生成失败。",
  streaming: false,
  toolCalls: [],
  errorMessage: "连接中断：模型返回错误。",
};

export const SAMPLE_STREAMING_MESSAGE: ChatMessage = {
  id: "gallery-streaming",
  role: "assistant",
  markdown: "正在思考，",
  streaming: true,
  toolCalls: [],
};
