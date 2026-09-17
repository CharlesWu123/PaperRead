# SkillOpt: Executive Strategy for Self-Evolving Agent Skills

## 论文信息
- 标签：skill optimization；what=skill document；when=offline inter-test-time；how=scored rollout + textual learning-rate + held-out gate；where=skill doc refinement
- 中文定位：文本空间 skill 优化
- 作者：Yifan Yang / Ziyang Gong / Weiquan Huang / Qihao Yang / Ziwei Zhou / Zisu Huang / Yan Li / Xuemei Gao 等
- 年份：2026
- arXiv：2605.23904
- PDF：https://arxiv.org/pdf/2605.23904
- 代码：https://github.com/microsoft/SkillOpt

## 一句话总结
SkillOpt 的核心价值是：适合离线训练企业内部 skill：每天收集失败任务，优化 skill 文档，只有通过 held-out gate 才发布新版本。

## 这篇论文解决什么问题
Skill 文档通常被当作静态文件，但如果它能像模型权重一样根据 rollout 分数离线优化，就能成为 frozen agent 的外部可训练状态。SkillOpt 正是在做这件事。

如果放到 Agent skill 自进化的大图里，它解决的不是“模型有没有知识”，而是“Agent 如何把执行经验变成之后能稳定复用的外部能力”。这类外部能力可能是 `SKILL.md`、技能库、prompt、程序性记忆、world model、verifier 或 curator。区别只在于它把经验沉淀到哪一层。

## 方法图：先抓住机制闭环

```mermaid
flowchart LR
    N1["Rollouts scored"]
    N2["Optimizer proposes edits"]
    N1 --> N2
    N3["Bounded text update"]
    N2 --> N3
    N4["Held-out gate"]
    N3 --> N4
    N5["Frozen agent uses skill"]
    N4 --> N5
```

这张图可以按从左到右读：左边是问题或数据来源，中间是论文提出的关键机制，右边是更新后的能力如何被复用或验证。读这篇论文时，最重要的是不要只看最后的分数，而要看中间那一层到底把什么东西变成了什么。

## 核心创新点
1. SkillOpt 的核心价值是：适合离线训练企业内部 skill：每天收集失败任务，优化 skill 文档，只有通过 held-out gate 才发布新版本。
2. 它把方法链条明确拆成 Rollouts scored → Optimizer proposes edits → Bounded text update → Held-out gate → Frozen agent uses skill 这样的闭环，中间每一步都在把原始轨迹压缩成更稳定的中间表示，而不是把所有经验原样塞给模型。
3. 它不是只证明“能写出 skill”，而是尽量证明“更新后的 skill / repo / curator / verifier / policy 能在后续任务里稳定被复用”。

这三点合在一起，说明这篇论文关注的不是孤立模块，而是一个能持续积累的外部能力系统。读的时候先盯住这三件事：输入是什么、哪一步发生了真正的压缩或筛选、最后能不能复用到别的任务或别的模型上。

## 方法详解

### 1. 把 skill 文档定义成可优化对象
SkillOpt 的前提是底座 Agent 不更新参数，执行 harness 也尽量保持不变；真正被优化的是外部 skill 文档。这样，skill 不再只是人工写好的静态说明，而是类似“文本参数”的外部状态：每轮根据执行结果产生一个新版本，只有新版本通过验证才会替换旧版本。

这个设定很重要，因为它把优化问题从“训练模型”转成“训练文档”。模型权重保持 frozen，部署侧仍然只是加载一份 skill 文档，因此优化收益不会带来额外推理调用，也更容易审计、回滚和版本管理。

### 2. 用 scored rollouts 提供更新信号
SkillOpt 不是让 optimizer 凭空改文档，而是先让当前 skill 在一批任务上执行，得到 scored rollouts。rollout 至少包含任务输入、执行轨迹、最终结果和分数或反馈。分数的作用相当于方向信号：哪些行为带来成功，哪些行为导致失败，哪些文档规则可能没有被正确触发或执行。

这一步和普通失败总结的区别在于，SkillOpt 关心的是“可比较的执行结果”。如果只有自然语言复盘，optimizer 很容易写出看似合理但无收益的建议；有了 scored rollouts，后续编辑才能围绕真实表现提升展开。

### 3. optimizer 生成受限文本编辑
接下来，独立 optimizer model 读取旧 skill 和 scored rollouts，提出对 skill 文档的编辑。编辑通常可以理解为 add / delete / replace：新增缺失规则，删除误导或冗余规则，替换不够精确的描述。这里优化器不是重新生成整份文档，而是产生针对旧版本的 bounded update。

