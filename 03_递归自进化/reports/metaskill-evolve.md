# MetaSkill-Evolve：把 skill 自进化变成真正递归的两时间尺度框架

> 冻结模型权重，让改进流程自身也变成可演化的 skill 文件：task skill 走快循环，meta-skill 走慢循环。

## 速览

- arXiv / 日期 / 机构或作者：arXiv:2607.05297v1 [cs.AI]，2026 年 7 月 6 日。作者 Zefeng Wang\*、Minxi Yan\*（共同一作）、Jinhe Bi、Sikuan Yan、Volker Tresp、Yunpu Ma；单位 LMU Munich、香港中文大学、MCML、MemAgents Lab。
- 是否冻结参数：明确冻结，不做任何权重更新。原文 §4.1：「A single frozen base model, Gemma-4 31B (Google, 2026), serves all five pipeline agents (Analyzer, Retriever, Allocator, Proposer, Evolver); no agent is fine-tuned, so all gains are attributable to evolved skills and meta-skills.」摘要同样强调「With all five pipeline agents sharing a single frozen backbone」。全文没有出现任何 SFT / RL 权重更新流程。
- 演化对象：
  - task skill $s$：一份 Markdown 形态的 agent 程序（SKILL.md），写明面向任务 $T$ 的流程、工具与启发式规则（§3.1）。
  - meta-skill $m=(\psi,\sigma,\alpha,\pi,\varepsilon)$：五份**同样格式**的 SKILL.md 文件，分别被 Analyzer / Retriever / Allocator / Proposer / Evolver 五个专职 agent 各自独享消费（§3.2）。存放位置形如 `skills/meta-analyzer/SKILL.md`（App. B）。因为 meta-skill 与 task skill 表示形式完全一致，同一条五 agent 流水线可以原封不动地作用到 meta-skill 上——这是「递归」在工程上成立的全部技巧。
- 验证信号来自哪里：benchmark 文件按 category 列做分层抽样切成三份互斥分区（App. F）——train 用于挖失败样本，val 用于给子代打分与 frontier 选择，test 是演化循环全程不可见的留出集。快循环的信号是子代在 $D_{val}$ 上的增益 $\Delta U$；慢循环的信号是最近 $H$ 个后代 $\Delta U$ 的经验均值 $\hat P$。没有人工标注偏好，没有额外 reward model。
- 一句话贡献：把「改进流程」本身参数化成五个带类型的 meta-skill 文件，用与改进 task skill 完全相同的五 agent 流水线在更慢的时间尺度上改进它，从而在不加模型、不加训练目标的前提下得到一层有界的递归自改进。

## 1. 问题：既有 skill 自进化为什么「不是递归的」

作者对前人的批评极其具体，几乎是这篇论文的立论全部，值得原样拆开。

**批评一：被优化的产物在变，优化它的算子不变。** 原文 §1：「These systems, however, evolve only what the agent does, not how it evolves: the artifact under optimization changes while the operator that optimizes it stays fixed.」被点名的对象是 EvoSkill、GEPA、SkillWeaver 这类 analyze→propose→evolve 闭环系统。作者借 Good (1965) 与 Schmidhuber (2006) 的语汇下判决：它们是 self-improving，但 stop short of being recursively self-improving。

**批评二：meta 层逻辑是全局硬编码的，且所有分支共享。** §1 列出被硬编码的五件事：失败如何被诊断、提出哪些编辑、搜索预算如何分配、跨分支经验是否复用、批准的编辑如何落盘。后果被作者写成一句很锋利的话：「A branch therefore cannot improve the way it diagnoses failures: it applies the same procedure to every error, whether a misread table or a faulty calculation, and when that procedure yields the wrong fix, nothing in the loop can revise it.」也就是说，误读表格和算错数会走同一条诊断路径，而当这条路径给出错误修复时，循环里没有任何机制能修正诊断本身。

**批评三：只优化 $U(s)$ 丢掉了第二个量。** 作者提出支配演化式 skill 搜索的两个量：

- 当前 skill 效用 $U(s)$：当前 skill 在验证批上的分数。
- meta 生产力 $P(m\mid s)$：一个分支在其当前改进策略 $m$ 下产出更强后代的速率。

两者不等价：一个 skill 今天分数很高，却可能位于一个 meta 策略只会生出弱后代的分支；反之一个中等分数的 skill 可能处在一条能稳定推高分数的分支上，因此更值得延伸。作者的假设（原文用的是 hypothesize，不是证明）：只优化 $U(s)$ 是固定 meta 的演化在「重复失败共享同一种诊断风格、而 meta 流程无法修正它」时停滞的主因。

**批评四：现有的递归自改进工作递归的层次不对。** §2 把 STOP (Zelikman et al., 2024)、PromptBreeder (Fernando et al., 2023)、ADAS (Hu et al., 2025)、Darwin Gödel Machine (Zhang et al., 2026c) 归为「recurse on code or prompts under one global policy」。MetaSkill-Evolve 的差异被表述为三点：递归对象是 skill 文件；算子是被 branch-local meta-skill 参数化的五 agent 流水线；策略是 per-lineage 而非 global。

