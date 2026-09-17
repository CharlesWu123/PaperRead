# 05 图像生成（MACRO）

论文：**MACRO: Advancing Multi-Reference Image Generation with Structured Long-Context Data**
（[arXiv:2603.25319](https://arxiv.org/abs/2603.25319)）

本目录含两份**互相独立**的解读。它们不是「精简版 / 完整版」的扩写关系——抽查正文片段无任何重叠，是同一篇论文的两次独立撰写，可对照阅读。

| 文件 | 章节侧重 |
| --- | --- |
| `2603.25319v1_reading_report.html` | 背景与动机、预备知识、方法详解、实验分析、**源码对应关系**、讨论、局限分析、**结论** |
| `macro_analysis.html` | 研究背景与动机、预备知识、方法详解、实验分析、讨论、局限分析 |

- `2603.25319v1.pdf` — 原文 PDF（未入库，仅本地保留）

项目页 <https://macro400k.github.io/> · 代码 <https://github.com/HKU-MMLab/Macro>

## 说明

本专题与其他专题（视频编辑、Agent 自进化）的主题相对独立：MACRO 做的是多参考图**生成**，
关注长上下文结构化数据如何提升多主体一致性与指令遵循。
