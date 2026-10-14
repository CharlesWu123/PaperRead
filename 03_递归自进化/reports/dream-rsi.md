# Dream-RSI：把发现历史变成可回放的「世界」，在 meta 层闭环自改进

> 冻结底座 agent 与评测器，只让「怎么探索」这段策略代码被反复改写；改写用的反馈来自对历史发现树的低成本回放「做梦」。

## 速览

- **arXiv / 日期 / 机构**：arXiv:2609.14858v2 [cs.CL]，2026 年 9 月 14 日 v1、2026 年 10 月 6 日 v2，11 页。Google、University of Maryland（College Park）、Google DeepMind、University of Virginia 联合；共 17 位作者，一作 Tong Zheng，通讯 Xidong Wu、Zheng Zhang（均 Google）。项目页 dream-rsi.com，代码仓库 github.com/zhengkid/Dream-RSI（论文称 codebase / reproduction scripts 仍在准备中）。
- **是否冻结参数**：明确冻结。Section 3 原文："For online rollout, the exploration policy directs a **fixed** discovery agent …"；"In the offline dreaming phase, a **fixed** agent iteratively revises the code for the exploration policy"；"**Only the policy code changes; the models, evaluator, and execution interfaces stay fixed.**" 摘要同样写 "leaving the underlying base agent unchanged"。全文无任何训练/微调环节。
- **演化对象**：**探索策略（exploration policy）的可执行代码**——控制「在发现树里下一步开哪个分支、开几个、以多大并发、何时停」的控制器（代码里实现为 `OptimalPolicy.solve(self, question, budget=None)`）。这是 meta 层对象，不是任务解本身，也不是底座模型的权重。
- **验证信号来自哪里**：(1) 任务侧是**固定、外部、客观**的 evaluator——KernelBench 用正确性检查 + 逆运行时间、Lasso 用目标值检查 + 运行时间几何均值、数学题用题目自带目标函数、harness 用 Terminal-Bench 2.1 原生判分；(2) meta 侧是**自造的回放目标** $V_i^m$——对历史发现树做「预算扫掠」，取归一化 hypervolume（质量–成本 Pareto 前沿）再减一个并行度惩罚项，纯离线、无新 rollout。也就是说，**meta 层的「好坏」由系统自己构造的模拟器打分**。
- **一句话贡献**：把「已完成的发现历史」从静态上下文/训练数据，重新诠释为**可回放的模拟器（replay simulator / world）**，从而把 meta 层策略改进从「昂贵延迟的在线试错」变成「廉价的离线做梦」，并据此闭合成一个 meta 层的 RSI 循环。

## 1. 问题：RSI 的瓶颈正在从「改什么」搬到「怎么探索」

论文的出发点和本目录的主线一致但换了个落点。它承认 RSI 的通用机制是「提议候选 → 评估 → 把反馈折进下一轮」，并指出当 agent 变强、改进目标变难之后，发现过程需要**在巨大搜索空间上做长程探索，动辄数千次提议–评估循环**（引 Ye et al., 2026；OpenAI, 2026）。在这个规模下，**「如何编排探索」本身成为关键瓶颈**：探索得差就白白烧算力，直接压住 RSI 的效率与可扩展性。

对既有做法的批评有两处：

- 主流系统依赖**人工设计、全程固定**的探索策略（AlphaEvolve、PACEvolve、MLEvolve、DeltaEvolve、SimpleTES 一类）。它们无法从积累的经验里学习，可能反复把算力花在无产出的方向上。
- 近期有工作尝试**在线优化探索策略**（如 EvoX），但撞上两个根本障碍：其一，**meta 层反馈延迟且昂贵**——评价一条探索策略要看它在很多轮提议–评估中如何塑造整个发现过程，而不是评一个候选解；其二，**meta 策略空间巨大**，得试很多条才能找到好的。两者叠加使 meta 层改进极贵，每条策略都要跑一次长长的在线 rollout 才有一点信号，于是**自改进循环在探索层很难闭合**。

论文要补的洞因此很具体：**在昂贵的在线部署之前，先给探索策略做一次快速、廉价的筛选。**

## 2. 核心洞察：发现历史 = 一个已经建好的回放模拟器

