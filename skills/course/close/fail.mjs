// 收课事务共用的致命出口。
// 独占的知识：失败信息怎么报（stderr 一行 `course-close:` 前缀）、怎么结束（process.exit(1)，不抛异常）。
// 对外接口：fail(message)。
// 调用方：close/ 下所有模块与 course-close.mjs——放在最底层，谁都能用、不依赖任何模块。
export function fail(message) {
  process.stderr.write(`course-close: ${message}\n`);
  process.exit(1);
}
