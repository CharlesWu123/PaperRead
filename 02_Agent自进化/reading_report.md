# Agent Skill 自进化论文阅读报告

生成日期：2026-07-16

本报告围绕“agent skill 自进化”筛选论文。这里的 skill 不只指单个 tool/function，而是指 agent 可长期复用、可检索、可更新的能力单元，可能表现为提示词、记忆、工作流、代码函数、工具调用策略、多文件 skill package、验证器或环境适配层。

## 一、推荐阅读顺序

1. **A Survey of Self-Evolving Agents**：先建立全局分类框架。
2. **Reflexion**：理解最基础的“执行反馈 -> 语言反思 -> 记忆更新”。
3. **Voyager**：理解“自动课程 + 可执行 skill library + 环境反馈修复”的技能库范式。
4. **AutoSkill**：看交互经验如何沉淀为显式、可编辑、可迁移的 skill。
5. **CoEvoSkills**：看多文件 skill package 如何通过生成器与验证器协同演化。
6. **Harness Updating Is Not Harness Benefit**：看 skill/harness 更新的评估陷阱，会生成不等于会受益。
7. **SAGE / RL for Self-Improving Agent with Skill Library**：看如何把 skill 生成和使用纳入 RL 训练。
8. **WebEvolver**：看环境模型如何与 agent 共演化，缓解在线探索停滞。
9. **Agents of Change**：看长程策略如何固化成 executable artifact 后演化。
10. **Promptbreeder**：补充 prompt/harness 自指演化的基础机制。

## 二、快速索引表

| 优先级 | 论文　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　 | 年份 | 方向　　　　　　　 | 核心价值　　　　　　　　　　　　　　　　　　　　　　　　　　 | PDF                              |
| --------| -------------------------------------------------------------------:| -----:| --------------------| --------------------------------------------------------------| ----------------------------------|
| 1　　　| A Survey of Self-Evolving Agents　　　　　　　　　　　　　　　　　 | 2025 | 综述　　　　　　　 | 自进化 agent 的 what/when/how/where 分类　　　　　　　　　　 | https://arxiv.org/pdf/2507.21046 |
| 2　　　| CoEvoSkills　　　　　　　　　　　　　　　　　　　　　　　　　　　　| 2026 | Skill package　　　| 自动生成多文件 agent skill，并用 surrogate verifier 协同演化 | https://arxiv.org/pdf/2604.01687 |
| 3　　　| AutoSkill　　　　　　　　　　　　　　　　　　　　　　　　　　　　　| 2026 | 个性化 skill　　　 | 从交互经验中抽象、维护、复用 skill　　　　　　　　　　　　　 | https://arxiv.org/pdf/2603.01145 |
| 4　　　| Harness Updating Is Not Harness Benefit　　　　　　　　　　　　　　| 2026 | 评估　　　　　　　 | 区分 harness-updating 与 harness-benefit　　　　　　　　　　 | https://arxiv.org/pdf/2605.30621 |
| 5　　　| Reinforcement Learning for Self-Improving Agent with Skill Library | 2025 | RL + skill library | 用 SAGE/Skill Augmented GRPO 训练 self-improving agent　　　 | https://arxiv.org/pdf/2512.17102 |
| 6　　　| WebEvolver　　　　　　　　　　　　　　　　　　　　　　　　　　　　 | 2025 | Web agent　　　　　| agent 与 world model 协同演化　　　　　　　　　　　　　　　　| https://arxiv.org/pdf/2504.21024 |
| 7　　　| Agents of Change　　　　　　　　　　　　　　　　　　　　　　　　　 | 2025 | 长程规划　　　　　 | 把策略沉淀为可执行 artifact，再通过模拟迭代优化　　　　　　　| https://arxiv.org/pdf/2506.04651 |
| 8　　　| Voyager　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　| 2023 | 技能库基础　　　　 | 自动课程 + 可执行代码技能库 + 自验证修复　　　　　　　　　　 | https://arxiv.org/pdf/2305.16291 |
| 9　　　| Reflexion　　　　　　　　　　　　　　　　　　　　　　　　　　　　　| 2023 | 反思记忆　　　　　 | 用 verbal reinforcement learning 更新 agent 记忆　　　　　　 | https://arxiv.org/pdf/2303.11366 |
| 10　　 | Promptbreeder　　　　　　　　　　　　　　　　　　　　　　　　　　　| 2023 | Prompt 演化　　　　| 任务 prompt 和 mutation prompt 自指演化　　　　　　　　　　　| https://arxiv.org/pdf/2309.16797 |

