# DIVE：冻结模型下的多样性驱动 skill 演化

> 参数不动，只演化自然语言 skill：多种群并行演化 + 互补 skill 联合选择。

## 速览

- **arXiv / 日期 / 作者**：arXiv:2608.12486v1 [cs.CL]，2026 年 8 月 12 日。作者 Siheng Xiong、Oguzhan Gungordu、Faramarz Fekri（Georgia Institute of Technology）与 Ali Payani（Cisco Research）。致谢中提到 DARPA SciFy 项目（Award No. HR001125C0302）与 Cisco Systems 资助。
- **是否冻结参数**：明确冻结。原文 Methodology 前的问题定义中写道「Our goal is to improve task performance while keeping the model parameters $\theta$ fixed.」；Introduction 也写「The same LLM both executes and revises these skills using task experience and verifier feedback, while its parameters remain fixed throughout optimization.」摘要进一步强调 skills「are both executed and revised by the same underlying model without access to a teacher model」——既不更新权重，也不借用更强的教师模型。
- **演化对象**：一段自然语言 skill 文本（原文定义为「a compact textual artifact that guides subsequent inference by encoding reusable reasoning procedures, verification strategies, common failure modes, and output constraints」）。粒度是**任务级**（task-level），而非按题目、按技能点切分；存储格式是 markdown 结构化文档，附录里给出的 GPT-5-nano 学到的 skill 形如 `# Solve Sudoku` / `## Output contract` / `## Solve` / `## Verify before answering`，即「输出契约 + 求解流程 + 校验清单」三段式（附录 Line 3987 起、Line 3100 起）。推理时该文本直接前置进 context。
- **验证信号来源**：外部任务专用 verifier，返回二值正确性 $r \in \{0,1\}$，可附带结构化诊断（格式违规、执行失败、超时）。原文特意声明：「Importantly, the verifier does NOT provide natural-language critiques.」自然语言的诊断与反思全部由被冻结的同一个模型自己产生。
- **一句话贡献**：把冻结 LLM 的自我改进形式化为自然语言 skill 的演化搜索，并用「多独立种群 + 异质算子 UCB 分配 + 算子自生成 + 互补 skill 集合联合选择」把单轨迹文本优化的高方差问题压下去。

## 1. 问题：它在补什么洞

作者的出发点是部署后的经验无处沉淀：模型反复遇到同类题、拿到反馈、甚至发现了好策略，这些都不会改参数、也不会自动跨 query 保留。微调能内化经验，但需要权重访问、算力和训练流水线，而「many capable language models are accessible only through APIs」。于是问题被换成：冻结模型能否通过把经验转成持久的自然语言 skill 来自我改进。

对既有工作的批评集中在三条，构成 Introduction 里点明的三个挑战：

1. **自生成修改本身是噪声源**。作者写道「a locally beneficial edit may remove useful guidance, overfit to a small set of failures, or amplify an incorrect reflection, making greedy single-candidate refinement brittle」。这直接指向 Reflexion / Self-Refine / SkillOpt 这类**贪心单候选**改写：每步只维护一个 incumbent，一次坏 reflection 就把有用指导删掉了。
2. **经验会撑爆 context**。轨迹、反馈、demonstration 不能无限追加，必须蒸馏成紧凑抽象。这是对 Experience RAG / 记忆类方法（存了检索）的批评：它们研究「怎么存、怎么取」，而不是「怎么把知识压成可复用抽象」。
3. **skill 演化是路径依赖的**。「different initial skills, sampled experiences, and revision trajectories can lead to substantially different solutions」，只维护一条演化轨迹会提前丢掉有前景的替代方案，或者收敛到次优。

对 prompt 优化一族（MIPROv2、GEPA、EvoPrompt），Related Work 的批评更细：这些方法「primarily searches for a single improved prompt」，即使用了种群，多样性也只是**搜索强个体的手段**（means to find one strong artifact）；DIVE 则把多样性当成**端到端的设计原则**——从独立 bootstrap 的演化轨迹、异质变换算子，一路保留到推理时使用的互补 skill 集合。对记忆/skill 类方法（Agent Workflow Memory、programmatic skills、AutoSkill）的批评是：它们把 skill 获取当作记忆构建与检索，DIVE 把它当作**在竞争性知识假设上的优化问题**。

值得注意的是作者刻意设定的难度：执行、解读 verifier 反馈、修改自身知识**都由同一个冻结模型完成**，没有更强的教师。这排除了「大模型蒸馏成小模型 prompt」这条捷径。

## 2. 方法详解

### 2.1 形式化

给定问题 $x$，模型产生 $f_\theta(x)$，verifier 给二值分：

$$r(x, y, f_\theta(x)) \in \{0, 1\}$$

任务分布 $\mathcal{T}$ 上的性能 $V_{\mathcal{T}}(f_\theta) = \mathbb{E}_{(x,y)\sim \mathcal{T}}[r(x,y,f_\theta(x))]$。引入 skill $s$ 后：

$$V_{\mathcal{T}}(s) = \mathbb{E}_{(x,y)\sim\mathcal{T}}[r(x, y, f_\theta(x; s))]$$

