---
sources: ["计算机程序的构造和解释（SICP）Ch2 §2.2 pp.41–60"]
---

# 闭包

## Definition

**闭包**（closure）是函数连同它捕获的外部变量一起形成的值。

## How It Works

- 函数返回后，被捕获的变量仍然可以被读写。
- 环境图里把函数和它的定义环境画在一起。

## Related Concepts

- [[knowledge/concepts/programming-paradigms/020-lexical-scope|词法作用域]]、[[knowledge/concepts/programming-paradigms/030-higher-order-function|高阶函数]]
