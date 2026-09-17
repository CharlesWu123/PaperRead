# Weights or Skills：冻结权重与自写 skill 的分野

> 机器人学习正分裂成两注：把能力烧进冻结权重，或让 agent 自写并自我精炼可执行 skill；只有后者不靠梯度自我改进。

## 速览

- arXiv:2608.01851v1 [cs.RO]，2026 年 8 月 3 日。作者 Gaytri Jena（UC Berkeley）、Kapil Wanaskar（San Jose State）、Vinija Jain（Meta）、Aman Chadha（Apple）、Vasu Sharma（PocketFM）、Amitava Das（Pragya Lab, BITS Pilani Goa）。原文注明「作者以独立身份而非其雇主身份完成本工作」。
- 调研范围与规模：语料窗口 2016 年 1 月 - 2026 年 7 月。分类体系内 **77 个系统**（6 个技术分支），附录 A（Table 11）另收 **225 个 landscape 工作**（11 个领域），加 7 篇前序综述与 1 份工业参考，合计 **302 个系统 / 310 条参考文献**。landscape 语料由 5 轮结构化网络检索得到 237 条候选，去掉 12 条跨轮重复后剩 225 条（Figure 4，PRISMA 2020 风格）；77 个 taxonomy 系统则用「种子 + 引文雪球」方式手工策展。
- 核心分析贡献一句话：把 code-as-policy 方法按**自改进程度**排成 5 级阶梯（零样本合成 → 闭环自修复 → skill 记忆 → 演化搜索 → 三者合一的开放式循环），并给出 Feedback / Memory / Search 三个机制的**可操作判定定义**（Table 3），指出最高一级极其稀疏。
- 对 LLM agent 读者的价值定位：这篇综述的组织轴——「冻结权重 vs 自写 skill」——与「冻结模型参数、只演化 skill 的自进化」是同一根轴。它提供三件可直接搬用的东西：(1) F/M/S 三机制的**排他性定义**（什么不算 feedback、什么不算 memory、什么不算 search），(2) "skill" 五种含义的术语澄清表（Table 5），(3) 一套把「自改进」变成可报数指标的评测协议（Table 9）。机器人特有的物理约束部分需要剥离，见 §5。

## 1. 权重 vs skill：这根轴到底在区分什么

原文把区分标准压缩成一个问句：**what ships?**（交付物是什么）——冻结的网络权重（§3.2），还是可执行的 skill（§3.1）。这不是应用领域或本体（embodiment）的划分，而是「运行时有多少能力是系统自己生产的」的划分（§3.1 开头）。

整个 taxonomy（Figure 2）分六支，两极加四个环绕家族：

- §3.1 code-as-policy（27 个系统，skills 极，本文唯一按自改进程度细分的家族）
- §3.2 端到端 VLA / generalist policy（11 个系统，weights 极，本文的对照面 foil）
- §3.3 reward / curriculum 合成（7 个系统，LLM 写 reward，最终交付仍是权重）
- §3.4 skill 库与终身学习（21 个系统，分 latent-RL / skill-space / code-lib / agent-lib 四个子族）
- §3.5 sim-to-real 与跨本体迁移（4 个系统）
- §3.6 具身 benchmark 与模拟器（7 个系统）

原文给出的「为什么是现在」的动机是 **skill stack 三层框架**：(1) Build（skill 如何被创建，§2-§3）、(2) Distribute（市场与 hub）、(3) Adapt（端上自改进，§3.1）。Unitree UniStore [243] 已经出货一键、跨型号的动作下载，但「其中每一个 skill 都是静态回放，即 taxonomy 中能力最弱的那一点」；UniStore 是建在静态第 1 层之上的第 2 层，而它承诺的价值（「按不同水果调整握力使其不被压伤」）活在第 3 层，**今天没有任何出货的 skill 做到这一层**（§1）。这个「分发层已就绪、适配层空缺」的诊断，是全文最可直接搬到 LLM agent 生态的结构性判断。


### 权重这一极：VLA 模型

架构上共享 backbone + action-head 分解：视觉-语言 backbone 编码场景与指令，可插拔的 action head 映射到运动指令（§3.2，以 π0 [15] 和 OpenVLA [120] 为据）。谱系为 RT-1 [17]（把连续动作离散成类别 bin 的 transformer）→ RT-2 [18]（把互联网预训练 VLM 与机器人轨迹共同微调，动作以文本 token 输出，从而继承 web 数据的语义泛化）→ 开源复现 Octo [66]、OpenVLA [120]（7B，DINOv2/SigLIP 视觉栈，训练于 Open X-Embodiment 混合语料）、RoboFlamingo [142]。第二条设计轴是动作表示：离散 token head（RT-1/RT-2）简单但粗糙，近期转向连续 head——π0 [15] 在 PaLI-Gemma backbone 上挂 flow-matching head 做高频双臂控制，π0.5 [14] 推向开放世界泛化，CogACT [138] 把 cognition 模块与 diffusion-transformer 动作模块分离，SpatialVLA [207] 注入 3D 空间编码。原文判断：flow/diffusion head 用少量额外参数换来远更少的推理步数与更好的高自由度精度。最大规模是 GR00T N1 [194]（慢 System-2 视觉-语言推理器 + 快 System-1 diffusion transformer）与 Gemini Robotics [65]。

