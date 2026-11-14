# batch-async-guard-a（DeepSeek，约 15 分钟，先写测试）：书房 / 阅读队列的写入连点只发一次

## 背景
11-12 修过「开课连点重复开会话」（`use-course-sessions.ts` 的 `opening` ref：开始加锁，then / catch 都释放）。同类入口还没查：点了发异步写入、结果晚到，期间再点会再发一次。

## 本单范围（只这两个文件）
1. `apps/desktop/src/renderer/core/board/use-shelf.ts`：`done(slug)`、`extract(slug, page, text)`。
2. `apps/desktop/src/renderer/core/board/use-reading.ts`：`add(...)`、`review(slug, ...)`。

## 要改
- 每个函数加同步锁（`useRef<Set<string>>`，键：`done:<slug>`、`extract:<slug>:<page>:<text>`、`add:<source>`、`review:<slug>`）。键已在集合里 → 不发请求，直接返回「没做」的值：`done` 返回 `false`、`extract` 返回 `null`（不报错）、`add` / `review` 返回与原类型一致的 `{ ok: false, error: "busy" }`——**先看原返回类型**，若 `error` 字段类型不允许字符串就用最接近的现成写法，报告里说明。
- 请求结束（成功、失败、抛错）都在 `finally` 里删键。
- 不改返回值的其他语义、不改 reload 逻辑。

## 测试（先写，先跑确认失败）
在各自同名 `.test.ts(x)`（没有就新建，照 `use-course-sessions.test.tsx` 的写法用假 client、手动控制 promise 何时 resolve）：
- 第一次请求未返回时再调一次 → `client.data` 只被调用 1 次。
- 第一次返回后再调 → 第 2 次照常发。
- 第一次抛错 → 锁释放，再调照常发。
- 不同 slug 互不影响（`done("a")` 未返回时 `done("b")` 照常发）。

## 不许做
- 只动上面两个文件和它们的测试；不加依赖；不 commit / push；不跑 prettier 整文件；**自己做完，不要调用别的 agent**。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files"
```

## 结束报告（中文）
改了哪些文件；先失败的测试名；验收输出最后几行；偏离之处。
