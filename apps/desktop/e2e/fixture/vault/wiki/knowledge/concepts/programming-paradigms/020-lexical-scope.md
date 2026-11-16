---
sources: ["计算机程序的构造和解释（SICP）Ch2 §2.2 pp.41–60"]
---

# 词法作用域

## Definition

**词法作用域**（lexical scope）是变量引用由代码的文本位置决定，而不是由调用位置决定。

## How It Works

- 自由变量在函数定义处的环境里查找。
- 改名不影响已经捕获的绑定关系。

## Related Concepts

- [[knowledge/concepts/programming-paradigms/010-closure|闭包]]、[[knowledge/concepts/programming-paradigms/040-state|状态]]