隐含假设：能力可以通过**扩数据与扩参数**获得。原文对失效模式的断言很硬：「没有循环，也没有代码；能力靠 scaling 获得，靠插值而非搜索泛化，训练后无法被编辑、审计或重组」（§3.2 末）。Table 8 给出的特征失效模式是「分布漂移下的静默错误接地（silent misgrounding）」；数据需求被判为 ✘（web 规模遥操作语料，1M+ episodes、22 种本体 [195]）；可解释性 ✘；安全性 ✘（涌现行为难以在部署前验证）。Table 2 中 11 个 VLA 系统的 Self-impr. 列**全部为 ✘**。

### skill 这一极：code-as-policy

把 LLM 当作**在固定感知/控制原语库上的程序合成器**，交付可读、可编辑、可 diff 的程序。Table 8 判定其数据需求为 ✔（在预训练 LLM 上做少样本提示 [144]）、任务时程 ✔（程序可组合感知与控制原语 [100]）、可解释性 ✔、安全性 ✔（执行前可检视，且被约束在已审核的 API 内）。

失效模式与代价也明确：Table 8 记「感知错标场景时脆弱」，迁移性只给 ~——「API 级可移植，但被绑死在感知栈上」。这一点对 LLM agent 读者是直接可类比的：code skill 的可移植性取决于它调用的工具/API 表面的稳定性，而不取决于代码本身。

原文的立场不是「skill 优于 weights」，而是 Table 8 的行式读法结论：**六根轴上每根都至少有一个家族是弱的，没有任何家族在六轴上全优**。Table 8 的五家族 × 六轴（转录，✔有利 / ~ 混合 / ✘弱）：

| 轴 | 端到端 VLA (§3.2) | code-as-policy (§3.1) | reward 合成 (§3.3) | RL skill discovery (§3.4) | 市场 skill (§4) |
|---|---|---|---|---|---|
| 数据需求 | ✘ web 级遥操作语料：1M+ episodes、22 本体 [195] | ✔ 预训练 LLM 上的少样本提示 [144] | ~ 海量仿真交互，无需示范 [163] | ✘ 每本体数百万环境步 [50] | ✔ 部署时无需数据；厂商录制回放 [243] |
| 任务时程 | ~ 短反应 chunk；长任务靠串接 [18] | ✔ 长：程序可组合感知与控制原语 [100] | ✘ 每个合成 reward 一个低层 skill [163] | ✘ 时序扩展原语，非完整任务 [202] | ~ 固定多步例程；无分支 |
| 迁移 | ✔ 靠 co-training 跨任务跨本体 [195] | ~ API 级可移植，但绑死在感知栈上 | ~ 靠随机化搜索做 sim-to-real [164] | ~ latent skill 为下游 RL 打底 [206] | ✘ 仅认证机型；无适配 [243] |
| 可解释性 | ✘ 不透明权重，只能观察行为 | ✔ 可读、可编辑、可 diff 的程序 | ~ reward 代码可读，训出的策略不透明 | ✘ latent skill code，符号上不可检视 | ✘ 封闭厂商包 |
| 安全性 | ✘ 涌现行为难在部署前验证 | ✔ 执行前可检视；被约束在已审核 API 内 | ✘ reward hacking；非预期最优解 [163] | ✘ 无约束探索在硬件上不安全 | ~ 厂商认证，但无 provenance 记录 |
| 特征失效模式 | 分布漂移下的静默错误接地 | 感知错标场景时脆弱 | 只在仿真里通过的 specification gaming | skill 坍缩为退化行为 | 场景不匹配且无恢复路径 |

对做「冻结参数 + 演化 skill」的读者，这张表里最有信息量的一行是「数据需求」：code-as-policy 是唯一在**不采集新训练数据**的前提下拿到 ✔ 的家族，其代价则记在「迁移」和「失效模式」两行上。


## 2. "skill" 的五种含义

Table 5 是本文对术语最有价值的贡献。原文原话：「"skill" 一词被严重超载」（the word "skill" is badly overloaded，§3.4 开头）。五种含义、各自的表示形式、例子，以及四个属性（可检视 Inspect. / 可适配 Adapt. / 可符号组合 Compos. / 可跨机器人分发 Distrib.）如下表（数据转录自原文 Table 5）：

| 含义 | 表示形式 | 原文例子 | 可检视 | 可适配 | 可组合 | 可分发 |
|---|---|---|---|---|---|---|
| latent policy | latent 条件网络 π(a\|s,z) | DIAYN, DADS, METRA | ✘ | ~ | ✘ | ✘ |
| option / primitive | 带 skill prior 的时序扩展子策略 | SPiRL, OPAL, SkiMo | ~ | ~ | ✔ | ✘ |
| code | 某个 API 之上的可执行程序 | Code-as-Policies, Voyager | ✔ | ✔ | ✔ | ~ |
| robot app | 打包好的一键部署行为 | UniStore motion packages | ✘ | ✘ | ✘ | ✔ |
| market product | 上架、带版本、带定价的商品 | UniStore listings | ✘ | ✘ | ~ | ✔ |

逐条展开，并给出 LLM agent 语境下的对应物：

1. **latent policy（潜变量策略）**：表示为 latent 条件网络 π(a | s, z)。例：DIAYN、DADS、METRA。可检视 ✘ / 可适配 ~ / 可组合 ✘ / 可分发 ✘。
   - LLM agent 对应物：把行为编码进模型内部表示的做法，例如通过微调/LoRA 把某类行为压进权重，或用 latent 向量（soft prompt）条件化行为。不可读、不可拼装。
2. **option / primitive（选项 / 原语）**：带 skill prior 的时序扩展子策略。例：SPiRL、OPAL、SkiMo。可检视 ~ / 可适配 ~ / 可组合 ✔ / 可分发 ✘。
   - LLM agent 对应物：固定的子流程 / 子 agent / 预定义工作流节点——可以被上层规划器串接调用，但内部不透明、不能跨系统搬。