作者的观察是：**一次已完成的发现过程，本身就记录了一棵「探索决策 × 真实代码执行结果」的结构化树。** 既有工作要么把它当成静态文本上下文（history-as-context），要么当成微调训练数据；而论文指出，这棵树可以直接充当一个**经验回放模拟器**——对「已经被看过的那部分发现空间」的一个 grounded 模型。

类比写得很清楚（Section 2）：一个 agent 初次进入陌生环境会乱走、撞死胡同、回溯，但**它顺手画出了一张地图**。地图可复用：新策略可以在地图上规划、跳过已知死路、重访早期选择、比较路线，而**不必再实地走一遍**。这正是 model-based RL 的逻辑——有了环境响应模型，策略就能在模拟里训练/评估，而不必反复真交互。Dreamer 家族是最典型的例子：从经验里学一个紧凑动力学模型，然后在里面「想象」轨迹来改进策略。

对应到长程发现：一条探索策略决定「追哪些方向、精炼哪些候选、并行开哪些分支、何时停」；跑完之后留下结构化历史。**在这段历史里换一条策略，无非是沿这棵记录树走一条不同的路径**——换分支、换顺序、换并行度、换更早的停止点。给这条路径打分**只需要揭示沿路已经存好的结果，不需要重跑 coding agent 或 evaluator**。于是「一次昂贵的在线运行，可以供很多次廉价的替代策略评估」。

需要立刻标注的一个关键限定：这里的「world」**不是学出来的动力学模型**，而是**对已实现搜索空间的确定性重放**。它只能评估「在已探索分支上如何重新分配算力」，**无法凭空产生新分支**——这是它和 Dreamer 式世界模型的本质差别，也决定了这套机制的能力上界（见第 6 节）。

## 3. 方法详解

### 3.1 发现树与共享决策接口

- **发现树**以 $r$（初始工作区状态）为根。每个非根节点 $v$ 恰有一个 primary parent：agent 恢复父节点保存的工作区、继承其累积观测作为上下文，据此在 $v$ 生成一次尝试。$v$ 保存该次尝试的完整生成历史、**自己的文件系统快照**、以及一个评测分 $s_v$（分数由固定协议给出，越大越好，根分 $s_r=0$）。
- **可行动作**：策略看到当前树 $\mathcal{T}$（初始只含根），可选的节点集是 $A(\mathcal{T})=\{r\}\cup\{\text{当前树的全部叶节点}\}$。设 $W\ge 1$ 个并行 worker（每个同时跑一个「生成–评估」请求）。策略的动作是一个**批次** $C\in A(\mathcal{T};W)=\{C\subseteq A(\mathcal{T}): |C|\le W\}$——**批次同时决定「在哪继续探索」和「并发多少」**。
- **在线与离线共用同一决策接口**，唯一区别是状态转移：一个**真执行**，一个**重放**。这是整套设计的关键：同一段策略代码，既能在真实世界跑，也能在历史树上跑。

### 3.2 在线 rollout

以 $\pi_1$ 与空历史 $\mathcal{H}_0=()$ 起步。第 $t$ 轮用固定策略 $\pi_t$ 驱动发现 agent 生成一次新的在线 rollout，并**以已完成的历史 $\mathcal{H}_{t-1}$ 作为上下文**（历史用于启发探索，但与正在构建的树分开存放）。允许最多 $K_1$ 轮。每轮结束后把新树并入 $\mathcal{H}_t$。

### 3.3 离线「做梦」：预算扫掠 + 回放目标

固定 $\mathcal{H}_t$ 后，构造并评估 $M\ge 1$ 个策略版本 $\pi_t^0,\dots,\pi_t^{M-1}$（$\pi_t^0=\pi_t$）。每个版本在**每一棵历史树** $\mathcal{T}_i\ (i=1,\dots,t)$ 上评估，并扫一组**预算偏好** $\rho\in\mathcal{R}:=\{0,0.25,0.5,0.75,1\}$（$\rho$ 控制策略的预算倾向）。回放从根开始，$\mathcal{T}_{i,\rho}^{m,k}\subseteq\mathcal{T}_i$ 是第 $k$ 轮后**已揭示的子树**；**记录树 $\mathcal{T}_i$ 本身永不变，只有被观测到的部分在增长**。