## 三、领域脉络

Agent skill 自进化大致沿着四条线发展：

1. **记忆型自进化**：Reflexion 代表。agent 不改模型参数，而是把失败经验写成语言反思，在后续 trial 中检索使用。这类方法成本低、实现简单，但容易受记忆质量、检索策略和模型遵循能力限制。

2. **技能库型自进化**：Voyager 代表。agent 将解决任务的代码或过程沉淀为可调用 skill library，新任务通过检索组合旧技能完成。这条线最接近“agent skill 自进化”的工程形态。

3. **显式 skill artifact 型自进化**：AutoSkill、CoEvoSkills、SAGE 代表。skill 从隐式提示、轨迹或记忆，升级为可编辑、可版本化、可验证、可迁移的结构化 artifact。CoEvoSkills 进一步把 skill 从单函数 tool 扩展到多文件 package。

4. **harness / 环境 / 验证器共演化**：Harness Updating、WebEvolver、Agents of Change 代表。研究重点从“能否更新一个 skill”转向“更新出来的 harness 是否真的被 task-solving agent 用好”，以及 world model、surrogate verifier、simulation 是否能提供持续反馈。

## 四、重点论文阅读报告

### 1. A Survey of Self-Evolving Agents

- **问题定义**：传统 LLM 静态部署，无法随任务、知识、环境和用户偏好持续适应。论文把研究对象定义为 self-evolving agents，即能从数据、交互、经验中持续调整自身组件的 agent。
- **核心框架**：用三个问题组织领域：what to evolve、when to evolve、how to evolve。what 包括模型参数、记忆、工具、架构、prompt、skill；when 包括 test-time 内、跨 session、部署后长期演化；how 包括标量奖励、文本反馈、单 agent 迭代、多 agent 协同、环境反馈等。
- **和 skill 自进化的关系**：它把 skill 放在 agent 可演化组件的一类中，但更重要的是提供比较维度：一个 skill 系统需要说明演化对象、触发时机、反馈来源、验证方式和安全边界。
- **值得关注**：论文强调评估和安全是短板。很多方法只报告任务成功率提升，却没有充分评估 skill 污染、错误固化、长期漂移、跨任务负迁移。
- **局限**：综述覆盖面很广，读完不能直接复现实验；适合用于建立术语、分类和文献地图。
- **阅读建议**：先读 taxonomy 和 benchmark/evaluation 部分，再回看引用表，按“memory / tool / architecture / model / multi-agent”切分后续阅读。

### 2. CoEvoSkills: Self-Evolving Agent Skills via Co-Evolutionary Verification

- **问题定义**：现有 self-evolving tool 方法多用于生成单个函数，难以生成 Anthropic-style skill 这类多文件、多角色、多 artifact 的结构化 package。人工写 skill 成本高，还可能存在人机认知错配，导致 skill 实际降低 agent 表现。
- **核心方法**：提出 CoEvoSkills，由 Skill Generator 和 Surrogate Verifier 组成。Generator 负责迭代生成或改写 skill package；Verifier 不依赖真实测试内容，而是同步演化，给出更有信息量、可执行的反馈。
- **关键创新**：把 skill 生成问题从“写一个工具函数”提升为“生成一个可执行、多文件、可被 agent 调用的能力包”。验证器不是固定打分器，而是与 generator 共同演化，缓解缺少 ground-truth 测试的问题。
- **实验与证据**：摘要中报告在 SkillsBench 上优于五个 baseline，并在 Claude Code、Codex 和额外六个 LLM 上有泛化能力。
- **和 agent skill 自进化的关系**：这是最直接相关的论文。它回答的是“skill 本身如何由 agent 自动生产、验证、迭代”，而不是只把经验写入 memory。
- **局限和风险**：surrogate verifier 的反馈质量决定上限。如果 verifier 学到的是表面格式或 benchmark 偏好，skill 可能过拟合评测而不提升真实任务表现。多文件 skill 还涉及依赖管理、权限、安全执行和版本回滚。
- **工程启发**：真实系统中应把 skill package 拆成 manifest、说明、脚本、测试、适用条件、失败案例、版本记录；每次演化必须有可回放的任务轨迹和验证结果。

