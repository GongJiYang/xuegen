# batch-shelf-1-review（DeepSeek）：给书房脚本补测试 + 审核基础代码

Devin 按 `docs/desktop/batch-shelf-1.md` 写完了基础代码（未提交）：`skills/reading/bookshelf.mjs`、`src/shared/data-protocol.ts`、`src/main/data/handler.ts`、`src/main/data/README.md`。你负责**测试与审核**：先对照任务单逐节审，发现问题直接修；再写测试。

## 硬约束

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/skills/AUTHORING.md`、`docs/desktop/batch-shelf-1.md`（规格）、`skills/reading/reading-queue.test.mjs`（测试写法照它：`node:test`、临时目录、`--today` 注入日期）。
- 测试只用临时目录，不读写 `~/.xuegen/`、不碰真实 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`。

## A. 审核（逐节对照规格，问题直接修）

逐条核对 `batch-shelf-1.md` §1–§5，重点看：
1. `chunksOf` 的切法是否严格是 `k = ceil(n/10)`、`size = ceil(n/k)`，最后一块到 `to` 为止，`index` 连续。
2. `parseSegments` 接受 `–` 与 `-` 两种连接号，坏行忽略。
3. `done`：只对 `status: reading` 生效；记录行格式 `- <today>: 第 N 段 pp.a–b 读完（用户自报）`；读完时 planned 自动开下一本（`started` = 明天、`position: 0`、写排期表），free 读完不自动开；最后重写 `index.md`。
4. `today`：`end = today + (total - position) - 1`、`plannedEnd = started + total - 1`、`late = max(0, end - plannedEnd)`；读完的书 `chunk: null`。
5. 写文件是原子写（先写临时文件再改名）；路径都在 `<vault>/wiki/书房/` 内，`slug` 不能逃出目录（含 `..`、`/` 的 slug 要 `fail`）。
6. 主进程：三个请求的运行时校验（`today` 是 ISO 日期、`slug` 匹配 `/^[a-z0-9-]+$/`）；非法请求被拒绝。

## B. 测试

1. 新建 `skills/reading/bookshelf.test.mjs`，至少覆盖：
   - `chunksOf`：36 页 → 4 块（9/9/9/9）；29 页 → 3 块（10/10/9）；1 页 → 1 块；多个分段连续编号。
   - `parseSegments`：两种连接号、坏行忽略、空节返回 `[]`。
   - `plan --write`：生成排期表、日期从 `started` 逐日递增；再跑一次替换而不是重复插入。
   - `today`：按时（late 0）、晚一天（late 1）、读完（chunk null）、目录不存在（`{planned:null, free:null}`）。
   - `done`：position +1 与记录行；最后一段读完 → `status: done` 且排队的下一本变 `reading`、`started` 为明天；free 读完不开下一本；对 `queued`/`done` 的书 `fail`；非法 slug `fail`。
   - `index --write`：三组归类正确。
2. `apps/desktop` 的 `data-protocol` 测试与 `handler.test.ts` 补：三个请求的合法与非法样例；`shelf.today` 在临时库里端到端返回预期对象（照 `handler.test.ts` 里现有的临时库写法）。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -3
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全部通过；`lint:skills` 不再有 `bookshelf.mjs` 缺测试的警告。

## 结束报告（中文）

1. 审核：§1–§5 每节的结论、发现的问题、你的修改。
2. 新增的测试清单（每条一句话）。
3. 验收输出。
4. 未完成项。