这里作者自己也给出了边界：这是 a bounded, one-level recursion（有界的一层递归）——不是无限自指。没有 meta-meta-skill。这个诚实的限定很重要，下文 §5 会再回到它。

## 2. 方法详解

### 2.1 分支状态与五个 meta 分量

分支状态 $b=(s,m,h)$，其中 $h$ 是该分支的迭代历史，

$$m = (\psi, \sigma, \alpha, \pi, \varepsilon).$$

每个分量都是一份 Markdown 形态的 LLM-agent 程序（SKILL.md），被恰好一个专职 agent 消费（§3.2、App. A）：

| 分量 | 消费者 | 参数化的行为 | 具体控制什么（§3.4 + App. A） |
| --- | --- | --- | --- |
| $\psi$ | Analyzer | 诊断策略 | 把失败 trace 映射到一个失败标签 $\phi$（不超过 15 词）和自由文本分析 $a$，并给出待编辑的目标 skill 文件。**标签词表本身由 $\psi$ 维护、由慢循环修订**——这是「诊断方式可被改进」的落点。带三层解析恢复链：先解析 `final_answer`，再扫描所有 agent step 的输出，最后用受约束的 `response_format` 发一次修复调用；`target_skill` 字段在未显式给出时从 `relevant_sections` 自动推导，作者说这是为了在小模型上更稳。 |
| $\sigma$ | Retriever | 共享策略 | 从 SQLite 图库中取同分支与跨分支候选，按标签相似度**超额取到 3 倍** inspiration 预算（`$3`L_{same}$、`$3`L_{cross}$），再用 LLM 重排序缩到交给 Proposer 的 inspiration 集合 $I$。原文明确「the breadth/depth balance is itself a learned object」。 |
| $\alpha$ | Allocator | 分配策略 | 选择每步子代预算 $K\in[1,K_{max}]$：停滞时（$\hat P\approx 0$）扩宽，刚出过高产编辑后收窄。 |
| $\pi$ | Proposer | 编辑提案策略 | 基于 $(f,a,I)$（最差样本、分析、检索到的灵感）产出具体编辑 $\delta$：目标章节、改动内容、理由。当 $K>1$ 时注入 diversity hint，让第 $k$ 个 proposer 走一个与前面子代不同的干预角度，减少近重复子代。 |
| $\varepsilon$ | Evolver | 编辑执行策略 | 通过 `skill_tools` 把 $\delta$ 落成文件写入，并用 before/after 哈希校验标记「目标文件其实没变」的空编辑；apply 之后刷新 skill registry，使后续评测用上新 skill。 |

作者反复强调这不增加任何架构组件（§1：「Crucially, this adds no architectural component」）。五个 agent 都是共享同一冻结底座的 `ToolCallingAgent` 实例，把 skill catalog（视上下文是 task skill 还是 meta-skill）作为额外上下文加载（App. A）。skill catalog 采用渐进披露：先给紧凑目录（名字 + 一行摘要），再按需加载完整 SKILL.md，再按需加载资源文件（App. B）。

### 2.2 两个目标量

任务效用（式 1）：

$$U(s) = \mathbb{E}_{(x,y)\sim T}\big[\,r(A_s(x), y)\,\big],\qquad r(\cdot,\cdot)\in[0,1]$$

其中 $A_s$ 是执行 skill $s$ 的 agent。$T$ 只能通过采样访问，所以 $U(s)$ 用留出验证批上的准确率估计。

meta 生产力（式 3），定义为 $m$ 在 $s$ 处每个子代的期望改进：

