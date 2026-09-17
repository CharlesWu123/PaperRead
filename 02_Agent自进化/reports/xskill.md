# XSkill: Continual Learning from Experience and Skills in Multimodal Agents

## 论文信息
- 标签：multimodal skill library；what=experience + skill；when=continuous accumulation；how=visual rollout mining + retrieval adaptation；where=GUI / multimodal agent
- 中文定位：多模态经验与技能双流学习
- 作者：Guanyu Jiang / Zhaochen Su / Xiaoye Qu / Yi R. Fung
- 年份：2026
- arXiv：2603.12056
- PDF：https://arxiv.org/pdf/2603.12056
- 代码：https://github.com/XSkill-Agent/XSkill

## 一句话总结
XSkill 的核心价值是：多模态 Agent 的 skill 不应只写自然语言步骤，还应包含视觉锚点、界面状态、工具前置条件和失败回退。

## 这篇论文解决什么问题
多模态 Agent 不只是读文本，还要看图、操作界面、调用工具。单纯文本经验难以覆盖视觉 grounding 和环境变化，因此需要同时维护动作级 experience 与任务级 skill。

如果放到 Agent skill 自进化的大图里，它解决的不是“模型有没有知识”，而是“Agent 如何把执行经验变成之后能稳定复用的外部能力”。这类外部能力可能是 `SKILL.md`、技能库、prompt、程序性记忆、world model、verifier 或 curator。区别只在于它把经验沉淀到哪一层。

## 方法图：先抓住机制闭环

```mermaid
flowchart LR
    N1["Visual rollout"]
    N2["Experience mining"]
    N1 --> N2
    N3["Skill distillation"]
    N2 --> N3
    N4["Retrieval adaptation"]
    N3 --> N4
    N5["Continual update"]
    N4 --> N5
```

这张图可以按从左到右读：左边是问题或数据来源，中间是论文提出的关键机制，右边是更新后的能力如何被复用或验证。读这篇论文时，最重要的是不要只看最后的分数，而要看中间那一层到底把什么东西变成了什么。

## 核心创新点
1. XSkill 的核心价值是：多模态 Agent 的 skill 不应只写自然语言步骤，还应包含视觉锚点、界面状态、工具前置条件和失败回退。
2. 它把方法链条明确拆成 Visual rollout → Experience mining → Skill distillation → Retrieval adaptation → Continual update 这样的闭环，中间每一步都在把原始轨迹压缩成更稳定的中间表示，而不是把所有经验原样塞给模型。
3. 它不是只证明“能写出 skill”，而是尽量证明“更新后的 skill / repo / curator / verifier / policy 能在后续任务里稳定被复用”。

这三点合在一起，说明这篇论文关注的不是孤立模块，而是一个能持续积累的外部能力系统。读的时候先盯住这三件事：输入是什么、哪一步发生了真正的压缩或筛选、最后能不能复用到别的任务或别的模型上。

## 方法详解

### 1. 把多模态轨迹拆成 experience 和 skill 两条流
XSkill 面向多模态 Agent，输入不仅有文本任务和工具调用，还有图像、界面状态、视觉 grounding 和动作结果。论文把学习对象拆成两条流：experience 记录细粒度动作经验，skill 记录任务级策略和可复用流程。

这个拆分解决了 text-only memory 的不足。多模态任务里，很多错误来自视觉状态识别或界面定位，单纯写“点击提交按钮”不够，还需要记录按钮视觉锚点、前置界面状态和失败回退。

### 2. accumulation 阶段抽取经验与技能
在 accumulation 阶段，系统从 visual rollout 中做经验挖掘。它会总结哪些视觉状态对应哪些动作，哪些操作在特定界面布局下有效，哪些失败来自 grounding 错误或工具前置条件不满足。

同时，系统会通过跨 rollout critique 把多个局部经验提炼成任务级 skill，例如完成一类 UI 操作的策略、检查顺序或回退流程。

### 3. inference 阶段检索并适配
新任务执行时，Agent 根据当前视觉上下文检索相关 experience 和 skill。Experience 帮助处理动作级细节，例如当前界面上哪个元素可点；skill 帮助处理任务级策略，例如先确认状态再提交、失败后返回上一页重试。