### 3. AutoSkill: Experience-Driven Lifelong Learning via Skill Self-Evolution

- **问题定义**：用户在长期交互中会反复表达稳定偏好和任务模式，但普通 agent 往往不会把这些经验沉淀成可复用能力，导致跨 session 反复犯同类错误。
- **核心方法**：AutoSkill 将交互经验抽象成显式 skill，支持 skill extraction、structured representation、iterative refinement、retrieval、reuse。它不修改底层模型，而是在模型外层建立可插拔 skill layer。
- **关键创新**：skill 被定义为可编辑、可版本化、可共享、可迁移的 artifact，而不是隐藏在 prompt 历史、长期记忆或模型权重中。
- **和 agent skill 自进化的关系**：AutoSkill 更偏“个性化和长期经验沉淀”，适合产品化 agent。它关注如何把用户反馈、历史任务、偏好约束转化为稳定技能。
- **局限和风险**：摘要层面更强调架构和动机，实验细节需要进一步核查。实际系统难点在 skill 抽取边界：哪些经验值得升级为 skill，哪些只是一次性上下文；如何避免过时偏好污染后续任务。
- **工程启发**：需要 skill 生命周期管理：创建、命名、适用范围、冲突检测、触发条件、版本更新、废弃和审计。仅有向量检索不足以管理 skill，自进化系统必须有治理层。

### 4. Harness Updating Is Not Harness Benefit

- **问题定义**：LLM agent 越来越依赖可编辑 harness：prompt、skill、memory、tool、编排代码等。很多论文默认“能生成更好的 harness 更新”就等于“agent 会因此变强”，但二者可能不是一回事。
- **核心区分**：论文拆出两个能力：harness-updating，即从执行证据中生成有用持久更新的能力；harness-benefit，即任务执行 agent 在后续任务中真正利用这些更新并获益的能力。
- **主要发现**：摘要报告两个反直觉结果。第一，harness-updating 对基础模型能力不敏感，不同档位模型生成的更新带来的增益相近。第二，harness-benefit 与基础能力非单调：弱模型获益少，中等模型获益最多，强模型反而可能低于中等模型。
- **失败模式**：弱模型可能根本没有激活相关 harness artifact，或者激活后不能忠实遵循。这直接击中 skill 系统的核心问题：skill 写得好，不代表 agent 会调用和执行好。
- **和 agent skill 自进化的关系**：这是设计评估体系必读论文。任何 skill 自进化系统都应分别评估“生成 skill 的质量”和“使用 skill 的收益”。
- **工程启发**：不要只评估 skill diff 或 verifier 分数，要评估调用率、命中率、遵循率、任务收益、负迁移率、过期 skill 影响。还要把 evolver model 和 executor model 分开做 ablation。

### 5. Reinforcement Learning for Self-Improving Agent with Skill Library / SAGE

- **问题定义**：现有 skill library 方法主要依赖 prompt 生成和规则式更新，稳定性不足。论文希望用 RL 系统性增强 agent 的自改进能力。
- **核心方法**：提出 Skill Augmented GRPO for self-Evolution，简称 SAGE。关键机制是 Sequential Rollout：让 agent 沿着一组相似任务链执行，前面任务产生的 skill 累积到 skill library，后续任务可使用这些 skill。奖励方面加入 Skill-integrated Reward，鼓励有效 skill 生成和使用。
- **实验与证据**：摘要中报告在 AppWorld 上，基于 supervised-finetuned model 加 expert experience 后，Scenario Goal Completion 提高 8.9%，交互步骤减少 26%，token 生成减少 59%。
- **和 agent skill 自进化的关系**：SAGE 把 skill library 作为 RL 训练的一部分，解决“skill 只是外部记忆，训练过程不关心它”的问题。
- **局限和风险**：任务链设计会影响学习效果；skill reward 如果设计不当，可能鼓励 agent 生成看似可复用但实际无用的 skill。还要警惕在 AppWorld 这类环境上过拟合。
- **工程启发**：如果要训练内部 agent，可考虑将 skill 生成、skill 选择、skill 执行成功、调用成本纳入统一 reward，而不是只看最终任务成功。