3. **code（代码）**：在某个 API 之上的可执行程序。例：Code-as-Policies、Voyager。可检视 ✔ / 可适配 ✔ / 可组合 ✔ / 可分发 ~。
   - LLM agent 对应物：写成函数/脚本/工具定义并存入 skill 库的可执行 skill（Voyager 式技能库、agent 自写工具）。
4. **robot app（机器人 app）**：打包好的一键部署行为。例：UniStore 的 motion package。可检视 ✘ / 可适配 ✘ / 可组合 ✘ / 可分发 ✔。
   - LLM agent 对应物：市场里安装即用的插件 / 打包 skill 包 / MCP server 发行版——能装，但装完不会随本地经验变化。
5. **market product（市场商品）**：被上架、带版本、带定价的商品。例：UniStore listings。可检视 ✘ / 可适配 ✘ / 可组合 ~ / 可分发 ✔。
   - LLM agent 对应物：付费 agent 商店条目、订阅制 skill 商品。

最容易混淆的两组：(a) latent policy 与 option/primitive 都被叫「skill」，但只有后者可符号组合；(b) code 与 robot app 都以「可交付的 skill」形式出现，但前者可适配、后者只是静态回放。原文强调的判据是：**只有 code 这一种含义同时满足可检视、可适配、可组合**（Table 5 caption），而**只有 app 与 market 两种含义天然可分发**——这个错配正是 §4 skill 经济必须弥合的裂缝。

摘要与结论另给出一个更强的判据：**只有 code 这一种 skill 能在不做梯度更新的情况下自我改进**（abstract；§3.4 开头；§7）。这正是「冻结参数 + 演化 skill」路线在这篇综述里的合法性依据。

## 3. code-as-policy 的自改进程度谱系

原文把阶梯拆成五个顺序问句（§3.1）：agent 是否 (i) 写控制代码，(ii) 在任务内根据执行反馈修复代码，(iii) 跨任务记住已验证的代码，(iv) 搜索一个程序种群而非沿单条修复轨迹前进，(v) 把上述全部闭合成一个开放式循环。每个「是」升一级。原文对整体形状的判断是：**种群向顶部急剧变薄——13 个零样本系统中，只有极少数最终达到 feedback + memory + search 的组合状态**（§3.1）。

阶梯全貌（转录自 Table 4 的分组与机制标注）：

| 级 | 机制组合 | 系统（年份） | Self-impr. |
|---|---|---|---|
| §3.1.1 零样本合成 | F✘ M✘ S✘ | Code-as-Policies(2023), ProgPrompt(2023), VoxPoser(2023), Instruct2Act(2023), ChatGPT for Robotics(2023), TidyBot(2023), RoboCodeX(2024), RoboScript(2024), Text2Motion(2023), Demo2Code(2023), Statler(2024), Prompt2Walk(2024), RoboPro(2025) | ✘（13 个全部） |
| §3.1.2 闭环自修复 | F✔ M✘ S✘ | Inner Monologue(2022), DoReMi(2024), REFLECT(2023), Code-as-Monitor(2025), AHA(2024), Introspective Planning(2024) | ✘（6 个全部） |
| §3.1.3 skill 库累积 | M✔ | Voyager(2023), LRLL(2024), RoboCoder(2024), Uni-Skill(2026), DROC(2024, F✔M✔) | ~（5 个全部） |
| §3.1.4 演化程序搜索 | F✔ M✘ S✔ | CaP-X(2026), RoboEvolve(2026), GEAR / Code Evolution(2026) | ~（3 个全部） |
| §3.1.5 完整循环 | F✔ M✔ S✔ | ASPIRE(2026), ENPIRE(2026), RoboClaw(2026) | ✔（3 个全部） |


### 三个机制的可操作定义（Table 3）——本文最可复用的部分

- **Feedback (F)** 算：任务内读取并用于修改代码的**执行接地信号**——失败检测器触发、对出错情况的感知或文本摘要、通过运行程序获得的 verifier 或 reward（仿真 reward 在 agent 用它来修改代码时也算）。
  不算：新的人类指令；从不在运行时被查询的固定预训练 value function；**未与执行接地的自然语言批评**。
- **Memory (M)** 算：运行时写入的内容跨任务边界持久化且被后续任务检索——持久 code-skill 库，或可检索的过往解法 episodic 文本记忆。
  不算：模型的冻结预训练权重；episode 结束即丢弃的任务内 scratchpad；**agent 无法扩展的固定 API 库**。
- **Search (S)** 算：维护一个以上候选程序，用执行打分，并在其间选择或变异——采样程序选择、演化变异、beam search。
  不算：对单个候选的单条顺序修复链（那是 Feedback）；无选择的一次性采样；**候选之间从不互相比较的重复提示**。

这三条排他定义解决的正是当前 LLM agent 领域最常见的三种夸大：把无接地的自我批评说成反馈、把上下文窗口/系统提示说成记忆、把反复重采样说成搜索。

### 3.1.1 零样本程序合成（F ✘ M ✘ S ✘，13 个系统）

判定条件：发出可执行控制代码，但不闭合任何回到代码生成的执行环路。Code-as-Policies [144] 确立范式：给 LLM 一个 API 加自然语言指令，让它输出组合原语的可执行 Python，并可递归定义未定义函数、用算术和反馈逻辑参数化控制。ProgPrompt [236] 把可用动作与物体作为可导入符号暴露给程序以完成情境接地；VoxPoser [100] 让模型写代码来组合 3D value map 交给运动规划器，而不是调用固定 skill，从而松开对手写 API 的依赖。后续扩展输入模态与任务时程：RoboCodeX [186]（多模态观测条件）、Instruct2Act [97]、RoboPro [273] / Demo2Code [251] / Text2Motion [147]（视频与示范条件）、Statler [285]（跨步显式维护世界状态）、TidyBot [265] 与 ChatGPT for Robotics [244]（真机上的个性化与提示设计）。这一级的统一限制：**程序只写一次，从执行回到合成器没有通道，运行时失败就是失败**。