这种设计的意义是保留旧 skill 中已经有效的部分，只修正被 rollout 暴露出来的问题。对 skill 自进化来说，最危险的是一次失败导致整份文档大幅漂移；SkillOpt 通过“编辑旧版本”而不是“重写新版本”，把更新控制在可审查的 diff 上。

### 4. textual learning-rate 控制更新步长
SkillOpt 把每轮文本编辑限制在一个 learning-rate budget 内。这个预算可以理解为自然语言优化里的步长：一次只允许改有限内容，避免把某个 batch 的偶然模式写成全局规则，也避免新 skill 破坏旧 skill 已经学会的能力。

从收敛角度看，textual learning-rate 的作用类似信任域。步长太大，文档可能快速过拟合当前 rollout；步长太小，优化效率低。合理的文本步长让 skill 文档以小步、可验证、可回滚的方式朝更优版本移动。

### 5. held-out gate 决定是否接受新版本
候选编辑不能只在产生它的 rollout 上变好，还必须经过 held-out validation。也就是说，系统要用未参与生成编辑的任务来比较旧 skill 和候选 skill；只有候选版本在验证集上表现更好，才会被接受并进入下一轮。

这个 gate 是 SkillOpt 的核心安全阀。它防止 optimizer 把训练样例里的局部 workaround 固化进文档，也防止文档朝评分噪声过拟合。被拒绝的编辑进入 rejected-edit buffer，后续可以作为负样本或诊断材料，用来分析哪些修改方向经常看似合理但验证不过。

### 6. 发布后的 frozen agent 直接复用新 skill
通过 gate 的 skill 文档成为新版本，供 frozen agent 在后续任务中直接加载。由于学习发生在离线阶段，运行时不需要额外 optimizer，也不需要检索大量历史轨迹。最终产物仍然是一份普通 skill 文档，但它背后经过了 rollout 评分、受限编辑和 held-out 验证。

因此，SkillOpt 的方法闭环可以概括为：执行旧 skill -> 收集 scored rollouts -> optimizer 生成受限 diff -> textual learning-rate 控制步长 -> held-out gate 验证 -> 发布新 skill。它的核心不是“自动写得更详细”，而是“让 skill 文档像可训练参数一样小步收敛”。

## 机制拆解表：输入、处理、输出

| 环节 | 输入 | 处理 | 输出 |
| --- | --- | --- | --- |
| Scored rollouts | 当前 skill、任务集、执行轨迹、分数或反馈 | 比较成功和失败行为，定位 skill 中缺失、冗余或误导的规则 | 可供 optimizer 使用的带分数经验 |
| Optimizer proposes edits | 旧 skill、scored rollouts、历史 rejected edits | 生成 add / delete / replace 类型的候选文本编辑 | 候选 skill diff |
| Bounded text update | 候选 diff、文本步长预算、文档结构约束 | 限制修改范围和幅度，保留旧 skill 中有效内容 | 受限的新 skill 版本 |
| Held-out gate | 旧 skill、新 skill、未参与编辑生成的验证任务 | 在保留任务上比较表现，过滤过拟合或负迁移编辑 | 接受的新版本或 rejected edit |
| Frozen agent uses skill | 通过验证的新 skill 文档、固定底座 Agent | 运行时直接加载文档执行任务，不额外调用 optimizer | 可复用、可版本化的外部能力 |

这张表把 SkillOpt 的方法拆成工程视角：真正发生优化的不是模型权重，而是 skill 文档版本；真正决定能否收敛的不是编辑写得是否像样，而是它能否在 held-out 任务上稳定优于旧版本。

## 实验与证据怎么理解
论文报告在六个 benchmark、七个 target model、三种 execution harness 上带来强提升，说明外部 skill 文档可以像可训练参数一样持续改良。

更具体地说，读实验时建议抓三条线：第一，是否有和无 skill / 旧 skill / 新 skill 的公平对比；第二，是否证明收益来自 skill 本身，而不是模型或 prompt 其他部分变化；第三，是否展示跨任务、跨模型或 OOD 的迁移能力。只有同时满足这些条件，才能说明它真的是“自进化能力”，而不是一次性的 benchmark 调参。


## 一个具体例子

可以把它想成一个“技能文档训练器”：每天收集失败任务，optimizer 只允许小步修改 skill 文档，修改后必须在保留任务上涨分才发布。

假设一个 Agent 连续处理十个相似任务。如果它每次都从零推理，那只是“会做题”；如果它能从前几次任务中提炼出规则、检查点、工具调用顺序或失败规避策略，并在后面任务中稳定复用，那才是这篇论文关心的自进化。

