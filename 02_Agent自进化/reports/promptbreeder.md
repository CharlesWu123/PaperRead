# Promptbreeder: Self-Referential Self-Improvement Via Prompt Evolution

## 论文信息
- 标签：prompt evolution；what=prompt population；when=iterative search；how=fitness + mutation prompt；where=prompt optimization
- 中文定位：自指式 Prompt 演化基础
- 作者：Chrisantha Fernando / Dylan Banarse / Henryk Michalewski / Simon Osindero / Tim Rocktaschel
- 年份：2023
- arXiv：2309.16797
- PDF：https://arxiv.org/pdf/2309.16797
- 代码：未在当前元数据中明确；需要按论文题名继续查官方仓库。

## 一句话总结
Promptbreeder 的核心价值是：可用于优化 skill 写作模板、诊断 prompt、verifier prompt 和自进化规则。

## 这篇论文解决什么问题
Prompt 不仅可以被优化，连“如何修改 prompt 的规则”也可以被优化。Promptbreeder 提出自指式 prompt evolution。

如果放到 Agent skill 自进化的大图里，它解决的不是“模型有没有知识”，而是“Agent 如何把执行经验变成之后能稳定复用的外部能力”。这类外部能力可能是 `SKILL.md`、技能库、prompt、程序性记忆、world model、verifier 或 curator。区别只在于它把经验沉淀到哪一层。

## 方法图：先抓住机制闭环

```mermaid
flowchart LR
    N1["Prompt population"]
    N2["Fitness evaluation"]
    N1 --> N2
    N3["Mutation prompt"]
    N2 --> N3
    N4["Prompt variants"]
    N3 --> N4
    N5["Self-referential update"]
    N4 --> N5
```

这张图可以按从左到右读：左边是问题或数据来源，中间是论文提出的关键机制，右边是更新后的能力如何被复用或验证。读这篇论文时，最重要的是不要只看最后的分数，而要看中间那一层到底把什么东西变成了什么。

## 核心创新点
1. Promptbreeder 的核心价值是：可用于优化 skill 写作模板、诊断 prompt、verifier prompt 和自进化规则。
2. 它把方法链条明确拆成 Prompt population → Fitness evaluation → Mutation prompt → Prompt variants → Self-referential update 这样的闭环，中间每一步都在把原始轨迹压缩成更稳定的中间表示，而不是把所有经验原样塞给模型。
3. 它不是只证明“能写出 skill”，而是尽量证明“更新后的 skill / repo / curator / verifier / policy 能在后续任务里稳定被复用”。

这三点合在一起，说明这篇论文关注的不是孤立模块，而是一个能持续积累的外部能力系统。读的时候先盯住这三件事：输入是什么、哪一步发生了真正的压缩或筛选、最后能不能复用到别的任务或别的模型上。

## 方法详解

### 1. 维护 task prompt 种群
Promptbreeder 从一组 task prompts 开始，每个 prompt 都是一种完成任务的策略表述。系统在训练任务上运行这些 prompt，得到对应的表现分数。这里的优化对象不是模型参数，而是提示词文本。

种群设计让系统同时保留多个候选方向，而不是沿着单一路径贪心修改。这样可以减少早期坏 prompt 把搜索带偏的风险。

### 2. 用 fitness evaluation 选择更好的 prompt
每个 task prompt 会在任务集上评估 fitness，例如准确率、任务分数或其它可比较指标。Fitness 决定哪些 prompt 更有机会留下、繁殖或被继续改写。

这一步把 prompt 优化从主观改写变成可选择过程。没有 fitness，mutation 只是随机润色；有了 fitness，系统才能区分真正有效的变体和看起来漂亮的变体。

### 3. 用 mutation prompt 产生变体
Promptbreeder 的关键是 mutation prompt：它不是直接解任务，而是指导 LLM 如何修改 task prompt，例如变得更具体、加入推理步骤、改变输出约束或强调某些检查。

这样系统优化的不只是 prompt 本身，还包括“如何产生 prompt 变体”的规则。Mutation prompt 决定搜索空间的形状，因此它的质量会直接影响演化效率。

### 4. 让 mutation prompt 也参与演化
普通 prompt search 的变异规则是固定的；Promptbreeder 让 mutation prompt 本身也可以被生成、选择和改进。这形成自指式 self-improvement：系统同时优化任务提示词和提示词变异器。

这也是论文最有启发的地方。对 skill 自进化来说，不仅可以优化 `SKILL.md`，还可以优化“如何改 SKILL.md”的 generator prompt、review prompt 和 verifier prompt。

### 5. 形成双层演化闭环
最终系统形成两层闭环：task prompt 在任务 fitness 上被选择，mutation prompt 在它能否产生好 task prompt 上被选择。外层优化任务表现，内层优化搜索策略。

这个机制适合迁移到 skill 平台：skill 内容是一层，skill 写作/修订规则是另一层。真正长期有效的自进化系统往往需要同时改产物和改产生产物的规则。