### 6. WebEvolver

- **问题定义**：web agent 自我改进依赖在线交互轨迹，但真实 web 环境探索成本高，且自主学习容易进入性能停滞。
- **核心方法**：引入 co-evolving World Model LLM。World Model 预测当前 observation + action 后的 next observation，既可作为虚拟 web server 生成自指令训练数据，也可在推理阶段作为 imagination engine 做 look-ahead simulation。
- **实验与证据**：摘要报告在 Mind2Web-Live、WebVoyager、GAIA-web 上相较已有 self-evolving agents 有约 10% 性能提升，并公开代码。
- **和 agent skill 自进化的关系**：它不直接讲 skill package，但提供了关键反馈源：当真实环境反馈稀缺或昂贵时，world model 可为 skill 更新生成更多候选轨迹和验证场景。
- **局限和风险**：world model 本身可能 hallucinate，导致 agent 在虚拟环境中学到错误 skill。需要真实环境校准、置信度估计和失败回放。
- **工程启发**：适合用于 web 自动化 agent 的 skill 演化：先用真实轨迹归纳 skill，再用 world model 扩展场景，最后回真实环境验证。

### 7. Agents of Change

- **问题定义**：ReAct/Reflexion 类 per-turn agent 在长程、随机、对抗环境中容易反复解释大状态，策略不稳定，难以保持全局计划。
- **核心方法**：HexMachina 将环境发现和策略改进拆开。系统先诱导 unknown environment 的 adapter layer，再把策略编译成 player implementation，通过模拟对抗和代码 refinement 持续改进。
- **实验与证据**：摘要报告在 Catanatron 实验中，从零学习并演化出的 player 超过强人类手写 baseline AlphaBeta，达到 54% win rate。
- **和 agent skill 自进化的关系**：这里的 skill 更像“可执行策略 artifact”。它说明长程 agent 不应每一步都重新思考，而应把策略固化、测试、演化。
- **局限和风险**：游戏环境规则相对封闭，真实业务环境更开放，状态和奖励更难定义。策略 artifact 可能对模拟器偏差过拟合。
- **工程启发**：对复杂工作流 agent，可把稳定策略沉淀成 adapter、policy code 或 workflow skill，再通过离线仿真/回放持续评估。

### 8. Voyager

- **问题定义**：开放世界环境中，agent 需要持续探索、学习新技能、组合旧技能解决新任务，而不是只完成单个固定任务。
- **核心组件**：自动课程负责提出探索目标；skill library 保存可执行代码技能；iterative prompting 利用环境反馈、执行错误和自验证来修复程序。
- **实验与证据**：摘要报告 Voyager 在 Minecraft 中获得 3.3 倍 unique items、2.3 倍探索距离、最多 15.3 倍更快解锁关键 tech tree milestone，并能在新世界复用技能。
- **和 agent skill 自进化的关系**：Voyager 是 skill library agent 的奠基式工作。后续很多论文都在解决 Voyager 范式的不足：skill 表示不够标准、验证不够系统、迁移和治理不足、依赖强模型反馈。
- **局限和风险**：依赖 GPT-4 黑盒能力；Minecraft 环境反馈明确，和真实复杂软件任务有差异；skill 的长期维护、冲突和安全边界不是重点。
- **工程启发**：自动课程、技能检索、代码执行反馈、自验证修复，是构建 skill 自进化系统的最小闭环。

### 9. Reflexion

- **问题定义**：传统 RL 需要大量样本和参数更新，对 LLM agent 成本高。Reflexion 希望通过语言反馈实现快速 trial-and-error 学习。
- **核心方法**：agent 执行任务后，根据环境反馈、标量奖励或自评，生成 verbal reflection，并写入 episodic memory。后续 trial 读取反思，改善决策。
- **实验与证据**：摘要报告在 sequential decision-making、coding、language reasoning 多类任务上提升明显，其中 HumanEval pass@1 达到 91%。
- **和 agent skill 自进化的关系**：Reflexion 是最轻量的自进化形式：更新 memory 而不是 skill package。它适合短期失败经验，但不一定形成可组合、可迁移的技能。
- **局限和风险**：反思可能错误；记忆会堆积噪声；没有强约束保证后续 agent 忠实遵循记忆。
- **工程启发**：skill 生成前可先经过 reflection 层，把失败原因归纳为候选经验；多次重复出现且验证有效的经验再升级为正式 skill。