对每个 $(m,i,\rho)$ 记 $n_{i,\rho}^m$ 为该次回放代表的发现 agent 调用数，$s_{i,\rho}^m$ 为已揭示非根节点里的最好分数（无调用则取 0）。定义 $B_i:=|\mathcal{T}_i|-1$（总非根节点数）、$S_i:=\max_{v\ne r}s_v$（最好记录分），并把质量归一化 $a_{i,\rho}^m:=\operatorname{clip}(s_{i,\rho}^m/S_i,0,1)$。

预算扫掠给出质量–成本点集 $\{(n_{i,\rho}^m,a_{i,\rho}^m)\}$，取其中**非支配点**按调用数递增排列为 $(\bar n_{i,j}^m,\bar a_{i,j}^m)_{j=1}^{L_i^m}$。**回放分数**（式 1）为：

$$V_i^m=\underbrace{\frac{1}{B_i}\sum_{j=1}^{L_i^m}\bigl(\bar a_{i,j}^m-\bar a_{i,j-1}^m\bigr)\bigl(B_i-\bar n_{i,j}^m\bigr)}_{\text{归一化 hypervolume}}-\lambda\underbrace{\frac{1}{|\mathcal{R}|}\sum_{\substack{\rho\in\mathcal{R}\\ n_{i,\rho}^m>0}}\frac{k_{i,\rho}^{m,\star}}{n_{i,\rho}^m}}_{\text{并行度惩罚}}$$

- 第一项是**归一化 hypervolume**：质量–成本 Pareto 前沿所支配的面积，奖励「用更少的 agent 调用拿到更高的质量」。
- 第二项是**并行度惩罚**：预算扫掠上「每调用平均消耗的串行轮数」，惩罚把本可并行的调用串起来跑的保守策略（全串行时该项接近 1，满批并行时接近 $1/W$）。
- $\lambda$ 控制惩罚强度。

### 3.4 策略改进与选择：一个（有限的）单调性保证

策略版本 $\pi_t^m$ 的分数是其**在 $\mathcal{H}_t$ 上的平均回放分** $V^m=\frac{1}{t}\sum_{i=1}^t V_i^m$。离线阶段从 $\pi_t^0=\pi_t$ 起，对 $m=0,\dots,M-2$：一个**策略开发 agent** 检视 $\pi_t^m$ 的回放轨迹与分数、以及此前各次修订的反馈，识别「哪些决策成功、哪些失败反复出现」，然后把**可执行策略代码**改写成 $\pi_t^{m+1}$，在同一批 $t$ 棵回放世界上评估。**下一轮的在线策略取分数最高的候选**：$\pi_{t+1}=\pi_t^{m^\star}$，$m^\star\in\arg\max_m V^m$。

这里有一个值得注意的（弱）保证：**因为当前在线策略 $\pi_t=\pi_t^0$ 本身也在候选里，故 $V^{m^\star}\ge V^0$——$\pi_{t+1}$ 在「$\mathcal{H}_t$ 上的平均回放分」这个意义上永不比 $\pi_t$ 差。** 这个「永不更差」的措辞在形式上很像 Gödel Machine 的味道，但**保证的对象是回放模拟器分数，而不是真实在线性能**——这一点是本篇最需要盯住的地方（第 6 节）。

### 3.5 与 Dreamer / 世界模型的类比与关键差别

论文自己把类比摆在明面上（Section 2 引 Ha & Schmidhuber 2018、Hafner 系列）。但要如实说清差别：

| | Dreamer 式世界模型 | Dream-RSI 的 replay simulator |
| --- | --- | --- |
| 「世界」是什么 | 从经验**学出来的**紧凑动力学模型 | **已记录发现树本身**（不学、确定性重放） |
| 能评估什么 | 想象出的新轨迹（可含未见状态） | 只在**已实现**的搜索空间上重排路径 |
| 反馈性质 | 学得模型的预测（有模型误差） | 存储结果的直接读取（无预测误差，但**只覆盖看过的部分**） |
| 能否产生新分支 | 可以（在模型里生成） | **不可以**（无新执行就无新节点） |

所以 Dream-RSI 的「做梦」严格说是**在已探索空间上的离线重排（off-policy replay）**，不是生成式想象。它换来的是**零预测误差、零额外执行成本**，代价是**能力被锁死在历史覆盖的分支集合里**。作者对此的表述也相当克制，只主张"improves discovery efficiency in several settings"。

### 3.6 关键超参与规模

