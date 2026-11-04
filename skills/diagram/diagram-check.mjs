#!/usr/bin/env node
// Xuegen diagram 校验：允许字符集、显示宽度（中文按 2 列）、笔画连通、列错位。
// 无第三方依赖。用法：
//   node diagram-check.mjs <file>
//   node diagram-check.mjs -            # 从 stdin 读
//   node diagram-check.mjs --json <file>
// 退出码：无错误 0，有错误 1。
import { readFileSync } from "node:fs";

// ---- 允许的字符集 ----

// 单列允许的符号（非 ASCII、非全角、非制表/方块/盲文）。
const SYMBOLS = new Set(
  "←→↑↓↔↕⇐⇒⇔■□▪▫●○◆◇▲△▼▽▶▷◀◁▸▾•·…✓✗★☆",
);

function isAscii(ch) {
  const cp = ch.codePointAt(0);
  return cp >= 0x20 && cp <= 0x7e;
}

// 中文与全角标点：CJK 及常见全角区间。
function isFullWidth(ch) {
  const cp = ch.codePointAt(0);
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // 韩文字母
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK 部首、标点
    (cp >= 0x3041 && cp <= 0x33ff) || // 假名、CJK 兼容
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK 扩展 A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK 统一表意
    (cp >= 0xa000 && cp <= 0xa4cf) || // 彝文
    (cp >= 0xac00 && cp <= 0xd7a3) || // 韩文音节
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK 兼容表意
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK 兼容形式
    (cp >= 0xff00 && cp <= 0xff60) || // 全角形式
    (cp >= 0xffe0 && cp <= 0xffe6) || // 全角符号
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK 扩展 B 及以上
  );
}

// 允许字符集里的「制表与方块」：U+2500–259F（含方块元素 █░）。
function isBoxDrawing(ch) {
  const cp = ch.codePointAt(0);
  return cp >= 0x2500 && cp <= 0x259f;
}

// 是否有框线笔画：U+2500–257F 的制表符号。
function hasFrame(ch) {
  const cp = ch.codePointAt(0);
  return cp >= 0x2500 && cp <= 0x257f;
}

function isBraille(ch) {
  const cp = ch.codePointAt(0);
  return cp >= 0x2800 && cp <= 0x28ff;
}

function isAllowed(ch) {
  if (ch === " " || ch === "\t") return true;
  return (
    isAscii(ch) ||
    isFullWidth(ch) ||
    isBoxDrawing(ch) ||
    isBraille(ch) ||
    SYMBOLS.has(ch)
  );
}

// ---- 显示宽度 ----

function charWidth(ch) {
  const cp = ch.codePointAt(0);
  if (cp < 0x20) return 0;
  if (isFullWidth(ch)) return 2;
  return 1;
}

function lineWidth(line) {
  let w = 0;
  for (const ch of line) w += charWidth(ch);
  return w;
}

// 宽字符第二列等在显示上被占用的「延续格」。
const WIDE_TAIL = "\u0000";

// 生成「显示列 → 字符」映射。宽字符占首列，其余列标为延续格；
// 行尾之后的列不记录（视为出界）。
function cellsOf(line) {
  const cells = new Map();
  let col = 0;
  for (const ch of line) {
    const w = charWidth(ch);
    if (w > 0) cells.set(col, ch);
    for (let k = 1; k < w; k += 1) cells.set(col + k, WIDE_TAIL);
    col += w;
  }
  return cells;
}

