# Agent Skills for Large Language Models: Architecture, Acquisition, Security, and the Path Forward

## 论文信息
- 标签：architecture & governance；what=skill package；when=lifecycle-based；how=design patterns + trust lifecycle；where=agent skill ecosystem
- 中文定位：技能架构与标准化
- 作者：Renjun Xu / Yang Yan
- 年份：2026
- arXiv：2602.12430
- PDF：https://arxiv.org/pdf/2602.12430
- 代码：https://github.com/scienceaix/agentskills

## 一句话总结
Agent Skills for LLMs 的核心价值是：适合用来设计目录规范：SKILL.md、references、scripts、权限声明、版本记录、测试样例和安全审计都应成为 skill package 的一部分。

## 这篇论文解决什么问题
Agent skill 正在从私人提示词变成生态基础设施。问题是：skill 文件如何组织、如何按需加载、如何和 MCP/工具协议配合、如何保证跨平台可移植以及如何防止社区技能带来安全漏洞。

如果放到 Agent skill 自进化的大图里，它解决的不是“模型有没有知识”，而是“Agent 如何把执行经验变成之后能稳定复用的外部能力”。这类外部能力可能是 `SKILL.md`、技能库、prompt、程序性记忆、world model、verifier 或 curator。区别只在于它把经验沉淀到哪一层。

## 方法图：先抓住机制闭环

```mermaid
flowchart LR
    N1["Architecture"]
    N2["Acquisition"]
    N1 --> N2
    N3["Deployment"]
    N2 --> N3
    N4["Security"]
    N3 --> N4
    N5["Roadmap"]
    N4 --> N5
```

这张图可以按从左到右读：左边是问题或数据来源，中间是论文提出的关键机制，右边是更新后的能力如何被复用或验证。读这篇论文时，最重要的是不要只看最后的分数，而要看中间那一层到底把什么东西变成了什么。

## 核心创新点
1. Agent Skills for LLMs 的核心价值是：适合用来设计目录规范：SKILL.md、references、scripts、权限声明、版本记录、测试样例和安全审计都应成为 skill package 的一部分。
2. 它把方法链条明确拆成 Architecture → Acquisition → Deployment → Security → Roadmap 这样的闭环，中间每一步都在把原始轨迹压缩成更稳定的中间表示，而不是把所有经验原样塞给模型。
3. 它不是只证明“能写出 skill”，而是尽量证明“更新后的 skill / repo / curator / verifier / policy 能在后续任务里稳定被复用”。

这三点合在一起，说明这篇论文关注的不是孤立模块，而是一个能持续积累的外部能力系统。读的时候先盯住这三件事：输入是什么、哪一步发生了真正的压缩或筛选、最后能不能复用到别的任务或别的模型上。

## 方法详解

### 1. 把 skill package 定义为工程资产
这篇文章不是提出新训练算法，而是讨论 Agent skill 作为生态基础设施应该如何组织。它把 skill 从单段 prompt 扩展为 package：`SKILL.md` 负责入口说明和 progressive disclosure，`references/` 保存详细知识，`scripts/` 或工具声明承载可执行能力，元数据记录版本、权限、来源和适用范围。

这个架构视角很重要。自进化系统如果只是自动改一段提示词，很难做审计、回滚和安全隔离；如果 skill 是结构化 package，就可以像软件资产一样管理。

### 2. 讨论 skill acquisition 的来源
文章把 skill 获取方式分成多类：人工编写、从轨迹中自主发现、强化学习生成、组合已有技能、社区或 marketplace 分发。不同来源对应不同风险：人工技能质量高但扩展慢，自动技能覆盖快但需要验证，社区技能可复用但存在供应链风险。

因此，skill acquisition 不是“哪里来的都能装”，而要和 provenance、测试样例、安全扫描和权限声明绑定。

### 3. 说明 skill 与工具协议的互补关系
Agent skill 和 MCP/tool 不等价。Tool 更像外部可调用接口，说明能做什么；skill 更像程序性知识包，说明什么时候用、怎么组合、有哪些注意事项、怎样解释工具返回。一个成熟 Agent 平台需要两者配合：工具提供动作能力，skill 提供策略和上下文。

这能解释为什么 skill package 需要 progressive disclosure：运行时只加载入口摘要，必要时再展开 references 或 scripts，避免把整个技能包都塞进上下文。

### 4. 放到部署场景里看可移植性
文章讨论 computer-use agent stack、GUI grounding、OSWorld、SWE-bench 等场景，核心问题是 skill 能否跨平台、跨模型、跨工具环境复用。可移植 skill 不能假设某个固定 prompt 或私有运行时，而应明确依赖、权限和执行条件。

