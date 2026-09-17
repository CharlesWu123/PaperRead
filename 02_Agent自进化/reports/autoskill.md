# AutoSkill: Experience-Driven Lifelong Learning via Skill Self-Evolution

## 论文信息
- 标签：memory / personalization；what=long-term skill memory；when=across sessions；how=extract/structure/revise；where=personalized agent memory
- 中文定位：长期个性化 Skill 层
- 作者：Yutao Yang / Junsong Li / Qianjun Pan / Bihao Zhan / Yuxuan Cai / Lin Du / Jie Zhou / Kai Chen 等
- 年份：2026
- arXiv：2603.01145
- PDF：https://arxiv.org/pdf/2603.01145
- 代码：未在当前元数据中明确；需要按论文题名继续查官方仓库。

## 一句话总结
AutoSkill 的核心价值是：适合做个人或团队 Agent 的长期记忆层，但必须提供删除、过期和冲突处理。

## 这篇论文解决什么问题
用户偏好和长期工作方式常常只存在会话上下文里，跨 session 后丢失。AutoSkill 要把交互经验升级为显式 skill，使 Agent 逐渐适应用户。

如果放到 Agent skill 自进化的大图里，它解决的不是“模型有没有知识”，而是“Agent 如何把执行经验变成之后能稳定复用的外部能力”。这类外部能力可能是 `SKILL.md`、技能库、prompt、程序性记忆、world model、verifier 或 curator。区别只在于它把经验沉淀到哪一层。

## 方法图：先抓住机制闭环

```mermaid
flowchart LR
    N1["Interaction history"]
    N2["Skill extraction"]
    N1 --> N2
    N3["Structured skill"]
    N2 --> N3
    N4["Retrieval reuse"]
    N3 --> N4
    N5["Revision"]
    N4 --> N5
```

这张图可以按从左到右读：左边是问题或数据来源，中间是论文提出的关键机制，右边是更新后的能力如何被复用或验证。读这篇论文时，最重要的是不要只看最后的分数，而要看中间那一层到底把什么东西变成了什么。

## 核心创新点
1. AutoSkill 的核心价值是：适合做个人或团队 Agent 的长期记忆层，但必须提供删除、过期和冲突处理。
2. 它把方法链条明确拆成 Interaction history → Skill extraction → Structured skill → Retrieval reuse → Revision 这样的闭环，中间每一步都在把原始轨迹压缩成更稳定的中间表示，而不是把所有经验原样塞给模型。
3. 它不是只证明“能写出 skill”，而是尽量证明“更新后的 skill / repo / curator / verifier / policy 能在后续任务里稳定被复用”。

这三点合在一起，说明这篇论文关注的不是孤立模块，而是一个能持续积累的外部能力系统。读的时候先盯住这三件事：输入是什么、哪一步发生了真正的压缩或筛选、最后能不能复用到别的任务或别的模型上。

## 方法详解

### 1. 从长期交互中识别稳定经验
AutoSkill 面向的是跨 session 的长期个性化。它不把聊天历史原样保存成记忆，而是从历史对话、任务执行轨迹、用户反馈和成功/失败结果中识别稳定模式：用户偏好、常用工作流、重复检查点、工具调用习惯、输出格式要求等。

这一步最难的是区分“稳定偏好”和“一次性上下文”。如果把临时要求写成长期 skill，Agent 会在未来任务中过度套用；如果只保存原始历史，又无法形成可复用能力。

### 2. 把候选经验转成结构化 skill
抽取出的候选经验需要被转成显式 skill。结构化 skill 至少应包含适用场景、执行规则、例外条件、来源证据和版本信息。这样它才不是模糊记忆，而是可编辑、可撤销、可审查的外部能力。

AutoSkill 的关键在于把长期记忆从“检索片段”升级为“有生命周期的技能”。这让个人或团队 Agent 可以逐渐适应用户，同时仍保留人工修订和回滚的入口。

### 3. 在新任务中检索和复用 skill
当新任务到来时，系统根据任务状态、用户、上下文和 skill 的适用条件检索相关 skill，并注入到 Agent 执行过程。这里需要控制注入数量和相关性，因为长期个性化 skill 如果过多，会造成上下文污染和冲突。

复用阶段是检验 skill 是否真的有价值的地方：如果某条 skill 经常被检索但不提升任务表现，或者经常与当前用户意图冲突，就应该被降权、修订或删除。