- 离线阶段每次评估**当前策略 + 3 个新生成版本**（$M=4$）。
- 在线轮数 $T$：Lasso 5；KernelBench 各任务 9；数学三题 10；harness 9。
- 并行 worker $W$：多数任务 10（Lasso-Flash 32，harness 4）。
- 每轮最大发现 agent 调用 $B$：多数任务 $110=10\times 11$（Lasso-Flash $640=32\times 20$，harness $16=4\times 4$）。$B$ 是**上界**，实际调用数由策略的分配与停止决策决定。
- 预算偏好扫掠 $|\mathcal{R}|=5$；并行度惩罚系数 $\lambda$ 具体取值原文未给出。
- 评测环境：Lasso/数学跑 KVM（AMD EPYC 7B12，8 vCPU，32 GB RAM，Debian）；kernel 跑 NVIDIA L40S；harness 跑 96 物理核 / 708 GiB RAM 的 CPU 服务器 + Docker 隔离。
- 模型：科学发现任务主要用 **Gemini-3.1-Pro**（Lasso 另跑 **Gemini-3.7-Flash**）；harness 优化用 **Claude Opus 4.8 + Claude Code**（同时充当发现 agent 与策略开发 agent，评测也用 Opus 4.8）。AI 使用声明里另用 Gemini 3.8 Flash 做写作/语法润色。

## 4. 实验：四个域、九个任务

对照的核心是 **Recursive Fixed Exploration**：与 Dream-RSI 用**完全相同的发现 agent、evaluator、初始化、每轮预算上限、以及同一份手写起始策略**，唯一区别是——从第二轮起它**保持策略固定**，而 Dream-RSI 通过回放做梦更新策略。这是一个干净的单变量对照。成本统一以**累计发现 agent 调用数**计。

### 4.1 内核工程（KernelBench）

四个任务：VGG16、LayerNorm、ConvDiv、ConvMax；候选按正确性检查 + 逆运行时间（$1/\mathrm{ms}$）打分。

- VGG16、LayerNorm：Dream-RSI 以 **$2.43\times$ / $1.79\times$ 更少的 generation** 达到相当性能。
- ConvDiv、ConvMax：在**相当预算**下取得 **$2.09\times$ / $1.44\times$ 更高性能**。
- 与 PACEvolve 对比：Dream-RSI 在 kernel 性能上超过 PACEvolve（后者给了 48 小时墙钟上界，见附录 C）。

附录 E.2 给出的 ConvDiv 内核挺有信息量：它不是孤立优化卷积，而是**围绕下游的 pooling 与 reduction 重构整条算子链**——相邻卷积输出立刻 max-pool，宽度方向 pooling 与后续 reduction 直接在寄存器内的值上做，避免物化卷积与池化特征图；线性操作（缩放、平均、偏置累加）推迟到一个轻量最终 reduction。这是「回放历史后学到的探索策略」最终把搜索导向的结构性收益。

### 4.2 数学优化

三题：Sum–Difference、Circle Packing、Autocorrelation。用 Gemini-3.1-Pro，10 轮。

- **Sum–Difference**：Dream-RSI $1.145427$，超过 SimpleTES（$1.143975$）与 Recursive Fixed Exploration（$1.144047$）。
- **Circle Packing**：$2.635983$，**追平**对比方法里的最强报告值（AlphaEvolveV2 / ShinkaEvolve / TTS / ThetaEvolve / SimpleTES 都报到 $2.63598$ 附近，这是一个饱和的题）。
- **Autocorrelation**（越低越好）：Dream-RSI $1.456375$，**未取胜**——AlphaEvolve $1.455700$、SimpleTES $1.453675$ 都更低；作者措辞是 "remaining competitive with existing discovery systems"。

结论要如实说：**三题里 Dream-RSI 在一题明确领先、一题饱和追平、一题落后于部分基线。** 论文自己的表述是 "matches or exceeds the best results among the compared baselines on two of three tasks"，与表格一致。

### 4.3 算法工程（Lasso 正则化路径）

任务：发现一个高效的 Lasso 完整正则化路径实现，同时保持数值正确性。用 SimpleTES 的 17 个合成实例做发现，另在**六个 held-out 下游数据集**（Gisette、RCV1 为生物外；DNA、Leukemia、Colon、Duke Breast 为生物）上测泛化。对照 sklearn、glmnet、SimpleTES。跑 5 轮。

主结果（平均运行时间，越低越好；compute = 累计发现 agent 调用）：