### 3.1.2 闭环自修复（F ✔ M ✘ S ✘，6 个系统）

判定条件：有 feedback，但无 memory、无 search；任务内根据执行接地信号修改代码，跨任务什么都不留，也从不比较候选种群。Inner Monologue [102] 把成功检测器、场景描述与人类反馈以语言形式回灌模型，使其在某步失败时重规划；DoReMi [73] 检测计划与执行间的错位并触发恢复；REFLECT [159] 构建过往交互的分层多模态摘要供 LLM 查询以解释失败并提出修正；Code-as-Monitor [306] 把时空约束编译成视觉-语言检查；AHA [48] 训练模型显式推理失败模式；Introspective Planning [145] 处理不确定性与任务歧义。原文对这一级的评语：**闭环是新意，但这是一个短环——修正在任务边界被丢弃，什么也不积累**。

### 3.1.3 skill 库累积（M ✔，5 个系统）

判定条件：memory 存在——已验证代码被写入跨任务存储并在之后检索，**与是否使用任务内反馈无关**。原文把系统目录挪到 §3.4.3 统一列出。Voyager [250] 是范例：持续策展一个不断增长的已验证 skill 程序库，并带「何时适用」的守卫条件（when-to-apply guards）；DROC [294] 把语言纠正蒸馏成可检索知识供未来任务使用。Table 4 中这一格列的是 Voyager、LRLL [242]、RoboCoder [137]、Uni-Skill [274]、DROC，五者 Self-impr. 均记为 ~（部分）。与 §3.1.2 的关键差别是**时间尺度：能力跨任务复利，而不是每次重建**。

（此处原文表述略有不一致：Table 4 给 §3.1.3 这一格的表头标注是 F ✘ M ✔ S ✘，但同格内 DROC 的 F 列标为 ✔；另外 Table 2 给 RoboCoder 的 Self-impr. 记 ✘，Table 4 却记 ~。）

### 3.1.4 演化程序搜索（F ✔ M ✘ S ✔，3 个系统）

判定条件：search 存在——维护并在多个候选程序间选择，而不是修复单一候选。CaP-X [58] 提供面向这类编码 agent 的交互式 gym 与 benchmark；RoboEvolve [26] 把规划器与学得的模拟器耦合成协同演化环，**挖掘近失败（near-miss failures）来稳定搜索**；GEAR / Code Evolution for Control [72] 通过 LLM 驱动的演化搜索合成策略。原文对本级的定性：**从「修复」转向「搜索」，探索变得显式且并行，用算力换取跳出局部失败的机会**。

### 3.1.5 完整自改进循环（F ✔ M ✔ S ✔，3 个系统）

判定条件是三机制的**合取**，且在同一个闭环内（Figure 10：task → actor agent → 执行引擎(F) → skill memory(M) → 演化搜索(S) → 已验证 skill 回流给未来任务）。占据者：

- **ASPIRE [160]**：把一个「按原语发出多模态 trace」的机器人执行引擎，与一个已验证代码的 skill 库，以及一个对候选程序的种群搜索配对。2026，真机评测。
- **ENPIRE [272]**：在物理硬件上闭合同构的环，手段是**自动复位、并行 rollout、日志驱动的修改（log-driven revision）**。2026，真机评测。
- **RoboClaw [139]**：把数据采集、策略学习与执行统一在单一控制器下，带自复位循环。2026，真机评测。

跨级门槛在哪：从 3.1.1 到 3.1.2 的门槛是**拿到执行接地的失败信号**（不是人类再下一句指令，也不是无接地的自我批评）；从 3.1.2 到 3.1.3 的门槛是**跨任务持久化 + 检索 + 验证守卫**（Voyager 式的 when-to-apply guard）；从 3.1.3 到 3.1.4 的门槛是**候选之间必须被执行打分并互相比较**；到 3.1.5 的门槛按原文证据看主要是**工程基础设施**——ENPIRE 的自动复位与并行 rollout、RoboClaw 的自复位统一控制器、ASPIRE 的按原语 trace，都是「让循环能无人值守跑很多轮」的机制，而非新的算法思想。

原文明确表态：**「这一格如此稀疏本身，而非其中任何具体系统，才是本综述要作出的结构性观察」**（§3.1.5）。Figure 7 给出的时间分布支持这点：skills 极的系统按首次发布年为 2022:1、2023:9、2024:9、2025:2、2026:6（共 27），weights 极为 2023:2、2024:5、2025:4（共 11）；三个满环系统全部是 2026 年（2026 只统计到 7 月，为部分年份）。

Table 7 的能力矩阵按四个代表系统逐轴对比（转录）：

| 维度 | full loop（ASPIRE/ENPIRE/RoboClaw） | π0 | Code-as-Policies | Eureka |
|---|---|---|---|---|
| 输出什么 | skill 代码 + 库 | action chunks | policy code | reward code |
| 如何改进 | F+M+S 循环 | 梯度预训练 | 一次成型，不改进 | RL + reflection |
| 需要梯度训练 | ✘ | ✔ | ✘ | ✔ |
| 持久 skill 库 | ✔ | ✘ | ✘ | ✘ |
| 失败反馈信号 | 执行 trace | – | – | 训练统计 |
| 搜索策略 | 演化 | – | – | – |
| 真机验证 | ✔ | ✔ | ✔ | ✔ |
| 持续 / 开放式 | ✔ | ✘ | ✘ | ✘ |
| 超越固定 API | ✔ | ✔ | ✘ | – |
| 可解释 / 可编辑 | ✔ | ✘ | ✔ | ✔ |