这对自进化系统很关键：自动生成的 skill 如果绑定某次任务环境，就不是可复用 skill，而只是临时补丁。

### 5. 用治理框架控制安全风险
文章提出 Skill Trust and Lifecycle Governance Framework，用 gate-based 权限模型管理技能来源、能力范围和部署等级。因为 skill 可能包含脚本、工具调用、网络访问或文件操作，它比普通提示词更接近软件供应链资产。

因此，一个 skill 平台至少需要来源记录、权限声明、测试样例、静态检查、沙箱执行、版本记录和撤销策略。否则社区技能或自动演化技能会成为攻击入口。

## 机制拆解表：输入、处理、输出

| 环节 | 输入 | 处理 | 输出 |
| --- | --- | --- | --- |
| Architecture | skill 文件、references、scripts、元数据、工具接口 | 定义 package 结构和 progressive disclosure 方式 | 可移植 skill package 规范 |
| Acquisition | 人工技能、轨迹蒸馏、RL、组合生成、社区分发 | 记录来源、生成方式、适用范围和测试要求 | 可进入候选库的 skill |
| Deployment | Agent runtime、MCP/tool、GUI/OS/代码环境 | 按需加载 skill，声明依赖和权限，适配执行场景 | 可运行的 skill-enhanced agent |
| Security | skill 来源、权限、脚本、外部调用、供应链风险 | gate-based 审核、沙箱、扫描、版本和撤销 | 可信生命周期治理机制 |
| Roadmap | 架构、获取、部署和安全经验 | 总结标准化、生态协作和未来研究方向 | agent skill 平台建设路线 |

这张表的重点是：这篇文章提供的是 skill 生态架构和治理边界，不是单点算法；它适合用来设计 `SKILL.md + references + scripts + metadata` 的平台规范。

## 实验与证据怎么理解
论文指出社区贡献技能中有相当比例存在漏洞，这说明技能生态如果没有权限和审核机制，会比普通 prompt 更危险。

更具体地说，读实验时建议抓三条线：第一，是否有和无 skill / 旧 skill / 新 skill 的公平对比；第二，是否证明收益来自 skill 本身，而不是模型或 prompt 其他部分变化；第三，是否展示跨任务、跨模型或 OOD 的迁移能力。只有同时满足这些条件，才能说明它真的是“自进化能力”，而不是一次性的 benchmark 调参。


## 一个具体例子

可以把它想成 skill 生态的工程规范：文件怎么放，何时加载，如何和工具协议配合。

假设一个 Agent 连续处理十个相似任务。如果它每次都从零推理，那只是“会做题”；如果它能从前几次任务中提炼出规则、检查点、工具调用顺序或失败规避策略，并在后面任务中稳定复用，那才是这篇论文关心的自进化。

## 和相关方法的差异

| 对象 | 做法 | 关键差异 |
| --- | --- | --- |
| 传统插件 | 安装后常驻能力 | 偏软件扩展 |
| MCP tool | 外部工具能力 | 偏接口协议 |
| Agent skill | 按需加载的程序性知识包 | 偏策略、说明、资源和工具编排 |

这张表的重点是定位：同样都叫 self-evolving，不同论文改的层完全不同。有的改记忆，有的改 prompt，有的改 skill 文档，有的训练 curator 或 policy。把层级分清楚，论文就容易读很多。

## 适合怎么读
- 先看论文把经验沉淀到哪里：记忆、skill、prompt、policy、verifier、world model，还是 SkillRepo。
- 再看它如何防止坏经验进入系统：是否有 verifier、held-out gate、reward、score-based maintenance 或人工审核。
- 最后看它如何证明迁移：跨任务、跨模型、跨用户、跨环境，至少要有一种。

## 局限与风险
这篇是综述和框架文章，不会给出新的训练算法。它更关心生态和安全，而不是某个 benchmark 的 SOTA。

从工程角度还要额外警惕两点。第一，skill 越自进化，越容易把错误规则长期固化；第二，skill 越共享，越需要权限、来源、版本和回滚机制。论文实验里有效，不代表上线系统里可以无审核运行。

## 工程启发
适合用来设计目录规范：SKILL.md、references、scripts、权限声明、版本记录、测试样例和安全审计都应成为 skill package 的一部分。

如果把这篇论文转成可落地方案，我会把它拆成四个组件：经验采集器、技能更新器、验证器、发布/回滚器。没有验证器和回滚器的“自进化”，本质上只是自动改文件，风险很高。
