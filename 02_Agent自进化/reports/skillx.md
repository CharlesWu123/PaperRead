# SkillX: Automatically Constructing Skill Knowledge Bases for Agents

## 论文信息
- 标签：skill knowledge base；what=hierarchical SkillKB；when=iterative expansion；how=refinement + exploratory expansion；where=skill KB construction
- 中文定位：自动构建层次技能知识库
- 作者：Chenxi Wang / Zhuoyun Yu / Xin Xie / Wuguannan Yao / Runnan Fang / Shuofei Qiao / Kexin Cao / Guozhou Zheng 等
- 年份：2026
- arXiv：2604.04804
- PDF：https://arxiv.org/pdf/2604.04804
- 代码：https://github.com/zjunlp/SkillX

## 一句话总结
SkillX 的核心价值是：适合用于企业内部工作流：先让强模型在标准任务上跑出技能，再把 SkillKB 下放给低成本执行 Agent。

## 这篇论文解决什么问题
单个 Agent 在自己的任务里学到的经验很碎，不能自然形成体系化技能库。SkillX 要解决的是如何自动构建一个可插拔、可扩展、可供弱 Agent 使用的 Skill Knowledge Base。

如果放到 Agent skill 自进化的大图里，它解决的不是“模型有没有知识”，而是“Agent 如何把执行经验变成之后能稳定复用的外部能力”。这类外部能力可能是 `SKILL.md`、技能库、prompt、程序性记忆、world model、verifier 或 curator。区别只在于它把经验沉淀到哪一层。

## 方法图：先抓住机制闭环

```mermaid
flowchart LR
    N1["Seed tasks"]
    N2["Multi-level skills"]
    N1 --> N2
    N3["Refinement"]
    N2 --> N3
    N4["Exploration expansion"]
    N3 --> N4
    N5["SkillKB reuse"]
    N4 --> N5
```

这张图可以按从左到右读：左边是问题或数据来源，中间是论文提出的关键机制，右边是更新后的能力如何被复用或验证。读这篇论文时，最重要的是不要只看最后的分数，而要看中间那一层到底把什么东西变成了什么。

## 核心创新点
1. SkillX 的核心价值是：适合用于企业内部工作流：先让强模型在标准任务上跑出技能，再把 SkillKB 下放给低成本执行 Agent。
2. 它把方法链条明确拆成 Seed tasks → Multi-level skills → Refinement → Exploration expansion → SkillKB reuse 这样的闭环，中间每一步都在把原始轨迹压缩成更稳定的中间表示，而不是把所有经验原样塞给模型。
3. 它不是只证明“能写出 skill”，而是尽量证明“更新后的 skill / repo / curator / verifier / policy 能在后续任务里稳定被复用”。

这三点合在一起，说明这篇论文关注的不是孤立模块，而是一个能持续积累的外部能力系统。读的时候先盯住这三件事：输入是什么、哪一步发生了真正的压缩或筛选、最后能不能复用到别的任务或别的模型上。

## 方法详解

### 1. 从种子任务中抽取多层技能
SkillX 的目标不是让 Agent 为单个任务临时总结经验，而是自动构建 Skill Knowledge Base。它先让能力较强的 backbone agent 在一批 seed tasks 上执行，通过轨迹、工具调用和结果反馈归纳技能。

这些技能不是平铺的一组规则，而是多层结构：上层偏战略计划，描述一类任务的大方向；中层偏功能技能，描述完成子目标的流程；底层偏原子技能，描述具体操作或工具使用方式。多层结构让 SkillKB 更容易检索、组合和迁移给较弱执行 Agent。

### 2. 对已有技能做 iterative refinement
初始技能往往粗糙，可能触发条件不清、步骤过泛、示例不足或和其它技能重叠。SkillX 通过迭代式 refinement 根据任务反馈修订已有技能：把过宽的技能加边界，把过窄的技能抽象化，把冲突技能重写成条件化规则。

这一步的意义是让 SkillKB 从“自动生成的经验集合”变成“可维护的知识库”。如果只做一次性生成，SkillKB 很容易变成噪声和重复规则的堆积。

### 3. 用 exploratory expansion 补齐覆盖盲区
仅靠 seed tasks 会造成技能覆盖不足。SkillX 通过 exploratory skills expansion 主动寻找 SkillKB 没有覆盖或覆盖较弱的任务区域，生成新的任务变体或探索方向，再从这些执行中补充技能。

这让 SkillKB 的增长不是被动等待失败，而是主动扩展长尾能力。对企业工作流来说，这一步很关键：标准任务只能覆盖高频流程，真正影响可用性的往往是边界条件和低频组合任务。