注意「需要梯度训练 ✘ + 持久 skill 库 ✔ + 可解释可编辑 ✔」这一列组合只在 full-loop 格出现——这就是「冻结参数、只演化 skill」路线在本文体系里的精确坐标。


## 4. skill 这一极的全景

§3.4 问的是前一个问题：一套 skill 库究竟**怎么被建起来**。组织轴是「skill 学成 latent RL 策略」vs「skill 存成可检索代码」，且只有代码那一味不靠梯度自我改进。Table 6 共 21 个系统。

- **§3.4.1 无监督 / latent skill discovery（RL，5 个，全部 sim，全部梯度训练，无持久库）**：最老的谱系，无任务 reward、无代码，靠最大化信息论目标学出多样行为。DIAYN [50] 最大化 latent skill code 与访问状态间的互信息；DADS [229] 让 skill 具备 dynamics-aware 性质从而可用于基于模型的控制；LSD [200]（Lipschitz 约束）、CIC [129]（对比目标）、METRA [202]（度量感知抽象）分别推向更动态、更远达、更可扩展。
- **§3.4.2 skill 空间与分层 RL（4 个，全部 sim，梯度训练，无持久库）**：从离线数据抽出连续 skill 空间再在其中规划或学习。SPiRL [206] 学 skill embedding 加 skill prior 以加速下游 RL；OPAL [6] 为离线 RL 发现时序扩展原语；PARROT [235] 学可逆行为先验；SkiMo [231] 学 skill dynamics model，直接在 skill 空间规划。
- **§3.4.3 LLM 与代码 skill 库（7 个，全部 LLM-authored、全部有持久库）**：Voyager [250]（Minecraft，已验证代码 skill 的持续增长库）、LOTUS [248]（通过无监督 skill discovery 做持续模仿学习）、LRLL [242]（用语言模型自举可组合机器人库）、BOSS [297] 与 SPRINT [295]（LLM 引导的自举与指令重标注扩充技能谱）、Uni-Skill [274]（从无结构机器人视频构建自演化 skill 仓库，真机）、SkillFlow [300]（对终身发现、打补丁与复用做基准，text 域）。
- **§3.4.4 开放世界 LLM agent 库（5 个，全部有持久库，4 个 game 域 + ExpeL 为 text）**：GITM [309] 与 JARVIS-1 [259] 把规划器与文本/多模态记忆配对；ExpeL [301] 从试验流中抽取可复用洞见；Optimus-1 [143] 加混合多模态记忆做长时程任务；Odyssey [157] 给 agent 配备原语与组合 skill 的开放世界库。原文说这些系统预演了 §4 的市场动力学：**一个随使用而增长的库**。

一个跨极的桥梁系统值得单独记：**RoboCat [16]**（§3.5，TMLR 2023）——目标条件的多本体 agent，可从少至 100 条示范适配新任务，然后**为下一轮训练生成自己的数据**，构成 §3.1 所显式化的那种雏形自改进环。它是全表中唯一被记为 Self-impr. ✔ 的「ships weights/policy」类系统。

§6 给出的第三个未来方向直接针对这条分裂：**弥合 skill 的 RL 味与 code 味**——「代码包裹、调用并精炼学得的策略，而学得的策略又被蒸馏回可检视的代码」，从而让 §3.1 的自改进机制同时作用于两者。原文说这个方向的进展「在复用率跨越家族边界时变得可读」，即用 skill 库复用率作为衡量。

### skill 经济：§4 列出的七个开放问题

这一节把 taxonomy 接到商业现实上，七个问题按原文顺序：

1. **static-to-adaptive gap**（静态到自适配的落差）：今天出货的每个 skill 实质上都是回放——安装并执行，不感知这个厨房、这个夹爪、这个物体是否与它被创作时的不同。§3.1 的任务内修复、持久记忆与搜索，正是让下载来的 skill 在目标机器人上自适配所需的东西。原文的说法很到位：**这是「一家动画商店」与「一家能力商店」的区别**；它是把 §3.1.5 循环应用到「基础 skill 是给定的而非自己发现的」这一分发场景。
2. **跨本体可移植性**：UniStore 宣传同一 skill 可在 G1/H1 人形与 B2/Go2 四足上跑；没有共享动作接口 [195] 或显式本体适配，为一个平台调好的包在另一个平台上没有正确性保证。「形式化的可移植性——一个 skill 要在新躯体上被认证需要满足什么」仍未解决。
3. **provenance 与信任**：市场邀请第三方众包上传，包括原始动捕数据和来源不明的代码。因为机器人 skill 作用于物理世界，provenance（谁写的、基于什么数据、如何验证）成为**安全属性而非元数据点缀**。目前没有任何被接受的标准来签名、认证或审计一个机器人 skill 的来源。
4. **安全验证**：厂商承诺「每个 skill 都经过扫描、测试与验证」，但对 code-as-policy skill 而言这在一般情况下不可判定、实践上也很难，因为 skill 的效果取决于它遇到的场景。可操作的问题是：skill 必须声明哪些前置条件、必须通过怎样的沙箱或仿真筛查、运行时监控（参照 Code-as-Monitor [306]）如何在未见输入上界定行为。
5. **skill 组合**：下载两个 skill 理想上应产出第三个（「泡咖啡」+「清理桌面」= 早间流程）。组合需要共享接口和一套关于前置/后置条件的演算；今天的动作包不透明、不可组合，而代码 skill 只在单一创作系统内部可组合。
6. **可移植性标准与 skill 本体（ontology）**：规模化复用需要共享词汇——声明的前置条件、预期效果、本体能力画像，以及 requires / provides / substitutable-by 这类关系。已有的 skill ontology 与硬件级复用工作指出了方向，但不存在跨厂商标准。
7. **本地库 vs 共享库**：本文刻意区分的两种「skill 库」——机器人从自身经验长出的自建库（§3.1）与从市场下载的共享库（UniStore）——需要被调和。有趣的机制是混合形态：一个既向 commons 贡献又从中取用的 agent，而**它的激励机制、质量控制与反馈动力学完全未被研究**。