## 机制拆解表：输入、处理、输出

| 环节 | 输入 | 处理 | 输出 |
| --- | --- | --- | --- |
| Prompt population | 初始 task prompts、任务集、模型 | 运行多个提示词候选，保留多样搜索方向 | prompt 种群 |
| Fitness evaluation | prompt 输出、任务标签或评分器 | 计算每个 prompt 的表现并排序 | fitness 分数 |
| Mutation prompt | 高分/低分 prompt、变异规则 prompt | 指导 LLM 生成 prompt 改写方向 | 新 prompt 变体 |
| Prompt variants | 变体 prompt、任务集 | 重新评估并加入或淘汰种群 | 更新后的 task prompt 集合 |
| Self-referential update | mutation prompt 的历史效果 | 选择和改进 mutation prompt 本身 | 更好的 prompt 变异策略 |

这张表的重点是：Promptbreeder 不只是搜索提示词，而是让“如何改提示词”的规则也进入演化。

## 实验与证据怎么理解
论文在算术、常识推理、分类等任务中超过多个人工设计 prompt baseline。

更具体地说，读实验时建议抓三条线：第一，是否有和无 skill / 旧 skill / 新 skill 的公平对比；第二，是否证明收益来自 skill 本身，而不是模型或 prompt 其他部分变化；第三，是否展示跨任务、跨模型或 OOD 的迁移能力。只有同时满足这些条件，才能说明它真的是“自进化能力”，而不是一次性的 benchmark 调参。


## 一个具体例子

可以把它想成不只改作文，还改“如何改作文”的规则。

假设一个 Agent 连续处理十个相似任务。如果它每次都从零推理，那只是“会做题”；如果它能从前几次任务中提炼出规则、检查点、工具调用顺序或失败规避策略，并在后面任务中稳定复用，那才是这篇论文关心的自进化。

## 为什么它和 skill 自进化有关

Promptbreeder 的意义，不只是自动找更好的任务提示词，而是把“如何修改提示词”这件事也变成可优化对象。这个思路后来很适合迁移到 skill generator prompt、verifier prompt 和 review rubric：真正难的往往不是第一版怎么写，而是下一轮该怎么改。

它的价值还在于把 mutation prompt 和 task prompt 分离。这样一来，自进化系统不只是对产物做搜索，还能对搜索策略本身做搜索。对 skill 生态来说，这意味着可以把“请总结失败原因”“请补边界条件”“请提高可执行性”这些改写规则单独进化出来。

## 双层进化到底在进化什么

Promptbreeder 最关键的地方，不是找到一个更好的 prompt，而是把“如何产生 prompt 变体”这件事也纳入演化。这样一来，它就从普通搜索变成了搜索空间本身的自我改写。

可以把它拆成两层：第一层是 task prompt，决定当前任务怎么被表述；第二层是 mutation prompt，决定下一轮该怎么改 prompt。前者解决“做什么”，后者解决“怎么改”。很多后续 skill 论文其实都在复用这个思路：不仅优化技能文案，还要优化“如何写技能文案”的模板。

这也是为什么 Promptbreeder 对 skill 自进化仍然有价值。Skill 不是静态文件，它也需要不断改写、合并、删减和重写；如果没有第二层 mutation 规则，自进化很容易退化成重复小修小补。

## 和相关方法的差异

| 对象 | 做法 | 关键差异 |
| --- | --- | --- |
| Manual CoT | 人工写策略 | 不可扩展 |
| Simple prompt search | 只搜 task prompt | 变异规则固定 |
| Promptbreeder | task prompt + mutation prompt 共演化 | 让改写策略本身也进化 |

这张表的重点是定位：同样都叫 self-evolving，不同论文改的层完全不同。有的改记忆，有的改 prompt，有的改 skill 文档，有的训练 curator 或 policy。把层级分清楚，论文就容易读很多。

## 适合怎么读
- 先看论文把经验沉淀到哪里：记忆、skill、prompt、policy、verifier、world model，还是 SkillRepo。
- 再看它如何防止坏经验进入系统：是否有 verifier、held-out gate、reward、score-based maintenance 或人工审核。
- 最后看它如何证明迁移：跨任务、跨模型、跨用户、跨环境，至少要有一种。

## 局限与风险
依赖训练集 fitness，容易过拟合；距离多文件 skill package 仍有距离。

从工程角度还要额外警惕两点。第一，skill 越自进化，越容易把错误规则长期固化；第二，skill 越共享，越需要权限、来源、版本和回滚机制。论文实验里有效，不代表上线系统里可以无审核运行。

## 工程启发
可用于优化 skill 写作模板、诊断 prompt、verifier prompt 和自进化规则。

如果把这篇论文转成可落地方案，我会把它拆成四个组件：经验采集器、技能更新器、验证器、发布/回滚器。没有验证器和回滚器的“自进化”，本质上只是自动改文件，风险很高。