其中 $f_\theta(x;s)$ 表示以 skill $s$ 为条件生成。经验集合定义为 verifier 标注的轨迹：

$$E(D; s) = \{(x, f_\theta(x;s), r(x,y,f_\theta(x;s)))\}_{(x,y)\in D}$$

更新算子就是同一个模型自己写：$s' = \text{UpdateSkill}_{f_\theta}(s, E(D; s))$（式 5）。作者强调这种 skill「human-readable, editable, reversible, and transferable across models」——可读、可编辑、可回滚、可跨模型迁移，这是 weight-space 自改进拿不到的性质。

### 2.2 数据切分与种群构造

开发数据切成演化集 $D_{evo}$ 与验证集 $D_{val}$，$D_{test}$ 严格留作最终评测。关键设计：**$D_{val}$ 的实例绝不进入 skill 生成或修改的 prompt**，只用于候选 skill 打分与最终集合构造，不诱导种群内部的再修改（原文 Final Skill Set Construction 一节明确「used only for final skill set construction and does not induce further within-population revisions」）。

对每个种群 $k \in [K]$，从 $D_{evo}$ 独立有放回 bootstrap 出两个子集，角色不同：

- $D^{(k)}_{exp}$（experience subset）：提取可复用知识的来源，占 $|D_{evo}|$ 的 5%；
- $D^{(k)}_{ref}$（reflection subset）：评估候选 skill、诊断失败、指导后续修改，占 10%。

$$S^{(k)}_B = \text{DevelopSkill}_{f_\theta}\left(D^{(k)}_{exp}, D^{(k)}_{ref}\right)$$

### 2.3 种子 skill 初始化：三个互补偏置

每个种群初始 $|S^{(k)}_0| = 3$，具体为 $S_0 = \{s_{minimal}, s_{const}, s_{veri}\}$（附录 Seed Skill Initialization）：

- $s_{minimal}$：只含任务描述与强制输出约束（最小假设，防止一开始就被经验带偏）；
- $s_{const}$（solution-construction seed）：强调成功的推理流程、分解方式、表示与决策规则；
- $s_{veri}$（diagnosis-and-verification seed）：强调常见失败模式、中间正确性检查、最终答案校验。

后两个由 $D_{exp}$ 上 verifier 标注轨迹蒸馏而来。蒸馏是两阶段：先用 Summarization 模板把轨迹压成四段结构（`## Successful Patterns` / `## Failure Patterns` / `## Verification and Constraint Checks` / `## Unresolved Issues`），再用初始化模板写成 skill。摘要模板里有几条很实用的约束：「Aggregate recurring patterns across instances rather than reproducing instance-specific solutions」、「omit unnecessary problem details, lengthy derivations, and complete answers」、「Do not propose a revised skill or solve the task」。轨迹超 context 时分块摘要再合并。

### 2.4 演化算子组合

初始算子池（式 19）：

$$\mathcal{A}_0 = \{\texttt{Reflective Repair}, \texttt{Exploratory Revision}, \texttt{Compression}, \texttt{Recombination}\}$$

- **Reflective Repair**（1 parent）：针对 verifier 暴露的系统性失败做局部修改，保留已有有用指导。
- **Exploratory Revision**（1 parent）：鼓励换一套完全不同的策略/分解/推理路径，而不是增量改。prompt 里写明「avoid merely making local edits to the parent skill」。
- **Compression**（1 parent）：删冗余、过度具体、互相冲突的指导，合并为更简洁可复用的 skill。
- **Recombination**（2 parents）：合成两个父 skill 的互补优势，且必须**消解冲突而非拼接**（「Resolve redundant, inconsistent, or conflicting guidance rather than simply concatenating」）。

每步选定算子 $a_t$ 后取父集合 $P_t = \text{SelectParents}(S_t, a_t)$，提议新 skill：

$$s'_t \sim p_{f_\theta}\left(\cdot \mid P_t, E(D_{ref}; P_t), a_t\right), \quad E(D_{ref}; P_t) = \bigcup_{s \in P_t} E(D_{ref}; s)$$

### 2.5 算子专属父选择

先在 reflection 集上算每个 skill 的效用：

$$U(s) = \frac{1}{|D_{ref}|}\sum_{(x,y)\in D_{ref}} r(x, y, f_\theta(x;s))$$

单父算子按 softmax 采样，温度 $\tau_p$：

$$p_{single}(s \mid a_t) = \frac{\mathbb{I}[s \in \mathcal{G}_{a_t}]\exp(G_{a_t}(s)/\tau_p)}{\sum_{\tilde{s}\in\mathcal{G}_{a_t}}\exp(G_{a_t}(\tilde{s})/\tau_p)}$$

打分函数按算子意图**反向设计**，这是设计上很关键的一点：

- Repair：$\mathcal{G} = S_t$，$G(s) = U(s)$ —— 修强的（强但不完美的最值得修）；
- Explore：$\mathcal{G} = S_t$，$G(s) = 1 - U(s)$ —— 探弱的（增量修复对弱 skill 没用）；
- Compress：$\mathcal{G} = \{s : \ell(s) > \ell_{comp}\}$，$G(s) = U(s)$ —— 压「又长又好」的；若无 skill 超长，该算子当步不可用；
- Recombination：先按 $U(s)$ 采一个强父 $s_1$，第二父要求**互补**。定义边际覆盖