| 方法 | 模型 | Compute | 六数据集平均 (ms) |
| --- | --- | --- | --- |
| sklearn | – | – | 44180.3 |
| glmnet | – | – | 13767.5 |
| SimpleTES | gpt-oss-120b | 51200 | 3804.8 |
| SimpleTES†（本文复现） | gpt-oss-120b | 51200 | 8318.4 |
| Recursive Fixed Exploration | Gemini-3.1-Pro | 550 | 3587.1 |
| Dream-RSI | Gemini-3.1-Pro | **317** | **2931.0** |
| Recursive Fixed Exploration | Gemini-3.7-Flash | 3200 | 2516.7 |
| Dream-RSI | Gemini-3.7-Flash | **1879** | **2350.6** |

- 相对 SimpleTES 报告的 51,200 generation，Pro 与 Flash 分别用约 **$162\times$ / $27\times$ 更少**的调用，且下游平均运行时间更低——但作者明说**这些对比用了不同模型底座**（SimpleTES 是 gpt-oss-120b），所以「162×」是跨底座的方向性比较，不是同条件对照。
- **同条件**下（对 Recursive Fixed Exploration）：Pro 317 调用 vs 550、平均 2931.0 vs 3587.1；Flash 1879 vs 3200、平均 2350.6 vs 2516.7。两个底座都更省调用、平均更快。
- 发现出的求解器（附录 E.1）：与 SimpleTES「按维度在 LARS 与坐标下降间切换」不同，它把**主动集优化本身做成自适应**——强规则筛选配 Cauchy–Schwarz KKT 剪枝，只在必要时算精确梯度，剪枝失效时回落到全量刷新。

### 4.4 Harness 优化（Terminal-Bench 2.1）

目标：改进「围绕固定语言模型的那圈程序」（信息如何存储、检索、呈现）。沿用 Meta-Harness 的设置，以 **Terminus-Kira 为种子 harness**，每个候选 harness 在 **Terminal-Bench 2.1 全量 89 个任务上各跑 2 次**。

- 种子 $0.7247$ → 最终 **$0.8090$**（+8.4 个点）。
- 同评测条件下超过 Claude Code（$0.75$）与复现的 Meta-Harness（$0.79$）。
- 这一项**故意省掉了 Recursive Fixed Exploration 对照**，理由是成本太高——作者估计再做一次完整搜索要**超过 10 万美元**。因此 harness 这项只有端到端成绩，没有单变量归因。

## 5. 消融与进一步分析

- **回放世界累积的作用**（Table 2，ConvDiv）：用**全部历史**回放 → 性能 1.90、compute 786；只用**当前轮**回放 → 1.59、430。作者解释：累积多个 world 有助于学到更通用的探索策略、避免把策略过拟合到单一 world 而变得过度保守。
- **「回放历史」优于「把历史写成方向提示」**（Figure 6，ConvDiv）：一个自然替代是把历史抽象成高层方向洞察、直接塞进 prompt 当语义引导。把这种 prompt 级引导分别加到两种方法上，**两者的最终性能都下降了**。作者结论：显式方向引导可能**约束**探索；把历史当作可重放的模拟器（而非一段描述）更有效。这条挺重要——它说明 Dream-RSI 的收益不是来自「多给模型一点上下文」。
- **探索行为的演化**（Figure 7，ConvDiv）：轮次最好性能 $0.427\to0.625\to0.855\to1.403\to1.488\to1.499\to1.770\to1.880\to1.898$；每轮评估的尝试数 $110\to110\to87\to80\to50\to92\to80\to91\to86$。学到的策略呈现**自适应节律**：性能爬升期先**省算力**（110 降到 50），随后进度停滞时**重新加大探索**，并伴随进一步增益。这是「策略确实学到了东西」的一个定性证据，比单看最终分数更有说服力。

## 6. 局限与我在核对中注意到的几处

**作者自述的边界**（摘要、Section 3、Section 5）：

- 主张相当克制：多处只写 "achieves competitive discovery quality and **improves discovery-agent-call efficiency in several settings**"，而不是全面碾压。
- harness 优化缺单变量对照（成本原因），只有端到端数字。
- 模拟器只能重放已实现空间（这一点论文没有单独强调，但从「记录树不变、只揭示子树」的形式化可以推出）。

**我在核对中另外注意到的几处：**

