// 撤销时把一批文件恢复到某个 jj 修订的内容：先临时放开只读锁，一次 jj restore
// 传全部路径（中间某个失败时不会已经撤了一半），无论成败都把权限锁回去。
// 独占的知识：只读锁的放开范围（库内祖先目录 0700、文件本身 0200）与恢复顺序。
// 对外接口：restoreFiles(vault, fromRev, files)。
// 调用方：course-close.mjs（cmdUndo）、plan-undo.mjs。
import { chmodSync, existsSync, statSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fail } from "./fail.mjs";
import { filesetLiteral, jj } from "./jj.mjs";

/**
 * 把 files（库内相对路径）恢复成 fromRev 修订里的内容（写入工作副本 @）。
 * 放开可能上了只读锁的课程目录与文件，记下原权限事后恢复；jj restore 失败时
 * 也先恢复权限再 fail。重新上锁（lockCourse）由调用方负责。
 */
export function restoreFiles(vault, fromRev, files) {
  const restored = new Map();
  const open = (abs, bits) => {
    const mode = statSync(abs).mode & 0o777;
    if (mode & 0o200) return;
    if (!restored.has(abs)) restored.set(abs, mode);
    chmodSync(abs, mode | bits);
  };
  for (const rel of files) {
    const abs = join(vault, rel);
    let dir = dirname(abs);
    // 只放开库内的祖先目录（用 relative 判断，避免 /vault2 被 startsWith("/vault") 误当成库内）。
    while (existsSync(dir) && dir !== vault) {
      const up = relative(vault, dir);
      if (up === "" || up.startsWith("..") || posix.isAbsolute(up)) break;
      open(dir, 0o700);
      dir = dirname(dir);
    }
    if (existsSync(abs) && statSync(abs).isFile()) open(abs, 0o200);
  }
  const putBack = () => {
    for (const [dir, mode] of restored) {
      try {
        chmodSync(dir, mode);
      } catch {
        /* 恢复失败不遮主错 */
      }
    }
  };
  try {
    jj(["restore", "--from", fromRev, "--to", "@", "--", ...files.map(filesetLiteral)], vault);
  } catch (error) {
    putBack();
    fail(`jj restore 失败：${error instanceof Error ? error.message : error}`);
  }
  putBack();
}