## 和相关方法的差异

| 对象 | 做法 | 关键差异 |
| --- | --- | --- |
| Manual edit | 人工修文档 | 慢且不可扩展 |
| Self-generated skill | 一次生成 | 缺少优化纪律 |
| SkillOpt | scored rollout + held-out gate | 把 skill 文本变成可训练状态 |

这张表的重点是定位：同样都叫 self-evolving，不同论文改的层完全不同。有的改记忆，有的改 prompt，有的改 skill 文档，有的训练 curator 或 policy。把层级分清楚，论文就容易读很多。

## 对“收敛”的实质参考价值
SkillOpt 对收敛的参考价值在于：它把 `SKILL.md` 这类自然语言文档当成 frozen agent 外部的可训练状态，但又给文本更新加上类似优化算法的纪律。它不是每次失败后让 LLM 自由改文档，而是用 scored rollout 提供梯度方向，用 textual learning-rate 控制步长，用 held-out gate 决定是否发布。因此它给出的收敛路线可以概括为：skill 文档按小步文本编辑，在验证集门控下向后续任务表现更好的版本收敛。

第一，scored rollout 是“方向信号”。一次执行轨迹如果只有自然语言日志，很容易变成主观复盘；SkillOpt 要求 rollout 带有分数、成功失败反馈或可比较评价，这相当于告诉 optimizer 哪些行为真正改善了任务结果。这个分数不一定是 RL reward，也可以是测试通过率、人工评分、判题器、业务 KPI 或回放 verifier，但必须能把“看起来合理的建议”和“真的提高执行质量的建议”区分开。

第二，textual learning-rate 是“步长控制”。自然语言 skill 的危险在于单次编辑可能同时改掉触发条件、操作顺序、异常处理和输出约束，导致旧能力退化。SkillOpt 用受限 add/delete/replace 让每轮更新保持局部性：只允许在预算内修改文档，避免把一次 batch 的偶然模式写成全局规则。工程上可以把它实现成 diff 行数限制、章节白名单、编辑类型限制、兼容性检查或 reviewer gate。

第三，held-out gate 是“泛化筛选”。训练 rollout 上涨分并不够，候选文档必须在未参与生成的任务上更好，才说明它捕捉的是可迁移规则，而不是把训练样例硬编码进文档。这个 gate 是 SkillOpt 相比普通 prompt 优化最值得借鉴的地方：收敛目标不是让当前 batch 的解释更漂亮，而是让新版本 skill 在保留任务、边界任务和未来任务上更稳。

第四，rejected-edit buffer 让失败更新也有价值。被 gate 拒绝的编辑不应该直接消失，因为它们可能暴露了评分函数不稳、任务簇混杂、文档结构不清或验证集覆盖不足。把 rejected edits 留下来，可以反向帮助维护者发现“哪些方向经常被 optimizer 误判”。这相当于给 skill 演化增加了负样本记忆，避免系统反复尝试同类坏改动。

因此，SkillOpt 最适合参考在“离线 skill 文档训练”场景：每天或每轮收集一批执行结果，让 optimizer 产生受限 diff，用 held-out tasks 验证，只有通过 gate 才发布。它的收敛单位不是单条规则，而是整个 skill 文档版本；它的收益不是运行时多想几步，而是下次执行时 frozen agent 直接加载一个更好的外部策略文档。

## 适合怎么读
- 先看论文把经验沉淀到哪里：记忆、skill、prompt、policy、verifier、world model，还是 SkillRepo。
- 再看它如何防止坏经验进入系统：是否有 verifier、held-out gate、reward、score-based maintenance 或人工审核。
- 最后看它如何证明迁移：跨任务、跨模型、跨用户、跨环境，至少要有一种。

## 局限与风险
优化方向依赖评分函数；如果 verifier 或 task score 偏，skill 会朝错误方向收敛。

从工程角度还要额外警惕两点。第一，skill 越自进化，越容易把错误规则长期固化；第二，skill 越共享，越需要权限、来源、版本和回滚机制。论文实验里有效，不代表上线系统里可以无审核运行。

## 工程启发
适合离线训练企业内部 skill：每天收集失败任务，优化 skill 文档，只有通过 held-out gate 才发布新版本。

如果把这篇论文转成可落地方案，我会把它拆成四个组件：经验采集器、技能更新器、验证器、发布/回滚器。没有验证器和回滚器的“自进化”，本质上只是自动改文件，风险很高。