1. **单调性保证的对象是「回放分数」，不是真实性能。** 式 3.4 的 $V^{m^\star}\ge V^0$ 只在 $\mathcal{H}_t$ 的平均回放分上成立。而回放世界正是**系统自己过去的 rollout 记录**——相当于「学生自己出卷、自己批卷、还只在出过的题上考」。这并不意味着它必然失效（任务 evaluator 是外部客观的，回放只是重排），但它意味着**「在回放分上单调不降」与「在真实在线发现上单调不降」之间没有形式化桥梁**。作者用一个干净的单变量对照（Recursive Fixed Exploration）来经验性地支撑后者，这是对的做法；但「回放分能否预测在线收益」这一条本身**没有单独的量化分析**（原文未给出回放分与在线性能的相关性）。

2. **「162×」是跨模型底座的比较。** SimpleTES 用 gpt-oss-120b、51,200 generation；Dream-RSI 用 Gemini-3.1-Pro、317 调用。作者在正文里如实标注了 "these comparisons use different model backbones"，但摘要/引言里「up to $162\times$ fewer agent calls」这个数字容易被读者当成同条件结果。同条件（对 Fixed Exploration）的省调用幅度是约 $1.7\times$。

3. **Lasso 在 Pro 上的平均改善由单一数据集驱动。** 正文自己承认："For 3.1 Pro, the average improvement over fixed exploration is driven by **RCV1**, despite slower runtimes on the **other five datasets**." 对照表可验证：Pro 配置下 Dream-RSI 在 Gisette、DNA、Leukemia、Colon、Duke Breast 五列上都比 Fixed 慢（如 Gisette 2841.0 vs 1861.8、DNA 49.9 vs 41.5），只因 RCV1 的绝对量级大（14616 vs 19550）把「算术平均」拉了过来。Flash 配置则是实打实 5/6 数据集改善。**所以「平均更快」这个结论对底座敏感，且被大尺度数据集的算术平均放大了。**

4. **数学题三选一落后。** Autocorrelation 上 Dream-RSI 未达最佳（AlphaEvolve、SimpleTES 更低）。论文措辞准确，但读者容易把「competitive」读成「领先」。

5. **规模偏小、轮数偏少。** $T$ 只有 5–10 轮，$M=4$ 个候选策略，单轮预算上限 110 次调用。RSI 循环只转了 5–10 圈，离「开放式长程自改进」还有距离；「递归」在此是**有界递归**。

6. **可复现性待补齐。** 仓库 README 的 release plan 显示 codebase / reproduction scripts 仍在准备中，discovered programs 也在准备中。论文附录给了完整 prompt（D.1 探索提示、D.2 回放改进提示）与全部任务定义，透明度不错，但端到端复现暂时还做不了。

7. **$\lambda$ 与「非支配点」的计算细节未完全给出。** 回放目标是本文的核心机制，但并行度惩罚系数 $\lambda$ 的取值、以及预算扫掠在离散树上的具体展开方式，正文/附录未给出可完全复算的细节（此处存在信息缺口）。

## 7. 对「递归自进化 / 验证信号可信度」这条线的意义

把 Dream-RSI 放回本目录的时间线坐标：

**轴一：递归在哪一层。** 本目录此前把「递归」的落点归到**元改进层（改「怎么改」）**——MetaSkill-Evolve 的 meta-skill 慢循环、HSI 的 meta-evolver、STOP 的 improver-improving-itself。Dream-RSI 是这一层的**又一个、且更纯粹的新样本**：它改的不是 task skill、不是 harness、不是权重，而是**「如何分配探索算力」这段控制器代码**。任务解、harness、模型全部不动，只把「怎么探索」递归地改好。就「改什么」这根轴而言，它填的是**探索/编排（orchestration）**这一格。

**轴二：验证信号来源——这是它最值得讨论的地方。** 按本目录的分类，Dream-RSI 的**任务侧**验证是「外部客观 verifier」（正确性 + 运行时间 + 题目目标函数），这是最可信的工程路线；但它的**meta 侧**验证是「自造回放模拟器」，而模拟器又由系统**自己过去的 rollout** 构成。这正好落在本目录反复出现的风险区：**当系统同时掌握「被优化对象」和「验证信号」时，自评分会漂走。** Dream-RSI 的缓解是：任务 evaluator 外部冻结、回放只做重排不做生成、并用单变量对照经验性地证明在线也变好了。它**没有**落入「self-judge 自欺」的陷阱（因为它不去评「答案好不好」，而是评「探索路径在已知结果上的效率」），但它**确实**把「世界模型」建在了自己的历史之上——这是一个更温和、也更值得研究的自指形式。本目录里与它最近的是 RQGM（把 evaluator 纳入演化）和 SEAL（外源密封审计）；Dream-RSI 走的是第三条路：**用历史回放把 meta 评估做便宜，用外部任务 evaluator 兜底正确性。**