### 4. 组织成可插拔、可检索、可组合的 SkillKB
最终产物是 SkillKB，而不是一份线性文档。执行 Agent 在推理时可以检索相关技能，并按任务需要组合上层计划、中层流程和底层操作。这样，强模型从任务中提炼出的技能可以下放给低成本或弱 backbone agent 使用。

SkillX 的重点是知识库构建和迁移：强 Agent 的经验被外化成可插拔资产，后续 Agent 不需要重新经历全部探索过程。

## 机制拆解表：输入、处理、输出

| 环节 | 输入 | 处理 | 输出 |
| --- | --- | --- | --- |
| Seed tasks | 标准任务、强 backbone agent、执行轨迹和反馈 | 从成功/失败轨迹中归纳可复用操作和任务结构 | 初始技能候选 |
| Multi-level skills | 初始候选、任务层次、工具调用模式 | 拆成战略计划、功能技能、原子技能等层级 | 层次化 SkillKB 草稿 |
| Refinement | SkillKB 草稿、评估反馈、冲突和重复技能 | 修订触发条件、步骤、边界和示例，合并或重写弱技能 | 更稳定的 SkillKB 版本 |
| Exploration expansion | 当前 SkillKB、未覆盖任务区域、探索策略 | 主动生成或选择新任务以发现长尾技能缺口 | 新技能和覆盖范围扩展 |
| SkillKB reuse | 成熟 SkillKB、弱执行 Agent、新任务 | 检索并组合多层技能辅助执行 | 跨模型复用的任务收益 |

这张表的重点是：SkillX 不是轨迹检索方法，而是把强 Agent 的经验整理成层次化、可扩展、可下放的 Skill Knowledge Base。

## 实验与证据怎么理解
实验显示，自动构建的 SkillKB 能提升弱基座 Agent 在复杂交互任务中的成功率和效率，说明强 Agent 的经验可以外化后迁移给弱 Agent。

更具体地说，读实验时建议抓三条线：第一，是否有和无 skill / 旧 skill / 新 skill 的公平对比；第二，是否证明收益来自 skill 本身，而不是模型或 prompt 其他部分变化；第三，是否展示跨任务、跨模型或 OOD 的迁移能力。只有同时满足这些条件，才能说明它真的是“自进化能力”，而不是一次性的 benchmark 调参。


## 一个具体例子

可以把它想成把经验整理成百科目录：上层是战略计划，中层是功能技能，底层是原子操作。

假设一个 Agent 连续处理十个相似任务。如果它每次都从零推理，那只是“会做题”；如果它能从前几次任务中提炼出规则、检查点、工具调用顺序或失败规避策略，并在后面任务中稳定复用，那才是这篇论文关心的自进化。

## 和相关方法的差异

| 对象 | 做法 | 关键差异 |
| --- | --- | --- |
| Memory bank | 保存原始或半结构化经验 | 检索负担大，体系弱 |
| Trace2Skill | 把轨迹压缩成 skill directory | 偏轨迹池到 SOP |
| SkillX | 构建层次 SkillKB | 偏系统化知识库构建和主动扩展 |

这张表的重点是定位：同样都叫 self-evolving，不同论文改的层完全不同。有的改记忆，有的改 prompt，有的改 skill 文档，有的训练 curator 或 policy。把层级分清楚，论文就容易读很多。

## 适合怎么读
- 先看论文把经验沉淀到哪里：记忆、skill、prompt、policy、verifier、world model，还是 SkillRepo。
- 再看它如何防止坏经验进入系统：是否有 verifier、held-out gate、reward、score-based maintenance 或人工审核。
- 最后看它如何证明迁移：跨任务、跨模型、跨用户、跨环境，至少要有一种。

## 局限与风险
它对 backbone agent 的能力依赖较强；如果种子任务覆盖不足，主动扩展仍可能遗漏关键技能。

从工程角度还要额外警惕两点。第一，skill 越自进化，越容易把错误规则长期固化；第二，skill 越共享，越需要权限、来源、版本和回滚机制。论文实验里有效，不代表上线系统里可以无审核运行。

## 工程启发
适合用于企业内部工作流：先让强模型在标准任务上跑出技能，再把 SkillKB 下放给低成本执行 Agent。

如果把这篇论文转成可落地方案，我会把它拆成四个组件：经验采集器、技能更新器、验证器、发布/回滚器。没有验证器和回滚器的“自进化”，本质上只是自动改文件，风险很高。