### 4. 根据新反馈持续修订
AutoSkill 不更新底层模型参数，而是通过新反馈持续修订 skill 层。用户纠正、任务失败、偏好变化、工具更新都可能触发 skill 版本更新。更新方式可以是补充边界条件、改写执行步骤、合并重复 skill、标记过期或删除错误 skill。

因此，AutoSkill 的生命周期不是“抽取一次后永久保存”，而是 extract -> structure -> retrieve -> revise 的循环。它适合做个人或团队 Agent 的长期适配层，但必须配套删除、过期、冲突处理和审计机制。

## 机制拆解表：输入、处理、输出

| 环节 | 输入 | 处理 | 输出 |
| --- | --- | --- | --- |
| Interaction history | 历史对话、执行轨迹、用户反馈、任务结果 | 区分稳定偏好和临时上下文，发现重复工作流和失败模式 | 候选长期经验 |
| Skill extraction | 候选经验、来源证据、当前 skill 库 | 抽取适用条件、执行规则、例外情况和用户偏好 | 候选 skill |
| Structured skill | 候选 skill、版本/权限/来源字段 | 转成可编辑、可版本化、可撤销的显式技能表示 | 结构化 skill 记录 |
| Retrieval reuse | 新任务、用户上下文、skill 适用条件 | 检索并注入相关 skill，控制冲突和上下文污染 | 被复用的 skill 和执行结果 |
| Revision | 新反馈、使用日志、冲突和失败案例 | 更新、合并、降权、过期或删除 skill | 更符合长期偏好的 skill 层 |

这张表的重点是：AutoSkill 不是长期保存聊天记录，而是把跨会话经验压成可治理的显式技能层。

## 实验与证据怎么理解
论文强调 model-agnostic plugin layer 和 lifelong personalization，重点是跨 session 经验沉淀，而不是单一 benchmark 提分。

更具体地说，读实验时建议抓三条线：第一，是否有和无 skill / 旧 skill / 新 skill 的公平对比；第二，是否证明收益来自 skill 本身，而不是模型或 prompt 其他部分变化；第三，是否展示跨任务、跨模型或 OOD 的迁移能力。只有同时满足这些条件，才能说明它真的是“自进化能力”，而不是一次性的 benchmark 调参。


## 一个具体例子

可以把它想成个人助理逐渐记住你的工作方式，但不是记聊天记录，而是写成可编辑技能。

假设一个 Agent 连续处理十个相似任务。如果它每次都从零推理，那只是“会做题”；如果它能从前几次任务中提炼出规则、检查点、工具调用顺序或失败规避策略，并在后面任务中稳定复用，那才是这篇论文关心的自进化。

## 和相关方法的差异

| 对象 | 做法 | 关键差异 |
| --- | --- | --- |
| Chat history | 只在会话内有效 | 容易丢 |
| Vector memory | 可检索但难治理 | 边界模糊 |
| AutoSkill | 显式 skill 生命周期 | 可编辑、可版本化、可迁移 |

这张表的重点是定位：同样都叫 self-evolving，不同论文改的层完全不同。有的改记忆，有的改 prompt，有的改 skill 文档，有的训练 curator 或 policy。把层级分清楚，论文就容易读很多。

## 适合怎么读
- 先看论文把经验沉淀到哪里：记忆、skill、prompt、policy、verifier、world model，还是 SkillRepo。
- 再看它如何防止坏经验进入系统：是否有 verifier、held-out gate、reward、score-based maintenance 或人工审核。
- 最后看它如何证明迁移：跨任务、跨模型、跨用户、跨环境，至少要有一种。

## 局限与风险
最大的难点是判断哪些反馈是稳定偏好，哪些只是一次性上下文。

从工程角度还要额外警惕两点。第一，skill 越自进化，越容易把错误规则长期固化；第二，skill 越共享，越需要权限、来源、版本和回滚机制。论文实验里有效，不代表上线系统里可以无审核运行。

## 工程启发
适合做个人或团队 Agent 的长期记忆层，但必须提供删除、过期和冲突处理。

如果把这篇论文转成可落地方案，我会把它拆成四个组件：经验采集器、技能更新器、验证器、发布/回滚器。没有验证器和回滚器的“自进化”，本质上只是自动改文件，风险很高。