检索后还需要 adaptation，因为多模态状态可能相似但不完全相同。系统必须把旧经验映射到当前视觉布局，而不是机械复用旧坐标或旧文本。

### 4. 使用结果继续反哺 continual update
执行后的成功、失败和视觉变化会继续进入 accumulation，更新 experience 和 skill。这样系统形成持续学习闭环：视觉 rollout 产生经验，经验蒸馏成 skill，skill 辅助新任务，新任务再产生新的多模态证据。

这对多模态 Agent 很关键，因为网页、GUI 或工具界面经常变化，技能如果不持续更新，很快会因视觉状态漂移而失效。

## 机制拆解表：输入、处理、输出

| 环节 | 输入 | 处理 | 输出 |
| --- | --- | --- | --- |
| Visual rollout | 图像/界面状态、动作、工具调用、反馈 | 记录视觉锚点、状态变化和动作结果 | 多模态执行轨迹 |
| Experience mining | 多模态轨迹、失败/成功案例 | 抽取动作级经验、grounding 线索和前置条件 | 细粒度 experience |
| Skill distillation | 多个 experience、任务目标、跨 rollout critique | 归纳任务级策略、检查点和回退流程 | 结构化 skill |
| Retrieval adaptation | 当前视觉上下文、experience 库、skill 库 | 检索相关经验并适配到当前界面状态 | 可执行的上下文指导 |
| Continual update | 新执行结果、视觉状态变化、反馈 | 更新经验和技能，处理过期或错误 grounding | 持续演化的多模态能力库 |

这张表的重点是：XSkill 的 skill 不能只写文本步骤，还必须绑定视觉状态、动作经验和当前环境适配。

## 实验与证据怎么理解
论文在五个基准、四个 backbone 上报告优于 tool-only 和 learning-based baseline，说明经验与技能双流在多模态场景比单一记忆更稳定。

更具体地说，读实验时建议抓三条线：第一，是否有和无 skill / 旧 skill / 新 skill 的公平对比；第二，是否证明收益来自 skill 本身，而不是模型或 prompt 其他部分变化；第三，是否展示跨任务、跨模型或 OOD 的迁移能力。只有同时满足这些条件，才能说明它真的是“自进化能力”，而不是一次性的 benchmark 调参。


## 一个具体例子

可以把它想成两本笔记：一本记录看见界面后该怎么点，另一本记录完成一类任务的整体策略。

假设一个 Agent 连续处理十个相似任务。如果它每次都从零推理，那只是“会做题”；如果它能从前几次任务中提炼出规则、检查点、工具调用顺序或失败规避策略，并在后面任务中稳定复用，那才是这篇论文关心的自进化。

## 和相关方法的差异

| 对象 | 做法 | 关键差异 |
| --- | --- | --- |
| Text-only memory | 只保存语言经验 | 无法锚定视觉状态 |
| Tool-only agent | 只依赖工具调用 | 缺少跨任务策略沉淀 |
| XSkill | 视觉上下文 + experience + skill | 同时处理动作细节和任务策略 |

这张表的重点是定位：同样都叫 self-evolving，不同论文改的层完全不同。有的改记忆，有的改 prompt，有的改 skill 文档，有的训练 curator 或 policy。把层级分清楚，论文就容易读很多。

## 适合怎么读
- 先看论文把经验沉淀到哪里：记忆、skill、prompt、policy、verifier、world model，还是 SkillRepo。
- 再看它如何防止坏经验进入系统：是否有 verifier、held-out gate、reward、score-based maintenance 或人工审核。
- 最后看它如何证明迁移：跨任务、跨模型、跨用户、跨环境，至少要有一种。

## 局限与风险
视觉 grounding 错误会直接污染 experience 和 skill；如果图像状态识别不稳，后续检索也会偏。

从工程角度还要额外警惕两点。第一，skill 越自进化，越容易把错误规则长期固化；第二，skill 越共享，越需要权限、来源、版本和回滚机制。论文实验里有效，不代表上线系统里可以无审核运行。

## 工程启发
多模态 Agent 的 skill 不应只写自然语言步骤，还应包含视觉锚点、界面状态、工具前置条件和失败回退。

如果把这篇论文转成可落地方案，我会把它拆成四个组件：经验采集器、技能更新器、验证器、发布/回滚器。没有验证器和回滚器的“自进化”，本质上只是自动改文件，风险很高。