## 5. 可跨领域迁移到 LLM agent 的洞察

### 可以直接搬的

1. **F/M/S 三机制的排他定义就是一套自进化系统的验收清单**（Table 3）。搬到 LLM agent 上几乎无损：无接地的自我批评不算 feedback（必须有测试通过/失败、verifier 输出、可执行的运行结果）；上下文窗口和 episode 内 scratchpad 不算 memory（必须跨任务持久化并被检索）；不比较候选的重复重采样不算 search（必须执行打分后选择或变异）。这一点尤其针对「reflexion 类自我批评」的过度宣称。
2. **「agent 无法扩展的固定 API 库不算 memory」**。这一条对 LLM agent 的判定很锋利：只挂了一堆预定义工具的 agent，无论工具多丰富，都停在 3.1.1 级。可扩展性（agent 能否新增/改写自己的工具）才是升级点。
3. **五种 skill 含义的错配结构**（Table 5）完整迁移：可检视/可适配/可组合的只有 code，可分发的只有打包产物。LLM agent 的 skill 市场（插件/skill 包/MCP 发行版）正在重复机器人 skill 商店的同一个错误——分发的是静态回放，而承诺的价值在本地适配层。原文的三层「skill stack」框架（Build / Distribute / Adapt）可以逐字搬用：**今天没有任何出货的 skill 落在 Adapt 层**。
4. **持久 skill 库需要「何时适用」的守卫条件**（Voyager 的 when-to-apply guards）。这是 skill 记忆能被正确检索的前提，与领域无关。
5. **从「修复」到「搜索」的相变**：单条修复链和候选种群是不同量级的机制，后者「用算力换跳出局部失败的机会」。对 LLM agent 的 skill 演化，意味着必须保留多个 skill 变体并按执行结果择优，而不是原地不断重写同一个。
6. **RoboEvolve 的「挖掘近失败来稳定搜索」**：把接近成功的失败样本作为搜索的稳定化信号，是与本体无关的搜索工程技巧。
7. **评测协议整体可迁移**（Table 9 / Figure 11）。四个量：success-vs-interactions 曲线（报曲线与其面积，而非单点终值）、skill 库复用率（新任务解法中调用了至少一个已存 skill 的比例，以及每个已存 skill 的平均被调用次数）、跨本体迁移落差、provenance 检查覆盖率。前两个对 LLM agent 完全适用，且原文的批评同样成立：**现有 benchmark 只测一次性能力，报的是「策略是否成功」而不是「它是否随经验变好」；至今没有标准 benchmark 把留出集成功率画成累积交互量的函数**。
8. **可解释性与安全性同源**：Table 8 把 code-as-policy 的安全性判为 ✔ 的理由是「执行前可检视，且被约束在已审核的 API 内」。对 LLM agent 而言，这正是「演化 skill 而非演化权重」的最强论据——skill 是可 review、可 diff、可回滚的对象，权重不是。

### 一张迁移对照表

| 原文机制 / 结论 | 机器人语境的具体形态 | LLM agent 的对应物 | 可迁移性 |
|---|---|---|---|
| Feedback（执行接地） | 失败检测器、感知摘要、运行程序得到的 verifier/reward | 测试结果、类型检查、工具返回码、可执行 verifier | 完全可迁移 |
| Memory（跨任务持久化） | 已验证代码的 skill 库 + when-to-apply guard | 持久 skill/工具库 + 触发条件描述 | 完全可迁移 |
| Search（种群比较） | 采样程序选择、演化变异、beam search | 多个 skill 变体并行执行后择优 | 完全可迁移，且成本远低 |
| 「固定 API 库不算 memory」 | 手写感知/控制原语库 | 预定义工具集 | 完全可迁移 |
| skill 五义错配 | 可适配的是 code，可分发的是 app | 可适配的是自写 skill，可分发的是插件包 | 完全可迁移 |
| 自动复位 + 并行 rollout | 物理场景复位机构、多机并行 | 隔离沙箱重置、多会话并行 | 可迁移但难度骤降 |
| 不可逆性 / 采样成本 | 真机磨损、人工介入、时间成本 | 仅在接触支付/发信/写库/运维时出现 | 部分可迁移 |
| 跨本体迁移落差 | 形态学、动作空间、动力学差异 | 工具栈 / 模型 / 运行时差异 | 形式类似，成因不同 |
| 感知错标导致脆弱 | 传感器与视觉误检 | 上下文/状态读取错误 | 部分可迁移（无连续噪声层） |
| reward hacking | 只在仿真通过的 specification gaming | 刷 verifier / 刷评测指标的 skill | 完全可迁移 |
| provenance 作为安全属性 | skill 作用于物理世界 | skill 作用于生产系统与真实数据 | 在有副作用时可迁移 |