### 10. Promptbreeder

- **问题定义**：人工设计 prompt 策略容易次优。论文希望由 LLM 自己演化 prompt，并且连“如何变异 prompt 的 mutation prompt”也一起演化。
- **核心方法**：维护任务 prompt 种群，对训练集评估 fitness；mutation prompt 控制如何修改 task prompt；mutation prompt 本身也由 LLM 生成和改进，形成 self-referential improvement。
- **实验与证据**：摘要报告在算术、常识推理、仇恨言论分类等任务上超过 CoT、Plan-and-Solve 等 prompt 策略。
- **和 agent skill 自进化的关系**：它不是完整 agent skill 系统，但给出 prompt/harness 演化的通用算法模板。skill generator 的 prompt、verifier prompt、retrieval policy prompt 都可以借鉴这种自指演化思想。
- **局限和风险**：需要训练集评估 fitness，容易过拟合；演化出的 prompt 可解释性未必稳定；复杂 agent skill package 不能只靠 prompt mutation 解决。
- **工程启发**：适合用于自动优化 skill 编写规范、review rubric、失败诊断模板，而不是直接替代 skill package 生成。

## 五、横向对比

### 1. 演化对象

- **Memory**：Reflexion，把反思写入 episodic memory。
- **Executable skill/code**：Voyager、Agents of Change，把行为固化为代码或策略 artifact。
- **Structured skill package**：AutoSkill、CoEvoSkills，把 skill 作为可编辑、可版本化、多文件 artifact。
- **Harness**：Harness Updating，覆盖 prompt、memory、skill、tool 等外部可编辑状态。
- **World model / verifier**：WebEvolver、CoEvoSkills，把反馈生成器或验证器也纳入演化。
- **Prompt policy**：Promptbreeder，演化 prompt 及其变异策略。

### 2. 反馈来源

- **环境执行结果**：Voyager、Reflexion、Agents of Change。
- **用户交互经验**：AutoSkill。
- **验证器反馈**：CoEvoSkills。
- **RL reward**：SAGE。
- **World model 预测/模拟**：WebEvolver。
- **训练集 fitness**：Promptbreeder。

### 3. 最关键的评估问题

- skill 是否能提升任务成功率，而不只是格式更完整。
- skill 是否被正确检索、激活和遵循。
- skill 是否能跨任务、跨模型、跨环境迁移。
- skill 是否会引入负迁移、过时偏好、错误固化或安全风险。
- evolver model 和 executor model 的能力是否需要分开评估。

## 六、对“agent skill 自进化系统”的设计建议

1. **把 skill 当成一等 artifact**：至少包含名称、目标、适用条件、触发信号、输入输出、步骤、依赖、失败案例、验证方式、版本和来源轨迹。

2. **建立升级门槛**：一次失败反思不要直接变成长期 skill。可以先进入临时 memory，多次命中且验证有效后再升级。

3. **分离生成、验证、执行三个角色**：generator 负责产生 skill；verifier 负责评估 skill；executor 负责使用 skill。三者可以是不同模型或不同 prompt/harness。

4. **评估 harness-benefit，而不只评估 harness-updating**：每次 skill 更新都要做 ablation：无 skill、旧 skill、新 skill、错误 skill、不同 executor model。

5. **维护 skill 治理机制**：需要冲突检测、过期检测、合并、回滚、禁用、安全扫描和人工审核入口。

6. **优先做可回放验证**：保存任务轨迹、输入、输出、环境反馈、调用日志，让 skill 的收益可以被复验。

7. **避免只用自然语言记忆承载复杂技能**：复杂工作流应转化为脚本、测试、配置、reference、流程说明组合的 skill package。

## 七、可继续深入的关键词

- self-evolving agents
- lifelong learning agents
- agent skill library
- skill self-evolution
- harness self-evolution
- agent memory evolution
- tool learning for LLM agents
- co-evolutionary verification
- self-improving web agents
- agentic workflow memory
- recursive self-improvement agents

## 八、数据文件

结构化元数据已保存到：`02_Agent自进化/papers_metadata.json`

本报告保存到：`02_Agent自进化/reading_report.md`