// ---- 笔画表（U+2500–257F）----
// 值用字符串表示四向笔画：u=上 d=下 l=左 r=右。由 Unicode 名称生成后内联为常量，
// 运行时不依赖任何名称库。虚线（DASH）与纯直线一样视为直线。
const STROKE_NAMES =
  "2500:lr,2501:lr,2502:ud,2503:ud,2504:lr,2505:lr,2506:ud,2507:ud," +
  "2508:lr,2509:lr,250a:ud,250b:ud,250c:dr,250d:dr,250e:dr,250f:dr," +
  "2510:dl,2511:dl,2512:dl,2513:dl,2514:ur,2515:ur,2516:ur,2517:ur," +
  "2518:ul,2519:ul,251a:ul,251b:ul,251c:udr,251d:udr,251e:udr,251f:udr," +
  "2520:udr,2521:udr,2522:udr,2523:udr,2524:udl,2525:udl,2526:udl,2527:udl," +
  "2528:udl,2529:udl,252a:udl,252b:udl,252c:dlr,252d:dlr,252e:dlr,252f:dlr," +
  "2530:dlr,2531:dlr,2532:dlr,2533:dlr,2534:ulr,2535:ulr,2536:ulr,2537:ulr," +
  "2538:ulr,2539:ulr,253a:ulr,253b:ulr,253c:udlr,253d:udlr,253e:udlr,253f:udlr," +
  "2540:udlr,2541:udlr,2542:udlr,2543:udlr,2544:udlr,2545:udlr,2546:udlr,2547:udlr," +
  "2548:udlr,2549:udlr,254a:udlr,254b:udlr,254c:lr,254d:lr,254e:ud,254f:ud," +
  "2550:lr,2551:ud,2552:dr,2553:dr,2554:dr,2555:dl,2556:dl,2557:dl," +
  "2558:ur,2559:ur,255a:ur,255b:ul,255c:ul,255d:ul,255e:udr,255f:udr," +
  "2560:udr,2561:udl,2562:udl,2563:udl,2564:dlr,2565:dlr,2566:dlr," +
  "2567:ulr,2568:ulr,2569:ulr,256a:udlr,256b:udlr,256c:udlr," +
  "256d:dr,256e:dl,256f:ul,2570:ur," +
  "2574:l,2575:u,2576:r,2577:d,2578:l,2579:u,257a:r,257b:d," +
  "257c:lr,257d:ud,257e:lr,257f:ud";

const STROKES = new Map();
for (const part of STROKE_NAMES.split(",")) {
  const [hex, dirs] = part.split(":");
  STROKES.set(parseInt(hex, 16), dirs);
}

// 箭头：可作为笔画的可接端点。
const ARROWS = new Set("▶▸→◀◁←▼▾↓▲▫△▽↑");

function strokesOf(ch) {
  return STROKES.get(ch.codePointAt(0)) || "";
}

// 有笔画、且不是纯直线的角与交叉点（用于连通检查）。
function isStraight(dirs) {
  return dirs === "ud" || dirs === "lr";
}

// 纯竖线（含粗/双线、虚线）。
function isVertical(dirs) {
  return dirs === "ud";
}

// 角：恰好两笔且互相垂直。
function isCorner(dirs) {
  return dirs.length === 2 && !isStraight(dirs);
}

// 向「左收口」的角（┐┘╮╯ 等）：其竖笔要求严格连通。
function isClosingCorner(dirs) {
  return isCorner(dirs) && dirs.includes("l") && !dirs.includes("r");
}

const OPPOSITE = { u: "d", d: "u", l: "r", r: "l" };
const DIR_OFFSET = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
const DIR_LABEL = { u: "上", d: "下", l: "左", r: "右" };

// 判断某格在该方向上是否「接得上」。
// strict=false（角/竖线）：接得上＝有相反笔画 / 箭头 / 文字（并入标签）/ 出界。
// strict=true （左收口的角）：只有相反笔画 / 箭头 / 出界才算接上。
// 对空格一律视为断开。
function connects(grid, line, col, dir, strict) {
  const [dx, dy] = DIR_OFFSET[dir];
  const nl = line + dy;
  const nc = col + dx;
  if (nl < 0 || nl >= grid.length) return true; // 出界：开放
  const nb = grid[nl].get(nc);
  if (nb === undefined) return true; // 出界（同行更短）：开放
  if (nb === " ") return false; // 空格：断开
  if (ARROWS.has(nb)) return true; // 箭头：端点
  const nd = strokesOf(nb);
  if (nd.includes(OPPOSITE[dir])) return true; // 有相反笔画：连通
  if (nd) return strict ? false : true; // 是笔画但方向不对：严格角断开
  return strict ? false : true; // 文字/宽字延续：严格角断开，其余并入标签
}