**轴三：单血统 vs 种群。** Dream-RSI 是**单条策略血统 + 每轮 4 个候选**的局部搜索，不是 DarwinX/MGM 那种种群档案。它靠「回放廉价」而不是「种群多样」来降方差。

**轴四：它与「世界模型 / Dreamer」这条古典线的接续。** 这是本目录其他论文都没有的角度：Dream-RSI 把 model-based RL 的「在想象里改进策略」搬到了 LLM agent 的发现循环里，只是把「学出来的模型」换成了「记录下来的树」。**这个替换很聪明，也很诚实**——它放弃了世界模型的泛化能力，换来了零模型误差与零额外成本，并明确把收益限定在「已有分支上的算力重排」。

**它给这条线补上的独特东西**：一个**「探索/编排」层的 RSI 闭环**，以及一个把**长程发现历史当作可复用 meta 反馈**的具体机制。此前本目录讨论的 meta 层改进（MetaSkill-Evolve、HSI）多是改「改进流程」本身；Dream-RSI 改的是「改进流程里的资源分配」，并且给出了一个可复用的 trick：**当 meta 反馈太贵时，把它退化成对历史的离线重放。**

## 8. 可复用的工程要点

1. **把「探索策略」从任务代码里剥出来，做成可编程的独立对象。** Dream-RSI 的轻量编排层只控制「分支 / 并行 / 停止」，底座 agent 一行不改。工程上这意味着：探索控制器应该是**一段可单独替换、可单独评估、可单独回滚的代码**（本文里就是 `OptimalPolicy.solve(question, budget)`），而不是散落在 prompt 和 workflow 里的隐式约定。

2. **让「历史」变成可回放的数据结构，而不只是上下文。** 关键是把每次尝试记录成**带父指针 + 工作区快照 + 观测 + 分数的树**。这样一段历史就能同时服务三件事：给 agent 当上下文、给策略当回放世界、给人类当审计记录。把历史只当 prompt 文本，就浪费了它作为「模拟器」的价值。

3. **在线/离线共用同一决策接口，只切换「真执行 vs 重放」。** 这是让回放有意义的前提——策略代码在两边行为一致，回放分才可能预测在线表现。做自进化 agent 时，把「动作接口」和「状态转移」分开抽象，是一笔很值的基础设施投入。

4. **给 meta 目标同时编码「质量」与「成本」，并显式惩罚串行。** 式 1 的 hypervolume + 并行度惩罚是个可直接借用的模板：只优化质量会让策略无脑堆算力，只优化成本会退化成不探索。用 Pareto 前沿的归一化面积做标量，比「质量 ÷ 成本」这类粗糙比值稳健得多。

5. **候选集里永远保留当前版本，让「不改进」成为默认安全解。** $V^{m^\star}\ge V^0$ 的保证虽然只作用于回放分，但工程价值是实的：**每一轮更新都不可能让回放分变差**，因此不会出现「越改越坏还要靠回滚兜底」。这是低成本获得「只升不降」性质的一个通用手法。

6. **用「把历史写成提示」当消融，别当方案。** Figure 6 的结论很反直觉但很实用：把历史抽象成方向提示塞进 prompt，会让两种方法的最终性能**都下降**。如果你正打算「给 agent 一段经验总结来提升探索」，先做个对照——很可能不如让它直接读原始记录。

7. **把「每轮花多少算力」本身做成可学的自适应行为。** Figure 7 展示的节律（爬升期省、停滞期加）是可以主动设计的目标：在 meta 目标里显式奖励「按进度调节算力」，比固定每轮预算更贴近真实发现过程。

8. **诚实标注跨底座的比较。** 「162×」这种数字很有传播力但条件不同。工程复现时，**同条件对照（本文的 Recursive Fixed Exploration）才是唯一能支撑因果结论的基线**；跨底座数字只当方向性参考。
