# 概念页样例（收课时写）

照这个样子写，不用再去库里翻别的概念页找格式。章节名以库根 `AGENTS.md`「Concept Page」为准（与下面相同）。

- 位置：该科目的概念目录，如 `wiki/知识/concepts/math/`；文件名 `<三位序号>-<术语>.md`，序号接着目录里已有的最大号往后排（`ls` 一次即可）。
- 已有同名或同义页就补充，不重建。
- 一个术语一页；定义用自己的话写，不抄原书大段原文。

```markdown
---
sources: ["[[2026-11-05-epp-discrete-mathematics]] §1.2 pp.7–12"]
---

# 幂集与笛卡尔积

> 课程：[[courses/discrete-math-epp]] D1

## Definition
**幂集**（power set）$\mathcal{P}(A)$：$A$ 的全部子集组成的集合，含 $\emptyset$ 与 $A$ 本身；$|A| = n$ 时有 $2^n$ 个元素。
**笛卡尔积**（Cartesian product）$A \times B$：所有有序对 $(a, b)$ 的集合，$a \in A$，$b \in B$。

## How It Works
- 列幂集按大小分层：0 个元素、1 个、2 个……不漏不重。
- 有序对讲顺序：$(1, x) \ne (x, 1)$；集合不讲顺序：$\{1, x\} = \{x, 1\}$。

## Applications
- 关系是笛卡尔积的子集（D1 §1.3）。

## Related Concepts
- [[020-集合元素与子集]]、[[040-关系与函数]]

## Sources
- [[2026-11-05-epp-discrete-mathematics]] §1.2 pp.7–12
```

写完在 `wiki/index.md` 对应目录下补一行链接，`wiki/log.md` 记一条 `wiki`。