$$P(m\mid s) = \mathbb{E}\left[\frac{1}{K}\sum_{k=1}^{K}\big(U(s'_k) - U(s)\big)\right]$$

逐节点用经验均值估计 $\hat P_v = \overline{\Delta U}_{\text{children of }v}$，无子代的节点取 0。快循环最大化 $U(s)$，慢循环最大化产出这些改进的 $m$。

### 2.3 演化图与 frontier 选择

全部搜索历史记录为一张持久化在 SQLite 里的有向无环图 $G=(V,E)$（§3.3）。每个节点 $v$ 是一个被评测过的分支状态，存 $(s_v, m_v, U_v, \Delta U_v, \phi_v)$ 加上分支路径和选择计数器。两类边：lineage 边 $u\to v$ 表示 $v$ 是演化 $u$ 得到的子代；inspiration 边记录 $\sigma$ 在提案 $v$ 时检索到的跨分支节点。两类边都由早节点指向晚节点，所以 $G$ 天然无环——节点只创建一次、只从已存在节点创建、从不原地修改。

准入规则很硬：**只有严格改进父代的子代（$\Delta U_v>0$）才进 archive**（archive 既是可部署状态池，也是未来父代的候选集）。$\Delta U_v\le 0$ 的中性或退化子代不能当父代，但仍持久化在 $G$ 里，保留 provenance 并继续对 $\sigma$ 可见——一个失败的编辑仍可以启发后来的提案。

frontier $F$ 每轮从 archive 刷新为 top-$K$ 节点，父代按式 4 选：

$$v^{*} = \arg\max_{v\in F}\big(\eta_1 U_v + \eta_2 \hat P_v + \eta_3 N_v\big),\qquad N_v = \frac{1}{1+\text{times\_selected}_v}$$

三项各自针对贪心搜索的一种失效模式（§3.3）：

- $U_v$ —— exploitation：避免在弱父代上追逐波动很大的增益估计。
- $\hat P_v$ —— 轨迹质量：把算力从已经平台化的高分节点转移到仍在产出有用后代的节点。
- $N_v$ —— 访问冷却：被选过 $k$ 次的节点必须比未被选的兄弟高出 $\eta_3 k/(k+1)$ 才会被再选，防止预算被一条线垄断。

把任一 $\eta_i$ 置零就暴露对应模式：$\eta_2=0$ 时 frontier 锁死在停滞的高效用节点，$\eta_3=0$ 时坍缩成单一 lineage，$\eta_1=0$ 时把噪声很大的单子代增益当成父代质量。作者特意点明：**不按 lineage 做过滤，多样性是打分函数的性质而不是结构约束**。§2 里还补了一句定位：$\hat P_v$ 被当作 quality-diversity 描述符，用来保持 improvement-policy 的多样性。

### 2.4 快循环：task skill 演化

```
Algorithm 1  Fast timescale: one task-skill iteration
Input:  frontier 父代 v；训练批 D_train，验证批 D_val
Output: K 个提交的子节点（其中 ΔU>0 的进入 archive）

# 恢复与评测
1: 把快照 s_v (task)、m_v (meta) 恢复到磁盘
2: E ← Eval(s_v, D_train)                      # 收集失败
3: if E 无失败 then return all_passed
4: end if
5: f ← argmin_{e∈E} score(e)                   # 最差样本

# 诊断与规划（3 个 agent）
6: φ, a ← Analyzer(f, m_v.ψ)                   # 标签、分析
7: I     ← Retriever(φ, b_v, m_v.σ)            # 灵感节点
8: K     ← Allocator(h_v, a, I, m_v.α)         # 子代预算

# 提案与演化（K 个子代）
9:  for k = 1 … K do
10:     恢复 s_v
11:     δ     ← Proposer(f, a, I, m_v.π)
12:     s'_k  ← Evolver(s_v, δ, m_v.ε)
13:     U'_k  ← Eval(s'_k, D_val);  ΔU_k ← U'_k − U_v
14: end for

# 交错慢循环、提交与同步
15: if t mod H = 0 then m_v ← 更新 meta-skill（Alg. 2）
16: end if
17: 把 {⟨s'_k, ΔU_k, m_v⟩} 提交到 G
18: F ← SyncFrontier(F)                        # 下个父代按式 4 抽取
```

两个实现细节值得注意。第一，**调用任何 agent 之前先把选中分支的 task 与 meta 快照恢复到磁盘**，所以「分支状态」由 SQLite DAG 定义，而不是由工作树里残留的文件定义；每个分支从自己记录的快照起跑、隔离评测，避免 lineage 间泄漏。第二，诊断目标取训练批上**最差**的单个样本，作者承认这是刻意的高信号选择，但用「每个由此产生的编辑最终由验证增益 $\Delta U_v$ 评判、而不是由那一个训练样本评判」来对冲离群风险。

### 2.5 慢循环：meta-skill 演化，以及「同一条流水线作用于自身」到底怎么做

作者先给出为什么不能每轮更新 $m$：那会让 meta-skill 暴露在驱动 task skill 演化的同一种单样本噪声下。慢循环每 $H$ 个快迭代触发一次，在该窗口上做聚合，用反应性换稳定性。

关键技巧是**把改进历史重塑成一个失败样本**。慢循环的驱动信号是 $\hat P(m\mid s)=\frac{1}{|H|}\sum_{u\in H}\Delta U_u$，即最近 $H$ 个后代的平均增益。作者把 $\hat P$ 连同该窗口内的标签、诊断、结果一起折叠成一条**合成 meta 失败 trace** $f_m$——原文：「the improvement history reshaped to look like one failing training example, so that a single Analyzer prompt serves both timescales.」这就是「同一条流水线作用于自身」的具体实现：不改 prompt 模板、不改 agent 角色，只把输入从「一个失败的任务样本」换成「一段不够高产的改进历史」，把编辑目标从 task-skill 文件换成隐藏的 meta-skill 文件。

```
Algorithm 2  Slow timescale: meta-skill update, 触发于 t mod H = 0
Input:  分支历史 H（最近 H 个子代）；meta-skill m；父代 v；
        名字集合 M = {ψ, σ, α, π, ε}
Output: 全部五个 meta-skill 文件的快照

# 构造 meta 失败 trace
1: P̂ ← (1/|H|) Σ_{u∈H} ΔU_u                      # meta 生产力
2: f_m ← 窗口 H 内标签/诊断/结果 + P̂ 组成的 trace

# 诊断与规划（目标 ∈ M）
3: φ_m, a_m ← Analyzer(f_m, m)                    # 带 round-robin 兜底
4: I_m       ← Retriever(φ_m, b_v, m.σ)
5: K_m       ← Allocator(H, a_m, I_m, m.α)

# 整体 m 重写（K_m 个累积式子代）
6:  for k = 1 … K_m do
7:      从磁盘渲染 meta 文件            # 反映的是第 k−1 个子代的结果
8:      for j ∈ M do                    # Proposer：顺序执行
9:          δ_m^(j) ← Proposer(f_m, a_m|tgt=j, I_m, m.π)
10:     end for
11:     {m^(j)} ← ParallelEvolver({δ_m^(j)}_{j∈M}, m.ε)   # 每文件一个 worker
12: end for
13: return {m^(j)}_{j∈M} 的快照
```

Analyzer 在慢循环里点出 $\{\psi,\sigma,\alpha,\pi,\varepsilon\}$ 中**最被牵连的那一个**分量；这个诊断固定了引导检索的 meta 失败标签 $\phi_m$，但**不收窄编辑范围**。Retriever 捞出 meta 失败标签匹配 $\phi_m$ 的跨分支 lineage，Allocator 定本轮预算 $K_m$，Proposer 与 Evolver 每轮共同编辑全部五个文件。五个文件的最终快照写进子代的 `meta_state_json`。

**跨 lineage 传播的唯一通道**：每个分支带自己 lineage-local 的 $m$，一条 lineage 的改进策略到达另一条 lineage 的唯一途径就是这个 meta 层检索，所以「逃逸策略」能在 lineage 间传播而不需要任何共享全局状态（§3.5）。App. B 举了个具体图景：一条分支可能对 table-extraction 失败学会激进编辑策略，另一条对算术推理失败发展出保守的增量编辑。

作者列出三点把慢循环与「普通跑一遍快循环」区分开：

1. **受约束的 Analyzer**：如果诊断为空、或诊断指向 task skill，就在 $\{\psi,\sigma,\alpha,\pi,\varepsilon\}$ 上做 round-robin 兜底，使慢循环既不会因目标不可用而中止，也不会静默退化成一次冗余的快循环。
2. **整体 $m$ 重写**：每个子代一步内编辑全部五个文件（Proposer 顺序、Evolver 并行），保持跨分量一致性；作者给的例子是「一个假设更细粒度标签词表的 $\pi$ 编辑，会与相应的 $\psi$ 编辑一起施加」。
3. **累积式子代**：第 $k+1$ 个子代读的是第 $k$ 个子代写完的文件，而不是父代的文件；这个移动靶让 $K_m$ 轮变成增量精修，而不是 $K_m$ 次互相独立的覆写、最后平均回父代。

### 2.6 关键超参数（App. D，Defaults）

- frontier 权重：$\eta_1=1.0$、$\eta_2=0.5$、$\eta_3=0.25$。
- meta 更新周期：$H=2$。
- 迭代预算：5 个快迭代（在 $H=2$ 下即两次 meta 更新）。
- 子代预算：$K\in[1,K_{max}]$，$K_{max}=3$，初值 $K=2$ 由 Allocator 逐步自适应（$-\alpha$ 消融就是把它冻结在这个初值）。
- frontier 大小：$K_F=3$；连续 5 轮 frontier 无改进则早停。
- 训练批采样：category-aware round-robin，每批 6 个类别、每类别 3 个样本。
- 跨分支共享：检索概率 $p_{cross}=0.2$，同分支/跨分支 inspiration 上限 $L_{same}=3$、$L_{cross}=2$（LLM 重排前按 3 倍超额取）。
- 评测并发：默认 16，QA benchmark 在 vLLM 后端下提到 128；作者说只影响吞吐不影响准确率。

## 3. 实验设置

- Benchmark（§4.1）：OfficeQA (Opsahl-Ong et al., 2026)、SealQA (Pham et al., 2026)、ALFWorld (Shridhar et al., 2021)，作者说是为覆盖互补能力而选。每个 benchmark 文件按 category 列分层抽样切成 train / val / test 三份互斥分区，test 分区演化循环全程不可见，最终通过一次独立的 benchmark-mode pass 报告所选 skill 在 test 上的准确率（App. F 说明 test 是 per-category 的余量）。
- 底座模型：单一冻结的 Gemma-4 31B (Google, 2026)，服务全部五个 pipeline agent，无任何微调。
- Baseline（§4.1），四种配置共享同一底座：
  - No-Skill：不加载任何 skill 且关闭 reflection，量化裸底座。
  - Static Skill：加载作者手写的初始 skill 并全程冻结，隔离「有一份 skill 工件」本身的价值。
  - Single-Level Evolution：作者的快循环 + 冻结慢循环（$K_{max}=1$、无跨分支共享、无 meta-skill 更新），隔离纯 task skill 演化的贡献。
  - MetaSkill-Evolve：完整两时间尺度系统。
- 指标：留出 test 分区准确率；ALFWorld 报告聚合任务成功率。
- 预算：默认 5 个快迭代 / 两次 meta 更新（App. D）；horizon sweep 里改为固定三次 meta 更新、迭代数随 $H$ 缩放为 `$3`H$（即 6 / 12 / 24 次迭代）。原文未给出 token 消耗、wall-clock 时间或 API 成本的任何数字，这是一个明显的缺口。

## 4. 结果与消融

### 4.1 主结果（Table 1，Fig. 3）

留出 test 准确率（%）：

| 方法 | OfficeQA | SealQA | ALFWorld |
| --- | --- | --- | --- |
| No-Skill | 31.78 | 29.17 | 92.31 |
| Static skill | 36.09 | 29.41 | 90.38 |
| Single-Level | 48.94 | 37.21 | 92.31 |
| MetaSkill-Evolve | 55.32 | 45.26 | 94.23 |
| $\Delta$ vs. No-Skill | +23.54 | +16.09 | +1.92 |

分解成三段（§4.2）：

1. 静态 skill 相对裸底座：OfficeQA +4.31，SealQA +0.24（作者说大体中性），ALFWorld −1.93（轻微退化）。
2. 用单层演化替换固定 skill：再加 +12.85 / +7.80；ALFWorld 只是回到 No-Skill 的 92.31。
3. **打开慢循环：再加 +6.38 / +8.05 / +1.92。这就是「递归是否值得」的直接证据。** 作者的归因逻辑很干净：与 Single-Level baseline 的唯一差别就是 meta-skill 文件 $\{\psi,\sigma,\alpha,\pi,\varepsilon\}$ 自身是否被演化。

按占比看：SealQA 上慢循环贡献 8.05 / 16.09 = 50.0% 的端到端增益，几乎与快循环等量；OfficeQA 上是 6.38 / 23.54 = 27.1%；ALFWorld 上是 1.92 / 1.92 = 100%——两个非 meta 步骤（加 skill、演化 skill）都没有净增益，全部提升来自慢循环。作者对 ALFWorld 的解读是：底座已接近天花板（92.31%），绝对数值很小，但这说明「即使 task skill 演化已经饱和，meta-skill 适应仍是起作用的那个成分」。

两个 QA benchmark 上 No-Skill → Static → Single-Level → Ours 单调递增，作者据此说每个设计选择（加 skill、演化它、再演化演化它的流程）都独立生效。

### 4.2 分量消融（Table 3，App. E；QA 部分可视化于 Fig. 4）

| 配置 | OfficeQA | SealQA | ALFWorld |
| --- | --- | --- | --- |
| Full MetaSkill-Evolve | 55.32 | 45.26 | 94.23 |
| $-\psi$ (disable_psi) | 39.09 | 39.63 | 88.46 |
| $-\sigma$ (no inspirations) | 39.09 | 40.54 | 88.46 |
| $-\alpha$ (disable_alpha, K=2) | 35.58 | 40.54 | 88.46 |
| $-\pi$ (disable_pi) | 37.59 | 36.84 | 86.54 |
| No cross-branch retrieval | 39.84 | 41.44 | 92.31 |
| No meta-updates | 48.94 | 37.21 | 92.31 |

三点发现（§4.3 + App. E）：

- 每个带类型的分量都有贡献，没有任何单分量消融能追平完整系统；但**哪个分量最重要随域而变**。
- OfficeQA 上分配策略 $\alpha$ 最关键（55.32→35.58，−19.7 点），作者的解释是 OfficeQA 的失败地形里存在成片相关的算术错误，$\alpha$ 在停滞后自适应扩宽子代预算才可能产出一个成功子代；$\pi$ 以 −17.7 点紧随其后。
- SealQA 上编辑提案策略 $\pi$ 转为主导（45.26→36.84），作者说增益取决于每次编辑的精确内容而非搜索扇出宽度。ALFWorld 上 $\pi$ 同样主导（94.23→86.54）。

一个值得单独拎出来的对照：ALFWorld 上只移除跨分支检索（no cross-branch，92.31）恰好回到 Single-Level baseline（92.31），因此作者说**跨分支迁移可复用子程序（例子是 object-disambiguation 与 deferred-placement 子技能）解释了 ALFWorld 上全部 +1.92 的提升**。另外 no meta-updates 行在三个 benchmark 上都精确复现 Table 1 的 Single-Level 行，说明这两个配置确实是同一个东西，实现上一致。

注意消融数值的一个不对称：$-\psi$ / $-\sigma$ / $-\alpha$ / $-\pi$ 都掉到 35.58~40.54（OfficeQA），**低于 Single-Level 的 48.94，甚至低于 Static Skill 的 36.09（$-\alpha$ 的 35.58）**。也就是说，打开慢循环但残废掉某一个 meta 分量，比彻底不开慢循环更糟。原文没有讨论这个现象，但它的含义值得警惕：慢循环是个会主动重写自己诊断与提案逻辑的机制，分量不完整时它会把系统推到比不动更差的地方。

### 4.3 meta 更新周期 $H$（Table 2，App. D；Fig. 5）

固定三次 meta 更新、迭代预算随 $H$ 缩放（`$3`H$）：

| Benchmark | H=2 (6 it.) | H=4 (12 it.) | H=8 (24 it.) |
| --- | --- | --- | --- |
| OfficeQA | 48.94 | 41.35 | 39.84 |
| SealQA | 44.14 | 44.14 | 43.24 |
| ALFWorld | 90.38 | 90.38 | 88.46 |

结论：最紧的间隔 $H=2$ 在三个 benchmark 上都最好，刷新越少准确率越低，但幅度强烈依赖 benchmark。OfficeQA 最敏感，$H=2\to H=8$ 掉 9.1 点；SealQA 与 ALFWorld 在 $H=2$ 与 $H=4$ 间几乎持平，只在 $H=8$ 略降（各 0.9 与 1.9 点）。作者的机制解释是双向的：触发太频繁会让 meta-skill 暴露在聚合本想过滤掉的单样本噪声下；触发太稀疏会让 meta-skill 相对漂移中的 task skill 变陈旧，于是它更大范围的重写落在快循环已经走过的编辑上，**覆盖掉高产的改动**。

作者主动说明了一个口径问题（§4.4）：因为这里固定 meta 更新次数为三，$H=2$ 点是 6 迭代 / 三次 meta 更新，与 Table 1 和 Table 3 背后的默认 5 迭代 / 两次 meta 更新是**略微不同的操作点**，所以数值不该与主表逐格对上。这解释了为什么这里 OfficeQA 的 $H=2$ 是 48.94 而 Table 1 的完整系统是 55.32。值得注意的是 48.94 恰好等于 Table 1 的 Single-Level 数值，这个巧合原文未作说明（此处原文表述模糊）。

### 4.4 划分比例敏感性（App. G，Table 4 / Table 5）

这一节的数字重算在一个共同的留出 test 子集上（因为分层划分带种子，大留出的 test 集是小留出 test 集的子集，作者取交集后重打分，不重跑），所以绝对值与主结果略有差异。

训练比例 sweep（val 固定 0.10，dual-evolve，5 轮外迭代，Table 4）：SealQA 45.98 / 43.68 / 48.28，OfficeQA 44.86 / 42.99 / 48.25，ALFWorld 87.74 / 88.68 / 90.57（tr=0.05/0.10/0.15）。作者说更多训练数据只带来温和增益：ALFWorld 单调上升，两个 QA 在噪声内基本持平（$n\approx 87\sim 107$ 上 $\pm 1\sim 4$ 个样本）。

ALFWorld 验证比例 sweep（Table 5）：val 0.10→0.25 在 tr=0.05/0.10/0.15 上分别 +2.0 / +4.3 / +2.5 点（87.74→89.69、88.68→92.96、90.57→93.02）。作者给出的机制值得抄进工程手册：在底座已经解决大多数 episode 的高基线 benchmark 上，小验证集里失败样本太少，Analyzer 几乎看不到失败轨迹，诊断→提案→选择这条链没有信号可作用，**慢循环退化成 no-op**。实践含义：在饱和 benchmark 上，验证集必须大到足以暴露失败。

## 5. 局限与作者自述的边界

作者自述（Limitations 节，仅三句）：

1. 只在三个精心整理的 benchmark 上评测，向反馈更嘈杂的开放式、长时程真实任务的迁移未做验证。
2. **五 agent 流水线本身是固定的：演化它产出的 skill，但不演化它的角色和接线。** 这是递归深度的真实上限——递归停在「用固定的五角色流水线改写五个 meta 文件」这一层。
3. meta 更新按固定周期 $H$ 触发（没有自适应触发）。

我认为还存在几个作者没说的问题：

- **样本量与统计显著性完全缺失。** App. G 自己披露 $n\approx 87\sim 107$，主结果没有给 $n$、没有给种子数、没有给标准差或置信区间，也没有多 seed 重复。在这个量级上，SealQA 的 +8.05 点约等于 7~9 个样本；ALFWorld 的 +1.92 点在 $n\approx 104$（92.31→94.23 相当于约 2 个 episode）上基本是噪声量级。作者却把 ALFWorld 那 +1.92 当作「meta 适应仍是起作用的成分」的证据，这个论断的支撑相当薄。
- **成本未报告。** 慢循环每轮要顺序生成 5 个提案、并行执行 5 个文件写入，乘以 $K_m$；快循环每个子代要在 $D_{val}$ 上完整评测一遍。整个系统相对 Single-Level 的 token / 调用量倍数原文未给出，因此「+6.38 点」是否值得那份额外算力无法判断。$H$ sweep 固定 meta 更新次数而不是固定总算力，恰好回避了这个对比。
- **Single-Level baseline 同时被砍了三样东西**（$K_{max}=1$、无跨分支共享、无 meta 更新，§4.1）。所以「打开慢循环」的 +6.38 / +8.05 并不是纯 meta 演化的增益，里面还混着「子代预算能大于 1」和「能跨分支检索」这两个与 meta 演化正交的因素。作者在 §4.2 写「the only difference from the Single-Level baseline is whether the meta-skill files are themselves evolved」，这与 §4.1 对 baseline 的定义不一致（此处原文表述矛盾）。Table 3 的 no meta-updates 行数值等于 Single-Level，说明实现上这两者是同一配置，所以矛盾出在描述而不是实验，但归因表述确实过强了。
- **只有一个底座、只有一个规模。** 全部实验都是 Gemma-4 31B。meta-skill 演化本质上要求底座能读懂关于自己诊断流程的自然语言指令，这个能力很可能强烈依赖模型规模；跨模型、跨规模的可复现性完全未测。
- **$\hat P_v$ 的估计极其稀疏。** $K_{max}=3$、默认 5 迭代，意味着大多数节点的 $\hat P_v$ 是 1~3 个子代增益的均值，无子代的节点直接取 0。用这样的量作为 frontier 打分中权重 0.5 的一项，噪声不小；作者在 §3.3 承认 $\eta_1=0$ 时会「trusts noisy single-child gains as parent quality」，却没有量化 $\eta_2$ 这一项自身的噪声。
- **递归的收益是否会随迭代累积，没有证据。** 全部主实验只跑 5 个快迭代 / 2 次 meta 更新。递归自改进的核心论断本应是「改进流程变好之后，后续改进速度加快」，即 $\hat P$ 随时间上升。原文没有给出任何 $\hat P$ 随迭代变化的曲线，$H$ sweep 里迭代数从 6 增到 24 时性能反而下降。这意味着论文证明的是「演化 meta-skill 有用」，而不是「递归带来复合增长」。

## 6. 对「冻结参数 skill 自进化」这条线的意义

先说这条线的共同底色：模型权重冻结，被优化对象是文本工件（skill 文件 / prompt / 记忆），验证信号来自可执行的任务反馈。MetaSkill-Evolve 完全落在这个坐标系内，且它把这条线里「唯一没被动过的东西」——改进流程自身——变成了同类工件。

坐标系里的定位（以下对 DIVE / DarwinX / HSI / SkillMisevo 的比较基于你给的这批工作的通用特征，**MetaSkill-Evolve 原文并未点名这四个系统**，论文引用列表里也没有这些名字，因此这一节的对照属于外部定位而非原文论断）：

- **相对于单层 skill 演化系统（原文点名的 EvoSkill、GEPA、SkillWeaver，以及这条线上以演化 skill 库为主的一批工作）**：MetaSkill-Evolve 的增量不在「怎么改 skill 更好」，而在「把改 skill 的规则本身分支局部化并可演化」。这带来一个此前不存在的自由度：不同 lineage 可以持有互不相同的改进策略（App. B 的 table-extraction 激进策略 vs. 算术推理保守策略），而不是全局共享一套 meta prompt。
- **相对于以 skill 库规模/覆盖为目标的工作（SkillMisevo 一类关注 skill 演化中的误演化、退化与污染）**：MetaSkill-Evolve 的防退化手段是纯选择式的——只有 $\Delta U>0$ 才进 archive，中性/退化子代降级为「只能当灵感」。它没有专门的 misevolution 检测器，Evolver 的 before/after 哈希校验只能捕获「文件没变」的空编辑，捕获不了「改坏了但确实改了」。而消融表里 $-\alpha$ 掉到 35.58（低于静态 skill 36.09）恰好说明这套选择机制在 meta 层不完整时保护力不足。这是两条线可以互补的地方。
- **相对于 DIVE / DarwinX 一类以群体、archive、quality-diversity 为骨架的演化系统**：MetaSkill-Evolve 的搜索骨架同源——持久化 DAG（而非固定 beam）、archive 准入、novelty 项 $N_v$ 抑制预算垄断。它自己在 §2 里就把 $\hat P_v$ 描述为一个 quality-diversity 描述符，维持的是 improvement-policy 的多样性而不是行为多样性。这是一个新颖的 QD 维度：**沿「改进策略」而不是沿「行为特征」做多样性保持**。另一个骨架差异是它明确拒绝按 lineage 做结构过滤（§3.3：「diversity is a property of the score, not a structural constraint」）。
- **与 HSI 的 meta-evolver 的异同（这是本节最需要说清的一点，但也要说明我手上没有 HSI 原文，以下基于「HSI 设置一个独立的 meta-evolver 组件去改进演化器」这一通行理解，不确定处请以 HSI 原文为准）**：
  - 相同：两者都承认「改进算子应当可被改进」，都在冻结权重下把这件事做成文本层面的重写，都需要一个比任务信号更慢、更聚合的信号来驱动 meta 层。
  - 不同一：**是否引入新组件。** HSI 的 meta-evolver 通常是一个额外的、专门负责改进演化器的模块，即 meta 层有自己的算子。MetaSkill-Evolve 反复强调「adds no architectural component」「no additional model or objective」——meta 层用的就是那五个 agent，只是把输入 trace 和目标文件换掉。代价是 meta 层的表达力被限制在「这五个 agent 能读懂的 Markdown 编辑」范围内。
  - 不同二：**meta 策略是全局的还是 lineage-local 的。** MetaSkill-Evolve 的 $m$ 挂在分支上，随节点快照存进 SQLite，选中分支时先恢复其 meta 快照再跑流水线（App. B）；跨 lineage 只能通过 meta 层检索传播。一个全局 meta-evolver 天然是所有分支共享一套策略。这是「per-lineage vs. global」的差别，作者在 §2 明确把它当作与已有递归自改进工作的核心区分点。
  - 不同三：**递归的表示统一性。** MetaSkill-Evolve 的关键设计是让 meta-skill 与 task skill 采用同一种表示（SKILL.md），这才使「同一条流水线作用于自身」在实现上是零成本的。如果 meta 层的表示是代码或专用配置，就必须为 meta 层再写一套算子——而那正是作者要避免的。
  - 不同四：**递归深度是明确有界的。** 作者自己写「a bounded, one-level recursion」，且 Limitations 承认五 agent 流水线的角色与接线不演化。所以它不是无限自指，而是「一层可演化的策略 + 一层固定的骨架」。

一句话定位：在冻结参数 skill 自进化这条线里，这篇的贡献是找到了一个**表示上的技巧**（meta 层与 task 层同构）和一个**信号上的技巧**（把改进历史伪装成失败样本），从而用零新增组件把递归推进到 skill 层；它的证据强度（单底座、5 迭代、无方差、无成本）远弱于它的机制设计的启发性。

## 7. 可复用的工程要点

1. **把「改进历史」重塑成一条合成失败 trace，就能让同一个 Analyzer prompt 服务两个时间尺度。** 这是全篇最便宜也最可移植的技巧（§3.5）：不需要写 meta 层专用的 prompt，只需要一个把 $(\hat P,\text{tags},\text{diagnoses},\text{outcomes})$ 序列化成「一个失败样本」的函数。任何已有 analyze→propose→evolve 系统都能加上。

2. **分支状态由数据库定义，而不是由工作树定义。** 每次展开父代前先把 task 与 meta 快照恢复到磁盘（Alg. 1 第 1 行），每个子代提案前再恢复一次 $s_v$（第 10 行）。这消除了 lineage 间的文件泄漏，也让任何终态可完整追溯 provenance。持久化 DAG 而非固定 beam，还能回访之前被降权的 lineage。

3. **失败/中性子代不要删，降级为「灵感」。** $\Delta U\le 0$ 的子代不进 archive、不能当父代，但留在图里供 Retriever 检索（§3.3）。一个失败的编辑对后续提案仍有信息量，这个规则的实现成本几乎为零。

4. **frontier 打分用三项而不是一项，且不要用结构约束做多样性。** $\eta_1 U_v+\eta_2\hat P_v+\eta_3 N_v$，默认 1.0 / 0.5 / 0.25，$N_v=1/(1+\text{times\_selected}_v)$。$N_v$ 的效果可以精确量化：选过 $k$ 次的节点必须比未选兄弟高 $\eta_3 k/(k+1)$ 才会被再选，这是一个可直接抄的反垄断项。

5. **多分量协同编辑要「整体重写 + 累积式子代」。** 一次编辑全部五个文件保持跨分量一致性（避免 $\pi$ 假设了新标签词表而 $\psi$ 没跟上）；并让第 $k+1$ 个子代读第 $k$ 个子代写完的文件，把 $K_m$ 轮变成增量精修而不是互相覆盖的独立重写（§3.5）。Proposer 顺序、Evolver 每文件一个 worker 并行，是一个现成的并发划分。

6. **检索用「超额 3 倍 + LLM 重排」，且跨分支要适度。** $L_{same}=3$、$L_{cross}=2$，先按标签相似度取 3 倍再让 LLM 重排（§3.4、App. D）。App. D 明确警告：过于激进的跨分支检索会从处理结构性不同失败的分支引入无关灵感，反而变成噪声。

7. **在高基线任务上先把验证集做大，否则慢循环是 no-op。** App. G 的 ALFWorld 结果（val 0.10→0.25 带来 +2.0/+4.3/+2.5 点）给出了明确操作规则：验证集必须大到能暴露足够失败样本，否则 Analyzer 看不到失败轨迹，整条诊断→提案→选择链没有信号。

8. **给 Analyzer 加解析恢复链与兜底路径。** 三层恢复（解析 `final_answer` → 扫描 step 级输出 → 用受约束 `response_format` 发修复调用），以及 meta 层的 round-robin 兜底（诊断为空或错误指向 task skill 时轮转目标分量）。作者明说这些是为了在小模型上保持鲁棒、并防止慢循环静默退化成冗余的快循环——这类兜底在自进化系统里是正确性的一部分，不是工程细节。