### 不能直接类比的（机器人领域特有）



1. **物理执行的不可逆性**。§4「安全验证」一节的核心论断是：对 code-as-policy skill 的验证「一般情况下不可判定，实践上也很难，因为 skill 的效果取决于它遇到的场景」；且「机器人 skill 作用于物理世界，所以 provenance 成了安全属性而非元数据点缀」。LLM agent 中大量 skill 是可回滚的（纯文本生成、只读查询），沙箱重放成本近乎为零——这使演化搜索的采样预算可以高出几个数量级。但要注意：一旦 LLM agent 接上支付、发信、写数据库、执行运维命令，不可逆性就回来了，这时机器人的结论重新适用。
2. **真机采样成本与自动复位**。ENPIRE 的贡献很大一部分是自动复位与并行 rollout，RoboClaw 是自复位循环——这些工程量在 LLM agent 里基本消失（重置一个环境 = 重置一次会话）。所以「3.1.5 稀疏」这个结论**在 LLM agent 领域不应被同等悲观地理解**：机器人域的稀疏主要由硬件循环成本造成，LLM agent 域的稀疏更多是设计选择造成的。我的判断：这是本文最容易被误读的结论。
3. **不受约束的探索在硬件上不安全**（Table 8 对 RL skill discovery 的安全判定 ✘）。LLM agent 的探索约束是权限与副作用边界，不是机械损伤，性质不同。
4. **跨本体可移植性（cross-embodiment）**。Open X-Embodiment [195] 汇集 21 家机构的 60 个数据集、超过 100 万条轨迹、22 种本体；CrossFormer [44] 在 20 种本体的 90 万条轨迹上训一个 transformer；Mirage [29] 用 cross-painting 做零样本跨本体迁移。「同一个 skill 能否在 G1/H1 人形与 B2/Go2 四足上运行」是形态学、动作空间、动力学的问题。LLM agent 的对应问题是「skill 能否跨不同工具栈/模型/运行时」，形式上类似但难度来源完全不同——后者是接口契约问题，前者是物理一致性问题。**Table 8 里 code-as-policy 的迁移性只得 ~，理由是「被绑死在感知栈上」；搬到 LLM agent 上，对应的是「被绑死在工具/API 表面上」，这一条是可类比的。**
5. **感知错标导致的脆弱**（code-as-policy 的特征失效模式）。LLM agent 的对应物是上下文/状态读取错误，但没有连续传感器噪声这一层。
6. **reward hacking / specification gaming**（§3.3 家族的失效模式，Eureka 相关）。这一条虽在机器人上下文给出，但对任何用可自动打分的 verifier 驱动 skill 演化的系统都成立，属于**可迁移**——只要打分器可被利用，skill 就会朝利用它的方向演化。
7. **§3.3 reward synthesis 家族整体不可直接搬**：它保留 LLM 作为程序员，但产物是 reward / 环境 / curriculum，最终交付的仍是**权重**（Eureka [163] 在 29 任务 IsaacGym 套件上于 83% 任务超过专家人写 reward；DrEureka [164] 额外合成 domain randomisation 范围实现零样本真机运动；Text2Reward [275] 在 17 任务套件上多数匹配或超过专家 reward；Language-to-Rewards [288] 以 reward 作为 LLM 与 MuJoCo MPC 的接口；Eurekaverse [146] 让 LLM 提议逐步变难的环境课程；RoboGen [256] 跑 propose-generate-learn 循环）。对「冻结参数」路线，这一家族是反例而非样板。但其中一个机制是可搬的：**reward reflection**——把训练统计的文本摘要回灌给 LLM 作为演化搜索的引导信号，这是「用聚合统计而非单次结果做 feedback」的范式。

## 6. 综述本身的局限

原文 §5 自陈四点：

1. 组织轴（自改进程度）**刻意是 code-centric 的**，它把权重类策略（§3.2）与 RL skill discovery（§3.4）当作背景而非分类对象。原文承认：一篇以表示学习或真实世界数据采集为中心的综述会画出完全不同的地图。
2. 它强调的前沿（§3.1.5）由**极新、部分是并行同期**的系统构成，跨系统 benchmark 数字不可直接比较，因此只做定性能力描述而不排名。
3. 领域移动很快，若干被引的 2025-2026 系统是在综述撰写期间发布的，覆盖应当被读作一个快照。
4. 「skill 经济」框架建立在**一个新兴商业趋势（撰写时仅一家厂商的市场，Unitree UniStore [243]）** 之上，作者把它当作 open problems 的动机而非成熟结果。

我另外观察到的边界情况：

