# 日期截图（收课第 7 步，commit 之前）

截图展示课程、报告日期、总目标、本周任务和总目标里程碑的完成数、真实作答证据、下次起点。完成数由脚本计算，标签说明统计粒度；没有目标时显示“尚未设定”，不显示虚假的 0% 或掌握率。某模块已有讲解/作答但未满足验收条件时，既保持未勾选，也在证据区说明已经做过什么。

截图用 `course_close` 的 `snapshot` 动作在沙盒外生成（bash 在系统沙盒里起不了 Chrome，不要用 bash 跑 `render-snapshot.mjs`）：

1. 用写文件工具把报告 JSON 写进本次暂存目录根下的 `.snapshot.json`（**点开头**，不进收课清单；格式见下）。`source` 是课程页的绝对路径，脚本只读它。
2. 调 `course_close`：`action: "snapshot"`、`staging: <暂存目录>`、`report: ".snapshot.json"`、`out: "wiki/courses/<slug>/snapshots/YYYY-MM-DD-NN.png"`（两个都是暂存目录内的相对路径）。
3. 成功返回 `{ "snapshot": "<png 相对路径>" }`，图随后续 `check`/`commit` 一起提交和上锁；失败时暂存里不留半张图，照返回的原因告诉用户，进度照常提交。

报告 JSON：

```json
{
  "title": "课程名称 · 收课记录",
  "date": "2026-10-16",
  "source": "/实际课程路径/course.md",
  "goal": "已经与用户约定的总目标",
  "week": {"label": "W1 · 本周活动", "tasks": [{"label": "原计划任务", "done": false, "detail": "尚未满足原验收条件"}]},
  "overall": {"label": "全程里程碑", "tasks": [{"label": "原计划里程碑", "done": false}]},
  "evidence": ["真实作答片段或核实结果，不能把示例当事实"],
  "next": "从已有记录确定的下一步",
  "note": "必要时说明证据范围、未知项或计划缺口"
}
```

上述路径、日期和内容均须替换。`done` 只接受布尔值，不传字符串；从已保存的原任务/验收结果逐项提取。核对源文件后才调用，不把模型刚生成但未保存的计划当来源。截图日期是实际收课/报告日期；复盘旧会话时另外在证据中注明原会话日期，不能伪装为当天新学。

图片放在 `wiki/courses/<slug>/snapshots/YYYY-MM-DD-NN.png`（本次收课的暂存目录里同一路径），由 `commit` 随事务上锁；再用库内相对链接嵌入对应记录，例如 `![[courses/<slug>/snapshots/YYYY-MM-DD-NN.png|600]]`；回复里只说「出了今天的进度图」，不贴图片路径。已有图片不会被覆盖；重复收课直接引用已有图片。未安装浏览器或渲染失败时，保留已保存的 Markdown，明确说明「进度已保存，截图失败」及原因，不谎报截图完成，不自动安装软件。