function validate(text) {
  const issues = [];
  const rawLines = text.replace(/\n$/, "").split("\n");

  if (rawLines.length === 0 || rawLines.every((l) => l.trim() === "")) {
    return { issues: ["空图"], lines: 0, maxWidth: 0, ok: false };
  }

  // 检查 1：允许字符集。制表符单独报。
  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i];
    let col = 0;
    for (const ch of line) {
      if (ch === "\t") {
        issues.push(`第 ${i + 1} 行：包含制表符（只允许空格）`);
        col += 1;
        continue;
      }
      if (!isAllowed(ch)) {
        const cp = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
        issues.push(
          `第 ${i + 1} 行第 ${col + 1} 列：字符 '${ch}'（U+${cp}）不在允许字符集内`,
        );
      }
      col += charWidth(ch);
    }
  }

  const widths = rawLines.map(lineWidth);
  const grid = rawLines.map(cellsOf);

  // 检查 2：笔画连通。角与交叉点的每个方向都要接得上；纯直线两端可开放。
  for (let i = 0; i < rawLines.length; i += 1) {
    for (const [col, ch] of grid[i]) {
      const dirs = strokesOf(ch);
      if (!dirs) continue;
      const closing = isClosingCorner(dirs);
      if (isCorner(dirs) && closing) {
        // 左收口的角：竖笔要求严格连通（文字/空格都算断）。
        for (const dir of ["u", "d"]) {
          if (!dirs.includes(dir)) continue;
          if (!connects(grid, i, col, dir, true)) {
            issues.push(
              `第 ${i + 1} 行第 ${col + 1} 列：'${ch}' 的${DIR_LABEL[dir]}方断开（无竖线相连）`,
            );
          }
        }
      } else if (isCorner(dirs)) {
        // 右开口的角：竖笔可并入文字，但不能对空。
        for (const dir of ["u", "d"]) {
          if (!dirs.includes(dir)) continue;
          if (!connects(grid, i, col, dir, false)) {
            issues.push(
              `第 ${i + 1} 行第 ${col + 1} 列：'${ch}' 的${DIR_LABEL[dir]}方断开（无竖线相连）`,
            );
          }
        }
      } else if (isVertical(dirs)) {
        // 纯竖线：上下可开放（图外），但不能对空。
        for (const dir of ["u", "d"]) {
          if (!connects(grid, i, col, dir, false)) {
            issues.push(
              `第 ${i + 1} 行第 ${col + 1} 列：'${ch}' 的${DIR_LABEL[dir]}方断开（无竖线相连）`,
            );
          }
        }
      }
    }
  }

  // 检查 3：方框边框完整（同一行相邻两角之间只能是横线、T 形、空格）。
  for (let i = 0; i < rawLines.length; i += 1) {
    const grid_line = grid[i];
    const cornerCols = [];
    for (const [col, ch] of grid_line) {
      if (isCorner(strokesOf(ch)) && ch !== WIDE_TAIL) cornerCols.push(col);
    }
    cornerCols.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cornerCols.length; k += 2) {
      const startCol = cornerCols[k];
      const endCol = cornerCols[k + 1];
      const between = [];
      for (let c = startCol + 1; c < endCol; c += 1) {
        const ch = grid_line.get(c);
        if (ch !== undefined) between.push(ch);
      }
      const allowed = (ch) => {
        const d = strokesOf(ch);
        return ch === " " || ch === WIDE_TAIL || (d && d.includes("l") && d.includes("r"));
      };
      if (between.length > 0 && between.some((ch) => !allowed(ch))) {
        issues.push(
          `第 ${i + 1} 行：边框断裂，列 ${startCol + 1}–${endCol + 1} 之间为 '${between.join("")}'`,
        );
      }
    }
  }

  // 检查 4：边框行上、最外侧两角之外出现非空格字符 → 框外字符。
  for (let i = 0; i < rawLines.length; i += 1) {
    const grid_line = grid[i];
    const cornerCols = [];
    for (const [col, ch] of grid_line) {
      if (isCorner(strokesOf(ch)) && ch !== WIDE_TAIL) cornerCols.push(col);
    }
    if (cornerCols.length < 2) continue;
    const left = Math.min(...cornerCols);
    const right = Math.max(...cornerCols);
    // 仅当本行是一条横向线（除框角外只有横线/空格）时才检查框外字符。
    let isRuleLine = true;
    for (const [col, ch] of grid_line) {
      if (col < left || col > right) continue;
      if (ch === " " || ch === WIDE_TAIL) continue;
      if (isCorner(strokesOf(ch))) continue;
      const d = strokesOf(ch);
      if (!(d && d.includes("l") && d.includes("r"))) isRuleLine = false;
    }
    if (!isRuleLine) continue;
    for (const [col, ch] of grid_line) {
      if (ch !== " " && ch !== WIDE_TAIL && (col < left || col > right)) {
        issues.push(
          `第 ${i + 1} 行：框外字符 '${ch}'（列 ${col + 1}，越出框线 ${left + 1}–${right + 1}）`,
        );
      }
    }
  }

  // 检查 5：列错位（无框多栏）。同一块内，≥ 2 行在「≥ 2 个空格之后」开始的
  // 文字块起始列彼此相差 1–2 列，报「疑似列错位」；差 0 或 ≥ 3 不报。
  const hasFrameLine = rawLines.some((l) => [...l].some((c) => hasFrame(c)));
  if (!hasFrameLine) {
    const startsByRank = [];
    for (let i = 0; i < rawLines.length; i += 1) {
      const line = rawLines[i];
      const runs = [];
      let col = 0;
      let runStart = null;
      let spaceRun = 0;
      for (const ch of line) {
        const w = charWidth(ch);
        if (ch === " ") {
          if (runStart !== null) {
            runs.push({ start: runStart, endCol: col });
            runStart = null;
          }
          spaceRun += w;
        } else {
          if (runStart === null && col > 0 && spaceRun >= 2) runStart = col;
          spaceRun = 0;
        }
        col += w;
      }
      if (runStart !== null) runs.push({ start: runStart, endCol: col });
      // 只取第 2 个及以后、且在 ≥2 空格后开始的文字块。
      const cont = runs.filter((r) => r.start > 0).map((r) => r.start);
      for (let k = 0; k < cont.length; k += 1) {
        (startsByRank[k] ||= []).push({ line: i, col: cont[k] });
      }
    }
    for (const group of startsByRank) {
      if (!group || group.length < 2) continue;
      const cols = group.map((g) => g.col);
      const min = Math.min(...cols);
      const max = Math.max(...cols);
      const diff = max - min;
      if (diff !== 1 && diff !== 2) continue;
      // 若多数行起始列一致（如表格表头比数据宽），视为按列对齐，不报。
      const counts = new Map();
      for (const c of cols) counts.set(c, (counts.get(c) || 0) + 1);
      const maxCount = Math.max(...counts.values());
      if (maxCount * 2 >= group.length) continue;
      const detail = group
        .map((g) => `第 ${g.line + 1} 行起始列 ${g.col}`)
        .join("，");
      issues.push(`疑似列错位（右栏起始列相差 ${diff} 列）：${detail}`);
    }
  }

  const maxWidth = Math.max(...widths);
  return { issues, lines: rawLines.length, maxWidth, ok: issues.length === 0 };
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const positional = argv.filter((a) => a !== "--json");

  if (positional.length === 0 || positional[0] === "--help" || positional[0] === "-h") {
    process.stdout.write(
      "用法：node diagram-check.mjs [--json] <file | ->\n" +
        "  <file>  读取文件；'-' 从 stdin 读取。\n" +
        "  --json  输出机器可读结果。\n" +
        "退出码：无错误 0，有错误 1。\n",
    );
    process.exit(positional.length === 0 ? 1 : 0);
  }

  const target = positional[0];
  let text;
  try {
    text = target === "-" ? readFileSync(0, "utf8") : readFileSync(target, "utf8");
  } catch (error) {
    process.stderr.write(`diagram-check: 无法读取 ${target}：${error.message}\n`);
    process.exit(2);
  }

  const result = validate(text);

  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: result.ok,
          lines: result.lines,
          maxWidth: result.maxWidth,
          issues: result.issues,
        },
        null,
        2,
      )}\n`,
    );
  } else if (result.ok) {
    process.stdout.write(`OK：${result.lines} 行，最大宽度 ${result.maxWidth} 列\n`);
  } else {
    for (const issue of result.issues) process.stdout.write(`${issue}\n`);
  }

  process.exit(result.ok ? 0 : 1);
}

main();