- **77/225 的划分是分析角色的划分，不是质量判断**（§2.1 原文明确说明）。进入 taxonomy 需过三关：axis-placeable（在 weights-vs-skills 问题上取无歧义立场）、distinct（贡献了地图中尚无的机制/级/分支范例，而非近变体或消融）、fully characterisable（一手来源信息足以填满每个比较列而无需推断）。未过关的工作留在 landscape 附录。这个规则透明，但也意味着**taxonomy 的系统计数不能被当作领域产出统计**——原文在 Figure 5/6/7 的 caption 里反复声明这一点。
- **验证失败被丢弃的候选数量未被记录**，原文选择明说而不估算（§2.1、Figure 4）。这是诚实的，但也意味着 PRISMA 流程图的排除环节不可复算。
- 分类边界的实际摩擦：§3.1.3 与 §3.4.3 是同一批系统的两次列举（原文自己说明「因为 memory 轴本身就是一个完整技术家族，我们在 §3.4 统一编目」），Table 4 因此有 30 行而 §3.1 分支只有 27 个系统。DROC 同时具备 F 和 M 却被放在 memory 级，说明**阶梯是一个 5 级序数标签，但底层其实是 F/M/S 三个二元位（8 种组合）**，序数化必然压掉一些格子（例如 F✘M✘S✔、F✘M✔S✔ 未被命名）。这是分类体系最明显的边界瑕疵。
- Table 2 与 Table 4 对 RoboCoder 的 Self-impr. 判定不一致（✘ vs ~）。
- **语料画像本身也提醒了取样偏差**（Figure 6，225 个 landscape 工作的精确计数）：按主要评测域，sim 101、real 80、game 26、offline 14、n/a 4；按主要学习信号，IL 57、RL 56、LLM 39、model-based 27、self-sup 18、n/a 16、offline-RL 12；按主要本体，arm 87、n/a 64、mobile 24、multi 21、humanoid 12、legged 9、hand 8；按年份，2023 年 64 篇、2024 年 53 篇为峰值（2025 只有 9 篇，2026 未在该图统计）。也就是说，**仿真评测与机械臂本体在语料里占主导**，而 LLM 作为学习信号只占 39/225。领域分布上，LLM planning / TAMP 30、end-to-end/generalist 28、skill discovery / hier. RL 25、world/model-based 24、imitation/diffusion 21、repr./offline RL 17、reward/data generation 17、manipulation/dexterity 16、locomotion/humanoid 16、datasets/bench/sim 16、navigation/tactile 15。
- **§3.6 的 benchmark 结论对自进化研究最不利**：LIBERO [149]（终身操作与跨任务套件知识迁移）、Meta-World [286]（50 个操作任务）、RLBench [105]（100 个带示范的视觉任务）、ManiSkill2 [71]（20 个任务族，GPU 并行）、Robosuite [310]（底层 MuJoCo 模块框架）、CALVIN [178]（按链式子任务平均完成数评长时程语言条件控制）、BEHAVIOR-1K [134]（1000 个日常家务，同时评成功与效率）——**这些套件测的都是一次性能力**。
- 与前序综述的对比（Table 1）显示，本文声称独占的两根轴是「按自改进程度组织（含 §3.1.5 那一格）」和「skill 市场经济」；最近的 CSUR 综述覆盖 world models [41]、embodied intelligence [153]、基础语言模型导航 [197]，CSUR 之外有一簇覆盖 VLA 与操作基础模型 [161, 228, 135, 305]。这个「独占性」声明本身依赖于对比表的选取范围，只列了 7 篇。

- §3.6 指出所有 benchmark 只报单一数字成功率，而 §6 提出的四个新指标**没有任何一个已被实际测量**——Figure 11 明确标注「面板是示意图，展示的是各测量的坐标轴与目标形状，不是实测结果」。

## 7. 可复用的工程要点

1. **用 F/M/S 三个二元位给自己的 skill 自进化系统打标，并逐位补齐**。按 Table 3 的排他定义严格自评：反馈是否执行接地（有 verifier/测试/运行结果，而非模型自述）；记忆是否跨任务持久且可检索（而非上下文或 episode 内 scratchpad）；搜索是否维护 >1 个候选并按执行分数择优（而非重复重采样）。三位齐备才是「完整循环」，这也是原文认定只有 ASPIRE / ENPIRE / RoboClaw 达到的标准。
2. **每个入库 skill 都带 when-to-apply guard 与验证记录**（Voyager 的做法）。不带前置条件声明的 skill 在库变大后会被错误检索，这是 skill 记忆从「资产」退化为「噪声」的主要路径。配套地，按 §4「portability standards and skill ontologies」的建议声明 pre-conditions、expected effects，以及 requires / provides / substitutable-by 这类关系。
3. **投资「循环基础设施」而非只投算法**。3.1.5 三个系统的共同点是自动复位（ENPIRE）、并行 rollout（ENPIRE）、按原语的结构化 trace（ASPIRE）、统一控制器下的自复位循环（RoboClaw）。对 LLM agent 的等价物：可一键重置的隔离沙箱、可并行的多 rollout 执行器、以及**结构化到「每个原语/工具调用一条」粒度的执行 trace**（而不是一整段日志），因为修改代码需要定位到具体调用。
4. **把两个指标接入自己的 CI**：success-vs-interactions 曲线（留出任务成功率随累积自主交互量的变化，报曲线与曲线下面积而非终点单值）与 skill 库复用率（新任务解法中调用了至少一个已存 skill 的比例 + 每个已存 skill 的平均调用次数）。原文的判断值得照抄：有了这两条曲线，「自我改进」才从一个宣称变成一个报出来的数字。
5. **给种群搜索加「近失败挖掘」**（RoboEvolve）。只保留成功样本会让搜索信号过稀；把接近成功的失败作为变异的优先起点，是稳定搜索的低成本手段。
6. **警惕 skill 迁移性被绑死在工具表面上**。Table 8 给 code-as-policy 的迁移性只打 ~，理由是它绑死在感知栈。工程上的对策是把 skill 对外部世界的依赖收敛到一层显式的、版本化的能力接口（原文 §4 称之为 embodiment-capability profile），这样换工具栈时只需替换接口实现而不必重写 skill 库。
7. **本地库与共享库的混合形态目前无人研究**（§4 最后一条：既向公共 commons 贡献又从中取用的 agent，其激励机制、质量控制与反馈动力学「完全未被研究」）。如果做的是「冻结参数 + 演化 skill」，这里是一块空白地：本地演化出的 skill 如何在保留 provenance（谁写的、基于什么数据、如何验证）的前提下上行到共享库，是一个开放且可占位的工程问题。