$$\Delta(s \mid s_1) = \frac{1}{|D_{ref}|}\sum_{(x,y)\in D_{ref}} (1 - c(s_1; x,y))\, c(s; x,y)$$

即 $s$ 解出但 $s_1$ 没解出的实例比例，再按 $Q(s\mid s_1) = \lambda U(s) + (1-\lambda)\Delta(s \mid s_1)$ 采样第二父。

### 2.6 UCB 分配演化预算

奖励是**父相对**（parent-relative）的：

$$R_\tau = U(s'_\tau) - \max_{s \in P_\tau} U(s)$$

用「最强父」而非平均父，作者的理由是防止多父算子仅因超过弱父就白拿正奖励。算子选择：

$$\text{UCB}_a(t) = \hat{\mu}_a(t) + \beta\sqrt{\frac{\log t}{N_a(t)}}, \qquad \hat{\mu}_a(t) = \frac{1}{N_a(t)}\sum_{\tau < t: a_\tau = a} R_\tau$$

每个算子至少试一次，之后 $a_t = \arg\max_a \text{UCB}_a(t)$。理论分析一节承认奖励分布随种群演化而变化，因此**不套用平稳 bandit 的 regret 保证**，UCB 只当作有限预算下的实用分配规则（原文：「we do not invoke the standard regret guarantees for stationary stochastic bandits」）。

理论动机部分给了一个更清晰的框架：定义 $\epsilon$-改进集合 $I_\epsilon(P) = \{s' : U(s') - \max_{s\in P}U(s) \ge \epsilon\}$ 和算子的「有用提议质量」$p_{a,t}(\epsilon) = \Pr(s'_t \in I_\epsilon(P_t) \mid a_t = a, H_{t-1})$，则 $T$ 步内至少一次改进的概率为

$$\Pr\left(\max_{1\le t\le T} R_t \ge \epsilon\right) = 1 - \prod_{t=1}^{T}(1 - p_t(\epsilon))$$

作者据此论证：一个算子即使平均产出不是最高，只要它在别的算子难以到达的变换上放了可观概率质量，就是有价值的。而最优算子会随搜索状态漂移——Repair 在已有强而不完美 skill 时好用，Explore 在所有当前策略共享同一失败模式时好用，Recombination 只有在互补 skill 已经出现后才有用。

### 2.7 算子自生成

在预设步 $t_{new}$，用累积演化历史 $H_t = \{(a_\tau, P_\tau, s'_\tau, R_\tau)\}_{\tau=1}^{t}$ 生成 $N_{new}$ 个新算子：

$$\mathcal{A}_{new} = \text{GenerateOperator}_{f_\theta}(H_{t_{new}}, N_{new}), \quad \mathcal{A} \leftarrow \mathcal{A}\cup\mathcal{A}_{new}$$

历史同样要压缩成结构化摘要（因为可能超 context），每个算子记录应用次数 $N_a(t)$、平均奖励 $\hat{\mu}_a(t)$、正改进率 $q^+_a(t) = \frac{1}{N_a(t)}\sum_{\tau \le t: a_\tau = a}\mathbb{I}[R_\tau > 0]$，加上代表性成功/失败修改、种群内仍未解决的失败模式、历史中出现但现有算子未显式表达的有效变换。

生成的算子是一个六元组 $\tilde{a} = (g_a, e_a, d_a, n_a, h_a, \pi_a)$：目标空缺、支持证据、与最相近现有算子的区别、名称、父数量（限 1 或 2）、变换指令。**诊断字段 $(g_a, e_a, d_a)$ 只用于逼迫生成有依据、非冗余的算子，最终只保留可执行规格 $(n_a, h_a, \pi_a)$**。输出强制 JSON list schema。新算子作为 untried 加入池，之后走同一套 UCB。

### 2.8 联合 skill 集合选择

演化完 $K$ 个种群后，在 $D_{val}$ 上评所有候选。单个 skill 的验证效用按**完整推理管线**度量（不是裸准确率）：

$$\hat{V}_{D_{val}}(S) = \frac{1}{|D_{val}|}\sum_{(x,y)\in D_{val}} r(x, y, \hat{o}_S(x)), \qquad \hat{o}_S(x) = \text{SelectTop}_{f_\theta}(x, O_S(x))$$

优化目标（式 17）：

$$\max_S \hat{V}_{D_{val}}(S) \quad \text{s.t.}\quad S \subseteq \bigcup_{k=1}^{K} S^{(k)}_B,\ 1 \le |S| \le M,\ \left|S \cap S^{(k)}_B\right| \le 1\ \forall k$$

最后一条约束是硬性的**每种群最多选一个 skill**，强制跨种群多样性。实现是两级近似：先每种群按个体验证性能留 top $L$ 形成候选池 $C$，再贪心。第一个选 $s^*_1 = \arg\max_{s\in C}\hat{V}_{D_{val}}(\{s\})$，第 $j$ 步的合法集合排除已被选中种群：

$$C_j = \{s \in C \setminus S_{j-1} : \kappa(s) \notin \{\kappa(\tilde{s}) : \tilde{s}\in S_{j-1}\}\}$$

按边际贡献 $\Delta(s \mid S_{j-1}) = \hat{V}_{D_{val}}(S_{j-1}\cup\{s\}) - \hat{V}_{D_{val}}(S_{j-1})$ 取 argmax。**终止条件**：达到 $M$，或剩余候选的最大边际改进为非正。每个 skill 对每个验证实例的回答生成一次并缓存，降低评估方差和开销。

### 2.9 推理时聚合

每个入选 skill 独立生成一个候选答案。聚合方式**分任务不同**（这一点主文没说清，附录 Inference-Time Candidate Ranking 才交代）：HMMT 抽取最终答案后**多数投票**；其余五个数据集把所有候选（不含冗长思维链）放进一次 listwise ranking call，由同一个冻结模型按推理有效性/完整性、推理与答案一致性、任务约束遵守度选一个。$D_{val}$ 上 verifier 只在 ranking 之后评被选中的那个候选。

理论分析给了聚合的分解，这段是全文最有解释力的部分。定义 oracle 覆盖 $A_{oracle}(S) = \Pr(C_S(x,y)\ne\emptyset)$ 与选择遗憾 $L_{sel}(S) = \Pr(C_S(x,y)\ne\emptyset,\ r(x,y,\hat{o}_S(x))=0)$，则

$$A_{agg}(S) = A_{oracle}(S) - L_{sel}(S)$$

加入一个 skill 的实际边际收益：

$$A_{agg}(S\cup\{s\}) - A_{agg}(S) = \Delta_{cov}(s\mid S) - \Delta_{sel}(s \mid S)$$

于是「测试准确率不必随 skill 集合变大而单调上升」——新 skill 可能带来覆盖，但同时让 ranking 更难。DIVE 的验证目标恰好直接估计 $A_{agg}$，贪心边际准则估计的就是式 64，非正即停正是为了避免加入「覆盖增益抵不过选择遗憾」的 skill。

另外，多种群的动机也被形式化：设 $G_k(\epsilon)$ 为种群 $k$ 至少含一个风险 $\le\epsilon$ 的 skill 的事件，在独立同概率 $q_\epsilon$ 的理想假设下 $\Pr(\cup_k G_k(\epsilon)) = 1 - (1-q_\epsilon)^K$。作者自己承认「The populations are not perfectly independent in practice」。

### 2.10 算法与超参数

```
Algorithm 1 (DIVE)
输入: 冻结模型 f_theta, D_evo, D_val, verifier r, 预算 B, 种群数 K,
      初始算子 A_0, UCB 系数 beta, 算子生成步 t_new, 新算子数 N_new, 最大集合 M
C <- 空
for k = 1..K 并行:
    bootstrap D_exp^k, D_ref^k <- D_evo
    S_0^k <- InitializeSkill(E(D_exp^k))          # 3 个种子
    A^k <- A_0 ; 初始化 {N_a, mu_a} ; H^k <- 空
    for t = 1..B:
        if 存在未试算子: a_t <- 该未试算子
        else: a_t <- argmax_a [ mu_a + beta*sqrt(log t / N_a) ]
        P_t <- SelectParents(S_{t-1}^k, a_t)      # 算子专属打分 + 温度采样
        s'_t ~ p_f(. | P_t, E(D_ref^k; P_t), a_t)
        在 D_ref^k 上评估 s'_t
        R_t <- U(s'_t) - max_{s in P_t} U(s)      # 父相对奖励
        更新 N_{a_t}, mu_{a_t}, H^k
        S_t^k <- UpdatePopulation(S_{t-1}^k, s'_t) # 只加不删, 父 skill 保留
        if t == t_new:
            A^k <- A^k ∪ GenerateOperator(H^k, N_new)   # 新算子标记 untried
    C <- C ∪ S_B^k
在 D_val 上评估所有 s in C
S_final <- JointSelect({S_B^k}, D_val, M)         # 每种群 ≤1, 贪心边际增益
return S_final
```

主实验超参数（附录 Implementation Details）：

| 超参数 | 取值 |
| --- | --- |
| $D_{evo}$ 规模 | 每数据集 1,000 训练样本，其余作 $D_{val}$ |
| 种群数 $K$ | 10 |
| $\|D^{(k)}_{exp}\|/\|D_{evo}\|$ | 0.05 |
| $\|D^{(k)}_{ref}\|/\|D_{evo}\|$ | 0.10 |
| 种子数 $\|S^{(k)}_0\|$ | 3 |
| 每种群演化预算 $B$ | 10 步 |
| UCB 系数 $\beta$ | 0.3 |
| 父采样温度 $\tau_p$ | 0.6 |
| 算子生成步 $t_{new}$ / 数量 $N_{new}$ | 8 / 1 |
| Compression 阈值 $\ell_{comp}$ | 4,096 tokens |
| Recombination 权衡 $\lambda$ | 0.5 |
| 每 skill-实例 rollout 数 | 1 |
| 每种群保留 top $L$ | 3 |
| 最终集合上限 $M$ | 10 |
| 解码（无原生 thinking 模式时） | temperature 0.6, top_p 0.95, max 32,768 tokens |

注意几个「便宜」的设计：$B=10$ 步、每 skill-实例只 1 次 rollout、reflection 集只有 100 个实例、新算子只生成 1 个。整套演化的模型调用量比想象中小得多，代价转移到了推理时（$M=10$ 意味着每题 10 次生成 + 1 次 ranking）。

## 3. 实验设置

- **数据集（6 个）**：HMMT（MathArena Feb 2025 + Nov 2025 组合作为评测；训练集自建，从 NuminaMath-1.5 的 olympiads/amc_aime 中筛短答案竞赛题、去畸形去重、去与 HMMT 评测集归一化重叠，得 1,200 题）、Equational Theories（判断一条 magma 恒等式是否蕴含另一条；训练 1,400 题来自 SAIR 的 selected-problems 并剔除评测重叠，评测 400 题 = 200 normal + 200 hard）、以及来自 SynLogic 的 Sudoku、Cryptarithm、Calcudoku、Futoshiki（每任务每难度 1,200 训练 / 200 测试）。
- **难度设置**：normal 与 hard 用生成参数区分，例如 Sudoku difficulty level 3 vs 4；Cryptarithm 4 字母/2 算子/level 2 vs 6 字母/3 算子/level 3；Calcudoku 5×5 vs 6×6；Futoshiki 5×5/10 不等号/5 预填 vs 6×6/14 不等号/7 预填。**Qwen3-8B 在 normal 子集上评，其余模型全部在 hard 子集上评**——跨表对比数字时必须注意这一点。
- **底座模型**：GPT-5-nano、DeepSeek-v4-flash、Qwen3.5-27B、Qwen3.5-9B（迁移实验）、Qwen3-8B（消融与优化效率实验）、GPT-5（仅作为大模型 prompting 对照）。
- **Verifier**：任务专用。HMMT 抽取归一化答案后做符号等价判断；Equational Theories 解析 verdict/reasoning/proof/counterexample 字段并比对归一化 verdict；SynLogic 四任务用专用 parser + 约束检查（格式合法性 + 是否满足底层约束）。
- **Baseline**：Zero-shot、Few-shot ICL（8 个固定 demo）、Self-Consistency（$M=10$ 次零样本 rollout 多数投票）、ToT（BFS，深度 $D=3$、分支 $b=3$、beam $w=2$，且**模型调用数对齐 DIVE 的 $M=10$ 配置**）、Experience RAG（检索 top-5 相似训练实例的轨迹摘要；HMMT 用 text-embedding-3-small，其余用任务符号相似度）、ExpeL（失败后自反思最多 3 次修正，保留全部失败轨迹与第一条成功轨迹，抽 task-level 规则 + 检索 5 条成功轨迹）、Direct Skill Generation、SkillOpt（把 skill 文档当可训练状态，做 add/delete/replace 结构化编辑，按 textual learning rate 应用，仅当验证集严格提升才接受）、MIPROv2（指令 + demo 贝叶斯联合优化）、GEPA（反思式 prompt 演化）。所有 baseline 用同一解码配置，rollout 预算与 DIVE 对齐（原文对 MIPROv2/GEPA/SkillOpt 均写 "comparable" budget）。
- **参数化对照**：Qwen3-8B 上的 SFT（拒绝采样 + LoRA，$r=16$、$\alpha=32$、作用于 q/k/v/o_proj、dropout 0.05、AdamW peak lr `$2`\times10^{-4}$；作者说 LoRA 在其验证集上优于全参微调）与 GRPO（全参，Verl + vLLM，组大小 $N=8$，temperature 0.7 / top_p 0.9，规则式 outcome reward，AdamW lr `$1`\times10^{-6}$、weight decay 0.1、KL 系数 $\lambda_{KL}=0.04$，bf16 + gradient checkpointing + FlashAttention2，训练 3 遍，每 10 步在验证集选最高 Pass@1 的 checkpoint）。
- **算力/成本预算**：以 rollout 数为横轴对比（Figure 1，0–25K rollouts）。推理成本以每样例计（Table 2）：GPT-5-nano zero-shot 1.0 次调用 / 170.1 输入 token / 19,609.3 输出 token / \`$0.008`；GPT-5-nano + DIVE 10.9 次调用 / 33,811.2 输入 token / 216,834.2 输出 token / \`$0.088`；GPT-5 zero-shot \`$0.154`，few-shot \`$0.153`。演化阶段的总成本原文未给出。

## 4. 结果与消融

### 4.1 主结果（Table 1）

平均分（6 任务，逻辑任务均为 hard 子集）：

| 模型 | Zero-shot | SC | ToT | ExpeL | SkillOpt | GEPA | DIVE ($M{=}1$) | DIVE ($M{=}10$) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GPT-5-nano | 52.3 | 67.7 | 74.3 | 56.3 | 59.7 | 55.1 | 60.7 | **81.5** |
| DeepSeek-v4-flash | 73.9 | 86.8 | 85.4 | 78.5 | 81.2 | 77.6 | 81.9 | **96.4** |
| Qwen3.5-27B | 59.6 | 69.0 | 79.4 | 64.9 | 69.4 | 65.7 | 71.7 | **86.1** |

几个值得盯的点：

- **单 skill 的 DIVE 并不碾压**。GPT-5-nano 上 DIVE($M{=}1$) 平均 60.7，低于 SC 的 67.7 和 ToT 的 74.3；DeepSeek 上 DIVE($M{=}1$) 81.9 也低于 SC 86.8。真正的跃升来自 $M{=}10$ 的互补集合 + ranking。也就是说这套方法的收益里**测试时聚合占了很大一块**，而 ToT 虽被对齐了调用数，仍显著落后（GPT-5-nano 74.3 vs 81.5，DeepSeek 85.4 vs 96.4）。
- **单任务上的幅度极大**。GPT-5-nano Cryptarithm 从 zero-shot 20.1 到 61.5；Calcudoku 从 30.4 到 84.8；Futoshiki 到 99.2。DeepSeek Equational Theories 从 43.7 到 91.5。
- **prompt 优化基线普遍弱于 skill 类**。GEPA 在三个模型上平均 55.1 / 77.6 / 65.7，都低于 SkillOpt 的 59.7 / 81.2 / 69.4，也低于 DIVE($M{=}1$)。这支持作者「迭代 skill 演化 > 单轨迹 prompt 优化」的说法，但注意 GEPA 只优化 prompt，比较的是不同粒度的对象。
- **反例存在**：Qwen3.5-27B 的 HMMT 上 SkillOpt 93.1 高于 DIVE($M{=}1$) 89.0（DIVE $M{=}10$ 为 95.2）；Equational Theories 上 SkillOpt 84.2 亦高于 DIVE($M{=}1$) 86.1 之外的多数基线，差距不大。

### 4.2 小模型 + skill vs 大模型 prompting（Table 2）

GPT-5-nano + DIVE 平均 81.5，高于 GPT-5 zero-shot 76.5 与 GPT-5 few-shot 79.8，同时每样例成本 \`$0.088` vs \`$0.154`，**推理成本降低 42.5%**（原文正文给出该数字）。代价是调用数 1.0 → 10.9、输出 token 约 11 倍。

### 4.3 优化效率（Figure 1）

Qwen3-8B 上以 rollout 数为横轴：DIVE 随经验快速上升，SFT 与 GEPA 在明显更低的水平上 plateau，GRPO 提升更缓慢且需要多得多的 rollout。图中 HMMT 纵轴范围 0.42–0.58，Sudoku 0.55–0.87，横轴到 25K rollouts。（Figure 1 的具体端点数值在纯文本中不可读，此处只能给趋势。）

### 4.4 跨模型迁移（Table 3）

| 设置 | Avg. |
| --- | --- |
| Qwen3.5-9B zero-shot | 27.2 |
| Qwen3.5-9B + 自产 skill | 56.6 |
| Qwen3.5-27B zero-shot | 59.6 |
| Qwen3.5-27B + **9B 产的** skill | 81.2 |
| Qwen3.5-27B + 自产 skill | 86.1 |
| DeepSeek-v4-flash zero-shot | 73.9 |
| DeepSeek-v4-flash + **9B 产的** skill | 90.5 |
| DeepSeek-v4-flash + 自产 skill | 96.4 |

结论清楚：9B 演化出的 skill 直接搬到同族更大模型（+21.6）和跨族模型（+16.6）都有大幅提升，但都低于目标模型自己演化（27B 差 4.9，DeepSeek 差 5.9）。即 skill 里既有**任务级通用知识**，也有**模型特异的适配**。这也是一个便宜的工程结论：可以用小模型跑演化，再把 skill 给大模型用。

### 4.5 消融

- **最终集合大小**（Figure 3，$K=10$ 固定，Qwen3-8B）：随 skill 数增加性能上升并逐渐饱和。HMMT 纵轴 0.40–0.60，Sudoku 0.60–0.90。
- **演化策略**（Figure 4，Qwen3-8B）：四条曲线 Single（最好的单算子）< M-Unif（多算子均匀分配）< M-UCB < Full（加算子自生成）。即「异质算子 > 单算子，UCB > 均匀，算子自生成再有增益」。HMMT 横轴到约 7K rollouts、纵轴 0.42–0.57，Sudoku 到约 5K、0.55–0.85。（具体端点数值纯文本不可读。）
- **集合构造策略**（Table 4，Qwen3.5-9B，$K=10$、$M=10$）：

| 策略 | HMMT | Eq. Theories | Sudoku | Crypt. | Calc. | Futo. | Avg. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Zero-shot | 42.5 | 46.4 | 17.4 | 22.5 | 16.9 | 20.6 | 27.2 |
| Best Single Skill | 52.5 | 49.6 | 30.1 | 29.8 | 30.4 | 30.6 | 37.2 |
| Random M Skills | 62.4 | 56.1 | 28.7 | 40.6 | 42.0 | 65.9 | 49.3 |
| Top-M Individual | 65.1 | 64.2 | 29.2 | 42.7 | 48.8 | 74.8 | 54.1 |
| **Joint M-Skill（本文）** | 65.0 | 68.7 | 30.0 | 45.4 | 55.3 | 75.1 | **56.6** |

这张表最诚实：从 Best Single（37.2）到 Random M（49.3）**+12.1 全部来自「有多个 skill 并聚合」这件事本身**，而 Top-M → Joint 只有 +2.5，Joint 在 HMMT 上（65.0 vs 65.1）甚至略输。所以真正起作用的组件排序是：多 skill 聚合 ≫ 按验证性能挑选（Random→Top-M，+4.8）> 联合互补选择（+2.5）。作者在正文只写「jointly selecting complementary skills achieves the strongest overall performance」，没有指出这个量级差异。

- **超参敏感性**：演化预算 $B$（Figure 5，$B=0$ 即只用种子不演化）性能随 $B$ 上升并递减；UCB 系数 $\beta$（Figure 6）与父采样温度 $\tau_p$（Figure 7）都是**中间值最优的单峰**，峰宽较缓，作者称不过分敏感。Figure 5–7 有跨独立运行的一个标准差阴影。

## 5. 局限与作者自述的边界

作者自己承认的：

- 种群独立性只是理想假设。「The populations are not perfectly independent in practice」，`$1`-(1-q_\epsilon)^K$ 的推导不成立于实际。
- 不套用平稳 bandit 的 regret 保证，因为奖励分布随种群演化非平稳；UCB 只是有限预算下的启发式。
- 加 skill 不保证单调提升：$A_{agg}$ 分解显示新 skill 可能提高覆盖同时增加选择遗憾。
- Conclusion 把跨任务 skill 迁移与长期记忆机制列为 future work，即当前 skill 是**任务内**的，没有跨任务复用证据。

我读完认为作者没说的：

- **测试时算力与方法贡献纠缠**。$M=10$ 的 DIVE 每题 10 次生成 + 1 次 ranking；SC 也是 10 次 rollout、ToT 也对齐了调用数，这部分处理是公平的。但 DIVE($M{=}1$) 在多个设置下不如 SC，说明「冻结参数下演化出的单个 skill」本身的增益远小于表面数字，读者若想要的是「一个可复用 skill 文档」，实际收益应看 $M{=}1$ 列（GPT-5-nano 60.7 vs zero-shot 52.3）。
- **聚合方式按数据集切换**，HMMT 用多数投票、其余用 LLM ranking，附录才交代，主文式 15/18 只写 SelectTop。这让 Table 1 内不同列的推理管线并不完全同构。
- **hard/normal 子集混用**：Qwen3-8B（消融、效率实验）用 normal，主表用 hard。Table 4 用 Qwen3.5-9B 的 hard，与 Figure 3/4 的 Qwen3-8B normal 不可直接对齐。
- **演化阶段成本没披露**。Table 2 只报推理成本。$K=10$ 种群 × $B=10$ 步，每步要在 100 个 reflection 实例上评估新 skill，再加验证集上全部候选 skill 的缓存生成（每种群 top-3 → 30 个候选，还要评联合集合的 ranking），总调用量不小。Figure 1 用 rollout 数间接给了对比，但没有 dollar/GPU-hour 口径。
- **$D_{val}$ 上的选择过拟合风险未评估**。joint selection 直接在 $D_{val}$ 上最大化 $\hat{V}$，候选池是 30 个 skill 的组合空间，验证集规模是「1,200 训练样本减去 1,000」即约 200（Equational Theories 为 1,400−1,000 = 400），在 200 个实例上贪心搜 10 元子集，方差不小。原文未报告 $\hat{V}_{D_{val}}$ 与测试性能的差距。
- **verifier 依赖**。全部六个任务都有可编程的强 verifier（符号等价、约束检查）。方法对无 verifier 或只有噪声 reward 的任务如何退化，原文未讨论。
- **UpdatePopulation 的细节偏薄**：实现里说「the proposed child skill is added to the current population without removing its parent skills」，即种群只增不减。那么 $B=10$ 步后种群从 3 长到 13，UCB 的父打分池随之变大，但没有淘汰机制、也没说是否有种群规模上限。（此处原文表述模糊。）
- **skill 长度/token 开销**：Table 2 里 DIVE 输入 token 33,811 vs zero-shot 170，一部分是 skill 文本，但 skill 的实际平均长度原文未给出（只知 Compression 阈值 4,096 tokens）。

## 6. 对「冻结参数 skill 自进化」这条线的意义

放到这批工作的坐标系里，几条轴可以区分它们：

| 维度 | SkillOpt（Yang et al. 2026a） | GEPA / MIPROv2 | AutoSkill（Yang et al. 2026b） | DIVE |
| --- | --- | --- | --- | --- |
| 演化对象 | 单份 skill 文档 | prompt 指令（+demo） | 终身学习的 skill 库 | 多个 skill 种群 |
| 搜索结构 | 单 incumbent + 结构化编辑 | 单/Pareto 候选池 | 技能库累积 | $K=10$ 独立种群 |
| 变换方式 | add/delete/replace 编辑 + textual lr | 反思式改写 | 技能自演化 | 4 类异质算子 + 自生成算子，UCB 分配 |
| 推理形态 | 单 skill 前置 | 单 prompt | 检索技能 | $M$ 个 skill 并行生成 + 模型 ranking |
| 反馈 | verifier + 自反思 | 反思式文本反馈 | 经验驱动 | 二值 verifier + 自反思（无 NL critique） |

DIVE 在这条线上的位置和贡献可以概括成三点：

1. **它把「skill 优化」从贪心改写升级为显式的种群搜索**，并且第一次把搜索理论中的两个东西——proposal mass / 非平稳 bandit 分配、oracle coverage / selection regret 分解——正式搬到自然语言 skill 演化上。即使这些分析没给出保证，它提供了一套讨论 skill 演化的词汇：一个算子好不好，看它在当前搜索状态下的「有用提议质量」；一个 skill 值不值得留，看它的边际覆盖是否超过它带来的选择遗憾。
2. **它把多样性从「搜索手段」重新定义成「产品形态」**。GEPA / EvoPrompt 用种群找一个强 artifact，DIVE 的最终交付物是一个 $M$ 元互补集合。这既是它最大的性能来源（Table 4：Best Single 37.2 → Random M 49.3），也是它最大的成本来源（推理调用 ×10.9）。对这条线来说这是一个明确的分岔：如果你要的是「一份能贴进 system prompt 的 skill」，DIVE 的多种群机制只带来 $M{=}1$ 那一列的收益；如果你能接受推理时 ensemble，DIVE 的框架就是当前更强的形态。
3. **它给出了 skill 的可迁移性证据**（Table 3），支持「skill 是与权重解耦的知识载体」这个论断，同时量化了模型特异部分（4.9–5.9 个点）。对于 SkillMisevo 这类关心 skill 演化失效/漂移的工作，DIVE 提供的可对照机制是：父相对奖励 + 每种群只选一个 + 边际增益非正即停，这三条都是抑制「越演化越糟」的显式闸门；但 DIVE 没有做任何针对性的「误演化」压力测试。

一个诚实的边界：DIVE 演化的是**任务级** skill，$D_{evo}$ 是同分布的 1,000 个训练样本，本质更接近「无梯度的、以自然语言为参数空间的任务级微调」，而不是开放世界的持续自我进化。跨任务、跨时间的 skill 复用被作者自己划到 future work。

## 7. 可复用的工程要点

1. **三种子初始化（minimal / construction / verification）比单种子稳**。$s_{minimal}$ 只有任务描述和输出约束，充当「不被经验污染的对照假设」；另外两个分别偏成功流程和失败诊断。这套设计直接可抄，成本是 2 次蒸馏调用。
2. **父选择必须按算子意图反向设计**。修复算子挑强的（$G = U(s)$）、探索算子挑弱的（$G = 1-U(s)$）、压缩算子只对超过 token 阈值的强 skill 生效、重组算子第一父挑强、第二父按互补覆盖 $\Delta(s\mid s_1)$ 挑。如果所有算子都对最强 skill 操作，就等价于退化成单轨迹贪心。配 softmax 温度 $\tau_p \approx 0.6$，$\tau_p=0$ 会因为确定性选择而丢多样性（Figure 7）。
3. **奖励用「父相对」而非绝对**：$R = U(s') - \max_{s\in P}U(s)$。这一条对多父算子是必需的，否则重组只要超过弱父就白拿正分，UCB 的算子排序会被污染。
4. **算子池要能自生成，且生成时强制 JSON schema + 诊断字段**。要求模型给出 targeted_gap / supporting_evidence / distinction，然后**只保留 (name, arity, instruction) 去执行**——诊断字段的作用是逼迫有依据、防止换名式重复。喂给它的历史必须先压成结构化摘要（每算子的 $N_a$、$\hat{\mu}_a$、正改进率 $q^+_a$、代表性成败案例、未解决失败模式）。
5. **最终集合选择要按完整推理管线打分，而不是按单 skill 准确率**，并且加两条硬约束：每个种群最多贡献 1 个 skill（强制多样性），边际增益非正就停（避免覆盖增益抵不过 ranking 变难）。同时把每个 skill 在验证集上的回答**生成一次并缓存**，否则贪心搜索的评估开销会爆。
6. **skill 文本的写法要有「输出契约」段**。附录里 GPT-5-nano 学到的 skill 无一例外把格式约束写成硬性 contract（`## Output contract`：只允许一个 `\boxed{}`；不许出现 `\left`/`\right`；Sudoku 必须是九个九元组、不许有解释文字、宁可返回 `<answer>TIMEOUT</answer>` 也不许猜整个网格），再加 `## Verify before answering` 检查清单。这说明 verifier 的格式类诊断信号会被高效吸收成显式契约——如果你的 verifier 只给二值分而不报格式失败原因，这部分收益会丢掉。
7. **便宜的迁移策略**：用小模型跑演化（Qwen3.5-9B），把 skill 搬给大模型用。Table 3 显示能吃到大部分收益（DeepSeek 73.9 → 90.5，自产为 96.4），演化成本按小模型算。
