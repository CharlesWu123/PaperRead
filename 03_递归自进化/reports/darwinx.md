# DarwinX：模型冻结下的 harness 种群自然选择

> 权重不动，只对 harness 种群做「扩展且不回退」的选择，四个基准平均涨约 17 分。

## 速览

- arXiv / 日期 / 机构：arXiv:2608.07545v1，cs.NE，2026 年 7 月 31 日。Salesforce AI Research + Salesforce Agentforce。第一作者 Yifan Zhang、Yutong Dai；资深作者含 Silvio Savarese、Ran Xu、Zeyuan Chen。被演化的产品化 agent 叫 Monet，DarwinX 是演化 Monet harness 的过程（§1 脚注 2）。
- 是否冻结参数：明确冻结。摘要即写「selection over a population of harnesses with the model frozen」；§2 首段「The base model never changes. What changes is the harness around it」，并补一句「Because the weights never move, every gain we report is a statement about the harness alone」。Appendix Table 8 逐基准列出被冻结的底座（GPT-5.5 / Opus 4.8 / GPT-5.6 Sol）。Table 7 脚注还特意指出：对比方法里只有 HarnessX 额外共训了底座（cross-harness GRPO），DarwinX 不做权重更新。
- 演化对象：harness 分两个可编辑层（§2）——skill 层（prompts、memory、distilled knowledge）与 code 层（tools、control flow、agent loop）。skill 不是独立系统，而是 harness 的一层；实验里真正长出来的东西恰好几乎全在 skill 层（TB2.1 新增 7 个 skill，Table 6；WAI 新增 4 个 browser skill + 1 条 prompt 规则改写，Table 13/14）。
- 验证信号来源：每个基准自带的 verifier，逐任务二值通过率的 avg@k。摘要原话「Fitness comes from each benchmark's own verifier: no gold solutions, no hand-picked winners」。§4 补充：循环从不消费基准的 reference solution，唯一监督是任务级 verifier 结果加 agent 自己产出的轨迹。唯一例外是 WAI 的演化阶段用 LLM judge 打分合成 intent（§6.1），但最终报告用真实任务的确定性 verifier。
- 一句话贡献：把自进化从「单血统 keep-best」改成「带准入契约的种群选择」——preserve-and-extend 契约限制一次胜利可以付出的代价，档案保留可重组的替代血统，failure / teacher / self 三类证据统一成同一个 harness 编辑接口。

## 1. 问题：单血统自改进为什么不够

作者的出发点是：近期这批工作（prompt 优化、skill 文档优化、workflow 优化，直到 SICA / DGM 这类改自己源码的系统）其实共用同一个内循环——批量 rollout、反思、提出一个受限编辑、用 held-out 或回归信号做 gate（§1）。SkillOpt（Yang et al.）把这条循环明确类比成梯度下降，HarnessX 把它形式化成强化学习的「operational mirror」。既然内循环已经收敛，真正没解决的是外面那层选择过程。

作者点了两个失效模式，全文的设计都围着它们转：

第一是路径依赖（path dependence）。单血统自编辑器被早期编辑绑定，然后停在平台期。作者直接引 SICA（Robeyns et al.）自己报告的 early-edit plateau 作为证据（§1，Table 7 里 SICA 那行也写着「the authors report an early-edit plateau」）。问题的结构是：一个 keep-best 的血统只有一条祖先链，早期某个编辑决定了后续所有编辑的上下文，于是搜索被锁进某个局部盆地，而没有任何机制可以回到分岔点。

第二是跨任务干扰（cross-task interference）。修好一族任务的编辑会静默地把另一族弄坏，于是在混合任务分布上演化会停滞。作者强调这个病症随任务分布变宽而加剧：「many prompt and tool changes win on a small subset yet lose on the full benchmark」，所以选择准则必须反映最终基准，而不是某个狭窄的局部目标（§1）。

对这两点，作者指名批评了两个最近的系统：

- HarnessX（Darwin Agent Team）的做法是隔离变体、把任务族分开，这确实抑制了干扰，但代价是把得到的专家困在各自的血统里，无法合并；Table 7 更狠地指出隔离并没有解决问题——「Isolation keeps task families apart, so sub-threshold regressions still accumulate」，即每次都低于阈值的小回退会累积。
- DGM 一次只变异一个父本、并把子本与父本比分。作者的批评有两层：一是「lineages that solve complementary tasks are never brought back together」（没有 merge 算子）；二是「a gain carries no obligation to hold what it displaces」——涨分不承担保住原有能力的义务，Table 7 里写成「Staged subsets, but no explicit preservation contract」。

DarwinX 的定位因此非常克制：档案本身不是贡献，档案是基底（substrate），贡献是档案上的选择规则——「What such systems leave unsettled is how a candidate earns its place」（§1）。

## 2. 方法详解

### 2.1 harness 的表示与档案节点结构

一次 run 维护一棵树形档案，每个节点是一个 harness 快照，外加：该节点的 edit delta、逐任务分数、trial evidence、蒸馏出的 lessons（§2）。这个结构决定了两件事：一是节点可以在很久之后被重新访问并继续扩展（「a branch can be revisited long after it was last extended」），二是 merge 时能拿到 delta 而不是整体 harness。

harness 的可编辑面是 skill 层 + code 层（§2、Table 7）：skill 层是 prompts、memory、distilled knowledge；code 层是 tools、control flow、agent loop。编辑被要求是**增量（additive）**的：「Because edits are additive, a branch accumulates capabilities rather than trading one for another, which is what makes long lineages productive rather than a sequence of lateral rewrites」（§2.2）。

### 2.2 fitness 与 preserve-and-extend 契约的准入判定

每个变体 $v$ 的逐任务分数是 $\hat p_t(v)$，即该任务上的 avg@k 通过率（binary avg@k，§2.5）。对子本 $c$ 与父本 $p$：

$$\Delta_t = \hat p_t(c) - \hat p_t(p)$$

净增益与有界回退分别定义为：

$$g(c) = \sum_t \Delta_t, \qquad R(c) = \sum_t (-\Delta_t)_+$$

其中 $(\cdot)_+$ 取正部，所以 $R(c)$ 只累加变差的部分。准入条件（作者叫 fitness enabler）是：

$$g(c) > 0 \;\wedge\; R(c) \le \delta$$

即「至少在某个任务上可测地变好，且放弃的总量不超过一个小容忍度 $\delta$」（§2.1）。

这里要说清两件容易混淆的事：

**什么算「扩展覆盖」，什么算「回归」。** 契约实际上有两套判据，一套连续、一套集合式：

- 连续判据用于准入（§2.1）：$g(c)>0$ 表示逐任务通过率的净和为正（这就是「扩展」），$R(c)\le\delta$ 表示逐任务通过率下降的总和有界（这就是「有界回归」）。注意 $R$ 是**求和**而不是取最大，所以多个小回退是会累加的——这正是作者批评 HarnessX 时说的「sub-threshold regressions still accumulate」的对症设计。
- 集合式判据用于「是否有资格被继承 / 参与重组」（§2.3）：记 $S(v)$ 为变体解出的任务集合，按 $S(c)$ 与 $S(p)$ 的关系把子本分成四类：
  - improvers：$S(c) \supsetneq S(p)$，严格扩张，保住全部继承解；
  - neutral：$S(c) = S(p)$，同样保住全部继承解；
  - stepping stones：$S(c) \subsetneq S(p)$，父本解的真子集（丢了但没换来新的）；
  - archived nodes：$S(c) \not\supseteq S(p)$ 且有得有失（拿一些解换另一些解）。
  
  前两类「stay eligible for inheritance」，后两类不合格，只把蒸馏出的 lessons 反馈回去（§2.3、Figure 3 中栏）。另外定义 specialist：任何额外解出「没有兄弟节点能解」的任务的变体。

**准入不等于可信。** 这是全文最核心的机制设计，作者称之为 two-speed / 分离 exploration 与 confirmation（§2、§2.1）。一个被推理型 verifier agent $f$ 裁决：

$$\mathrm{verdict}(c) = f(g, R, E, K_g) \in \{\text{promote}, \text{revert}\}$$

其中 $E$ 是该子本的 trial evidence，$K_g$ 是种群的共享记忆。被 promote 的子本还要在更高保真度下重测，并通过一个 preservation probe（对血统已知解出集合重新采样），才有资格成为祖先、进入 steering set、支撑最终结论（§2.1、§2.5）。作者的原话是「the enabler is permissive about trying an edit but strict about trusting it」，效果上是「探索阶段偏 recall，最终评估阶段偏 precision」（§2.2）。

选择器被刻意设计成 enabler 而不只是 critic，理由写得很直白：「A high-precision admission rule can freeze the lineage before complementary variants emerge」（§2.2）——门槛太严会在互补变体出现之前就冻死血统。

### 2.3 父本选择与血统增益

每个节点还带一个累积血统增益：

$$G(c) = G(p) + g(c)$$

下一轮父本的采样规则（§2.2）：

$$p^* \sim (1-\beta)\,\delta_{\arg\max_{v \in S} G(v)} + \beta\,\mathrm{Broaden}(P)$$

以 `$1`-\beta$ 概率利用 steering set $S$（已确认变体集合）里累积增益最高的节点，否则以 $\beta$ 概率在更大的种群 $P$ 上放宽采样。为什么按累积增益排而不是按原始分数排，作者给了具体理由：变体是在**不同任务子集**上筛选的，原始分数不可比；一个在已改进父本之上再加真实改进的子本，即使它自己那个子集更难，也应该排在根节点和父本之前（§2.2）。

### 2.4 档案维护与跨血统重组

每个被打过分的变体都作为一等档案节点保留，包括全局更差的那些。理由是明确的：「a lineage that never wins on its own may still hold the single edit that, combined with another branch's edit, unlocks a task neither solves alone」（§2.3）。并行搜索分支被分配不同的 capability cluster（TB2.1 上是：numerical ML、low-level systems、bio/assembly、parsing/text tools、database/data），从而让档案长出解集签名不同的专家。

重组（merge）的形式化定义：当变体 $v_1,\dots,v_n$ 解出互补任务时，从共同祖先 $H_0$ 出发，合并后的 harness 为

$$H = H_0 \oplus \Delta, \qquad \Delta = \Delta_{\text{code}} \oplus \Delta_{\text{skill}} \oplus \Delta_{\text{prompt}} \oplus \Delta_{\text{tool}}$$

接受条件是覆盖所有父本胜利的并集：

$$S(\text{child}) \supseteq \bigcup_i S(v_i)$$

也就是说「a merge can only add coverage」——合并只允许加覆盖，不允许拿一个换一个（§2.3、Figure 3 右栏）。合并的候选池比「打赢根节点的变体」更宽：只要某个 archived specialist 贡献了一个独有的解出任务，它就是有用的遗传材料。merge 算子可以一次合并两个以上变体，并且合并后的子本要走同一套 survival + avg@k 规则确认。

### 2.5 三类学习信号如何统一到一个编辑接口

作者强调这是一个 signal interface，不是固定的训练配方：「any evidence source that can explain how a harness should change may become evolutionary pressure」（§2.4）。当前系统装了三种原生信号：

- failure-derived（记作 $\nabla$）：汇总失败轨迹 $\tau$，定位缺失能力；
- teacher-derived（记作 $\pi^*$）：把一个 reference solver 的成功轨迹 $\tau^*$ 蒸馏成可复用的做法；
- self-derived（记作 $A$）：对比 agent 自己在同一任务上的通过与失败 rollout $\{\tau_i\}_{i=1}^k$，找出什么让成功变得可靠。

三者被映射到三类任务状态，这个划分是动态的（§2.4）：

- 普通变异默认用 failure-derived；
- walls（该任务没有任何成功的 agent rollout）用 teacher-derived 补强 analyzer；
- variance-band（同一 k 样本组里既有通过也有失败）用 self-derived 补强 analyzer。

于是「reliable solves / variance-band / walls」这个动态三分让三类信号在构造上互补，proposer 永远不会被要求盲目改进。关键点：**所有信号最终都被翻译成候选 harness 编辑，没有一个更新模型权重**（「All signals are translated into candidate harness edits; none update model weights」）。

### 2.6 共享记忆与全局主题

一个 failure-mode classifier 给每次 trial 打标签（例如 timeout-setup、wrong-output、tool-error），并在整个基准上聚合出主导主题。这些主题进入种群的共享记忆 $K_g$，每评估一个变体后更新：

$$K_{g+1} = \mathrm{Agg}(K_g, \text{worked}, \text{regressed}, \text{themes})$$

proposer 与 verifier 都读它：$c \sim \mathrm{Propose}(p^*, K_g)$，$f(g,R,E,K_g)$。注入主导主题的目的是让搜索发明**全局能力**而不是逐任务补丁，作者给的例子是「setup cost dominates timeouts → build an efficient-setup capability」（§2.6）。

### 2.7 伪代码

论文本身没有给伪代码块；以下是按 §2.1–§2.6 文字重构的循环（此处为解读者归纳，非原文算法）。

```
输入: 基座模型 M (冻结), 初始 harness H0, 任务集 T (自带 verifier), 容忍度 δ, 探索率 β
初始化: Archive A = {node(H0)}, 共享记忆 K = ∅, steering set S = {node(H0)}

for generation g = 1..G:
    # 1. 父本选择：按累积血统增益 G(v)，1-β 利用 / β 放宽
    p* ~ (1-β)·argmax_{v∈S} G(v) + β·Broaden(A)
    cluster ← 分配给该搜索分支的 capability cluster

    # 2. 选证据：按任务当前状态挑信号
    for 目标任务 t ∈ cluster 中的 fragile/failing 任务:
        if t 是 wall:            evidence ← teacher_signal(τ*)
        elif t 是 variance-band: evidence ← self_signal({τ_i})
        else:                    evidence ← failure_signal(τ)

    # 3. 提出增量编辑（skill / code 层皆可）
    c ← Propose(p*, K, evidence)        # 要求: 保住 p* 已解任务, 扩展到 t

    # 4. 筛选：轮换子集上 avg@3
    p̂_t(c) ← eval(c, 子集, k=3)
    g(c) ← Σ_t Δ_t ;  R(c) ← Σ_t (-Δ_t)_+

    # 5. 准入 = 宽松（enabler）
    if g(c) > 0 and R(c) ≤ δ and f(g, R, E, K) == promote:
        A ← A ∪ {node(c)}                 # 一切被打分的变体都留档，包括后续被判不合格的
        # 6. 确认 = 严格，只有过了才能 steer
        if avg@5_full(c) 确认 and preservation_probe(c, S(p*)) 通过:
            S ← S ∪ {node(c)}
            G(c) ← G(p*) + g(c)
    else:
        A ← A ∪ {node(c) 标记 archived/stepping-stone}   # 仅回收 distilled lessons

    # 7. 重组：找互补 specialists
    if 存在互补集合 {v_1..v_n} ⊂ A:
        H ← H0 ⊕ (Δ_code ⊕ Δ_skill ⊕ Δ_prompt ⊕ Δ_tool)
        if S(H) ⊇ ∪_i S(v_i) and 通过同一套 avg@k 确认: 接受为 inherited child
        else: revert

    # 8. 更新共享记忆与主导 failure theme
    K ← Agg(K, worked, regressed, themes)

输出: steering set 中累积增益最高、且通过完整 avg@k 确认的 harness
```

### 2.8 关键超参数

原文给出的：

- 回退容忍度 $\delta$：只给符号，**具体数值原文未给出**。
- 探索率 $\beta$：只给符号，**具体数值原文未给出**。
- 筛选 / 确认的 k：TB2.1 为 avg@3 筛选（轮换子集）+ avg@5 全套确认，报告用官方 avg@5；TerminalWorld 为 adaptive avg@k 子集；WAI 为 LLM judge 下 avg@3 筛选 + avg@5 确认（Table 8）。
- 代数 / 档案规模：WAI 那次 run 可查——gate 接受 26 次迭代、revert 36 次，档案深度到 generation 11，Figure 7a 横轴约 35 个 archive node（§6.1、Figure 7）。TB2.1 与 TerminalWorld 的代数与总 rollout 预算**原文未给出**。
- 超时策略：agent 在任务声明预算内超时算真实失败；真正的基础设施故障按评测协议单独处理（§2.5、Appendix B）。

## 3. 实验设置

作者把评估组织成五个 RQ，四个基准按「演化信号与测试之间的分离程度递增」排列（§3.1、Table 8）。这个排序本身就是论证结构：单个基准分数无法区分「学到了可迁移的 harness 行为」还是「只是拟合了自己的评估集」。

| 基准 | 冻结底座 | 演化数据 | 报告数据 | 选择信号 | 报告指标 |
| --- | --- | --- | --- | --- | --- |
| Terminal-Bench 2.1 (RQ1) | GPT-5.5（frontier 行另有 GPT-5.6 Sol / medium） | 89 个 verifier 任务 | 同样 89 个任务 | avg@3 筛 / avg@5 确认 | avg@5 |
| TerminalWorld (RQ2) | Opus 4.8（另报 GPT-5.5） | 94 个训练任务 | 41 个 held-out 任务 | adaptive avg@k 子集 | pass@1 |
| WebArena-Infinity (RQ3) | GPT-5.5 | 300 个合成 intent | 1,260 个真实任务 | LLM judge，avg@3 / avg@5 | 确定性 pass@1 |
| SWE-bench Verified (RQ4) | Opus 4.8 | 无（纯迁移目标） | 500 个 issue | 不驱动选择 | 官方 pass@1 |

四层分离的设计意图：

1. **RQ1 in-domain test-time evolution（TB2.1，89 任务）**：搜索与打分在同一套任务上，是「耦合最紧」的一档，测的是「信号与测试重合时 harness 演化最多能榨出多少」。作者对泄漏的辩护是机制性的：循环从不消费 reference solution，唯一监督是任务级 verifier 结果 + agent 自己的轨迹，所以「a harness cannot encode answers, only change how the agent works」（§4）。
2. **RQ2 held-out task generalization（TerminalWorld，94 训练 / 41 held-out）**：模态与 verifier 家族固定，只有任务实例不重叠；harness 在碰 held-out 之前就被冻结，「no held-out-task reward can influence selection」（§5）。
3. **RQ3 synthetic-to-real generalization（WAI，300 合成 intent → 1,260 真实任务）**：这是分离最宽的一档，因为**任务分布和奖励来源同时变**——演化期是 LLM judge 打合成 intent，测试期是确定性 verifier 打真实任务。作者的措辞是「Nothing the loop optimizes is the thing finally measured」（§6）。而且真实套件横跨 10 个独立应用，无法靠专精单一界面取胜。
4. **RQ4 cross-benchmark transfer（TB2.1 → SWE-V）**：最优 TB2.1 harness 原封不动跑 500 个 SWE-V issue，用官方测试 harness 评分，测终端演化出来的行为能否迁到仓库级软件工程。作者明确说**不报 in-domain SWE-V 演化**，因为该基准可用的 in-loop 信号打的是「轨迹完成度」而非官方测试是否通过，不适合作选择依据（§3.1、§7）。
5. **RQ5 ablation and mechanism**：在同一冻结 GPT-5.5 上，比较最优 TB2.1 harness 与 base Monet 的 skill-bundle diff、以及逐 cluster 增益落点，配新解出任务的 case study。作者自己限定这是 exploratory attribution，不是 per-skill 因果隔离。

Baseline 设计（§3.2）：主对比一律是 matched-model——同一冻结底座、同一任务、同一 verifier 下 base Monet 对 evolved Monet，把 harness 隔离成唯一变量。外部参照：终端基准上是中性 agent Terminus-2 与前沿 CLI（Claude Code、Codex）；WAI 上是同一 GPT-5.5 底座的原生 Browser Use harness，加上 Gemini / Qwen / Kimi 的公开数字；SWE-V 上是一个带 LSP 的 fix-skill 参考 harness。作者明说公开榜行用的模型与 effort 不同，「provide context rather than controlled comparison」，承重的是 matched-model delta。

## 4. 结果与消融

### 4.1 Terminal-Bench 2.1（Table 2）

| Agent | 模型 / effort | avg@5 |
| --- | --- | --- |
| Monet (DarwinX) | GPT-5.6 Sol / medium | 84.7 ± 1.2 |
| Claude Code | Fable 5 / xhigh | 83.8 ± 1.2 |
| Monet (DarwinX) | GPT-5.5 / high | 83.2 ± 1.2 |
| Codex | GPT-5.5 / xhigh | 83.1 ± 1.1 |
| OpenAI reference（单 agent） | GPT-5.6 Sol / medium | 81.8 |
| Terminus 2 | GPT-5.5 / xhigh | 78.0 ± 1.2 |
| Monet (base) | GPT-5.5 / default | 75.5 ± 3.5 |

关键数字：matched-model 增益是 75.5% → 83.2%（+7.7 分，GPT-5.5，严格榜规则下每个 errored trial 记零）；换更强底座 GPT-5.6 Sol / medium 达 84.7%，作者称已在 verified 榜前沿，超过当时 verified leader（Claude Code + Fable 5，83.8% at xhigh）且 effort 更低，并比 OpenAI 自家同 effort 单 agent 参考（81.8%）高 +2.9 分（§4）。相对同底座的中性 harness Terminus 2（78.0%）纯 harness 增益 +5.2 分。

**增益不是靠更多测试时算力**（§4.1，Figure 5）。两条证据：一是 effort 受控对比，Terminus-2 在 xhigh 只有 78.0%，低于 DarwinX 在 high 的 83.2%；二是额外算力的分布是定向的——在 6 个从失败翻成解出的任务上，evolved harness 的 turns 大约翻倍（22 vs. 11）、token 约四倍（380K vs. 89K）；而在双方都已解出的 69 个任务上算力几乎不动（13 vs. 12 turns，172K vs. 125K token）。

**preserve-and-extend 的经验足迹**（§4、§8.2，Figure 4）。88 个有配对测量的任务中，36 个改善、43 个不变、9 个回退；以 10 分变化为阈值则是 30 改善 vs. 6 回退。逐 cluster：ML & 科学计算 60.1% → 74.9%（+14.8），data/database 83.9% → 97.8%（+13.8），Algo/Code +7，SysAdmin +6（92% → 98%），Parsing +5，Sys/Build +2，Security -1（85% → 84%，作者称在噪声带内）。作者的解读是这种不对称正是保守化搜索的签名：在脆弱 cluster 上扩展，在已解决 cluster 上按住不动，且没有任何 cluster 回退超出噪声带。

**审计**（§4.2）。严格协议下每个 errored trial 记零；作者还跑了一个更严的诊断，把所有任务预算超时都算能力失败，得分约 82%，仍比 75.5% 的 base 高六分以上。reward-hacking 复核：370 条获奖轨迹中只有 2 条被 flag，一条 portfolio-optimization 是误报（agent 真的实现并编译了 C 扩展，verifier 在最多 8,000 资产的随机输入上对受保护 baseline 测试，无法硬编码作弊），一条 mteb-leaderboard trial 是确认的捷径——agent 研究失败后从任务自带的公开 README 里读到了含答案的字符串。作者承认这一条，但指出同一任务另外 4 个样本中有 3 个是合法解出的（其中一个还自纠了中间错误答案），所以是 per-trial 策略失误而非演化出的 exploit；剔除它影响 445 个 trial 中的 1 个。

### 4.2 TerminalWorld held-out（Table 3）

| Agent | 模型 | pass@1 |
| --- | --- | --- |
| Monet (DarwinX) | Opus 4.8 | 68.3% |
| Claude Code | Opus 4.8 | 65.9% |
| Monet (base) | Opus 4.8 | 61.0% |
| Terminus-2 | GPT-5.5 | 61.0% |
| Terminus-2 | Opus 4.8 | 58.5% |
| Monet (DarwinX) | GPT-5.5 | 56.1% |
| Codex | GPT-5.5 | 51.2% |
| Monet (base) | GPT-5.5 | 48.8% |

Opus 4.8 上 28/41 = 68.3%，是该 split 上最好结果，也高于作者评测的所有现成 agent；matched 对比是 25 → 28 个任务（+7.3 分），GPT-5.5 配对是 20 → 23。两个底座上绝对增量都是 3 个任务，作者据此说 harness 的贡献与底座强弱大体无关。全部 held-out 数字是单次尝试 pass@1，无重试、无 best-of-k。

**这一节最有价值的是 §5.1 揭露的 proxy 过拟合**：训练子集分数从 0.505 饱和到 1.000，而 held-out pass@1 只有 68.3%，两者差 31.7 分。更关键的是「最拟合 proxy 的变体不是最好的泛化者」——四个高分 specialist 在 41 个 held-out 任务上分别解出 24、25、26、27 个（子集重叠但不同），合并后的 harness 解出 28，超过任何单个 specialist（Figure 6）。作者把这条当作「为什么要留档案而不是留单一 incumbent」的直接证据。

### 4.3 WebArena-Infinity（Table 4、Table 5）

演化侧（§6.1）：合成全集上两个中间 checkpoint 得 38.4% 与 34.4%，base 为 19.7%；gate 接受 26 次迭代、revert 36 次；档案是一棵谱系树，**重组被反复尝试但每一次 merge 都被 revert**，增益全部沿一条较短的被接受主血统累积（Figure 7b：base 0.20 → selected 0.78，最佳重组 0.68 未被选中）。

报告侧（Table 4，audit-clean pass@1，1,260 真实任务）：Monet (DarwinX) 总体 93.0%，base Monet 43.5%，matched 增益 +49.5 分；同模型最强 baseline GPT-5.5 + Browser Use 是 86.1%（领先 6.9 分），最强公开 agent Gemini 3 Flash + Browser Use 是 69.3%（领先 23.7 分），Qwen 48.3%、Kimi 43.3%。逐应用增益全为正，最大的落在状态变更重的应用：Elation prescriptions +75.0（20.0 → 95.0）、Gmail +73.3（25.0 → 98.3）、Gmail accounts/contacts +70.0（21.7 → 91.7）、Xero invoicing +57.5、Superhuman +55.8、Linear +50.9、PayPal +46.4、Handshake +47.5、GitLab +34.3，而 base 本来就强的 Elation clinical records 只 +0.9（95.8 → 96.7）。

validity 审计（Table 5）：raw pass@1 53.0% → 94.4%（+41.4 pp），audit-clean 43.5% → 93.0%（+49.5 pp），invalid successes 120 → 17，confirmed invalid 率 23.5% → 1.4%，human review 5.1% → 0.1%，blocked attempt 14.3% → 0.1%。按机制分解（Figure 8）：invalid 轨迹总数 293 → 17；base 有 155 次 evaluation-plane 违规、97 次 privileged-host、26 次 exploit/提权、15 次 raw-state mutation，前三类演化后**完全消失**，残留的 17 条全是 raw-state mutation 且集中在单一应用。更严的口径（额外丢掉 Review 与未审计的成功）是 1,170/1,260 = 92.9%（base 41.9%）。

harness 层面变化（Table 13、14）：新增 4 个 contract 导向的 browser skill（web_task_contract、filtered_list_report_contract、browser_spa_state_contract、browser_config_contract）并改写 system prompt——把「只能通过 UI 交互、绝不许直接写状态」的绝对禁令换成「有界回退」：先优先真实 UI 控件，只有在有界审计证明没有可见 UI 路径能完成持久状态变更时，才允许检视 app 自有 store/reducer/公开 helper 并用应用自己的 action helper 做最小定向变更，同时仍然禁止碰 /api/state、写 local/session storage、用 seed/reset helper 或调用 state-sync 内部。收尾规则也从「UI 改完截图确认即停」变成「同时校验 app 自有状态回读与渲染 UI，并 reload 或离开再回来确认持久化」。

### 4.4 跨基准迁移（§7）

TB2.1 特化的 harness 原封不动跑 SWE-bench Verified，得 421/500 = 84.2% 官方 pass@1，比 80.8% 的 fix-skill 参考高 +3.4 分，且没有收到任何 SWE-V 反馈。

### 4.5 消融揭示了什么真正起作用（§8）

两个结论，指向的不是同一个组件：

- **skill 层面**：相对 base Monet，演化血统新增 7 个 harness skill，而且**全部属于同一族——verification / artifact-contract**（Table 6）：verifier-contract、contract-candidate（推导任务验收契约并在收尾前检查）、graded-artifact-final-check、artifact-verification-loop（校验被评分的产物并跑修-复检循环）、real-tool-artifact、tool-grounded-artifact（把输出锚定在真实工具执行而非断言/模拟结果）、security-contract-repair。作者强调「None adds domain knowledge」——没有一个是加领域知识的。增益落点与之匹配：被打开的难度是程序性的（长依赖安装、环境配置、输出校验、多步工具使用）而不是知识性的。
- **种群层面**：TerminalWorld 贡献的是另一个机制——「diversity, not a single skill」（§8.3）。单个 specialist 解 24–27 个 held-out 任务，合并后 28。也就是说 TB2.1 的增益可归因到一族 skill，而 held-out 泛化的增益要归因到档案多样性 + preservation gate 的挑选。
- WAI 作为跨模态交叉验证：新增 skill 属于同一类（状态与动作契约），confirmed-invalid 率 23.5% → 1.4%，audit-clean 涨 49.5 分。

作者反复限定：这些 skill 是共同被选出来的（co-selected），所以这是组合归因而非 per-skill 效应；archive、parent selector、recombination operator、inference effort 都没有被独立随机化（§8、§9）。

## 5. 局限与作者自述的边界

作者自述（§9）：

- **证据范围**：最强的 matched-model 证据来自 TB2.1（75.5 → 83.2%）和 WAI（43.5 → 93.0% audit-clean）；跨基准迁移只测了一个方向，且 84.2% 落在 80.8–84.2% 这个很窄的带里，所以迁移增益远小于 in-domain 增益。
- **选择的上限是提案多样性**：档案与 merge 机制能保留并组合变体，但种群搜索需要先有多样的胜利。而且「recombination 相对单血统变异的贡献仍需受控消融」——这条自述在 WAI 上尤其扎眼，因为那次 run 的每一次 merge 都被 revert 了（§6.1），也就是说该基准上的全部增益其实是单血统变异拿到的。
- **归因与测量极限**：实验评估的是完整系统；公开榜行的模型与 effort 不同；基准本身噪声大且对基础设施敏感。TerminalWorld 只有 41 个 held-out 任务，一个解出就动 2.4 分，matched Opus 对比（25/41 vs. 28/41）McNemar p=0.45，只算 suggestive。注意这里有个细节不一致：§5.1 说与最强现成 agent（Claude Code Opus 4.8）的一任务边际是 paired exact McNemar p = 1.0，§9 说与 base 的对比是 p = 0.45——两个 p 值对的是不同对比，但报告里并列时容易误读（此处原文表述容易混淆）。
- **programmatic action validity**：静态 + LLM 的审计比关键词启发式强得多，但不是形式化沙箱；高度动态构造的情况可能需要人工复核，且少量轨迹不可得。
- **frozen 是方法学控制而非主张**：Appendix E 明确说冻结底座是为了让 delta 可归因于 harness，并列了放开后的方向（与权重更新耦合、把 harness 当跨模型代际的资产、把 preservation probe 当部署不可回退的声明接口）。

关于 WAI 43.5% → 93.0% 这个巨大提升的泄漏 / 过拟合风险，作者的 audit-clean 声明具体做了这些事：

1. **演化集与评测集在构造上隔离**（Appendix D.1、Table 10）。300 个合成 intent 来自一条独立于本工作的文档接地合成流水线：LLM 只读每个应用自己的说明文档提出 intent，两个前沿模型各自提种子得 1,080 条，扩展到 11,279 条，经质量启发式（6–60 词、可执行性检查、坏短语黑名单）、Jaccard 0.70 近重复删除、TF–IDF 唯一性剪枝（丢掉 idf 最低的四分之一）留下 8,013 条，限制到有实例的 12 个应用剩 5,332 条，每应用均衡抽 25 条得 300 条。作者强调「the benchmark's own task suites are never read at any stage」，去重是池内去重而非对测试任务去重。
2. **应用覆盖也部分不重叠**：报告的 10 个应用里 9 个有合成对应，Gmail（1,260 个真实任务中的 60 个）**完全没有**合成对应，演化期从未以任何形式见过；反过来合成集里有 3 个应用（Elation patient communication、Figma slides、Figma text and typography）根本不在报告套件里。
3. **奖励来源也换了**：演化期是 LLM judge 打合成轨迹，测试期是确定性 verifier。
4. **两阶段反作弊检测**（§6.3、Appendix D.2）。Stage 1 是接地静态分析器：反混淆 JavaScript、发现每个应用被评分的字段与语义 mutator、对源自被评分集合的对象做污点追踪、检测 host / evaluation-plane / 数据库 / exploit 访问，打 Valid / Invalid / Invalid-Attempted / Review 四类标签。Stage 2 把被 flag 的轨迹交给独立的 Opus 4.8 judge 用同一 rubric 复判，分歧留人工。覆盖率 base 99.0%、evolved 99.4%。合法性判据写得很细：任务相关知识必须来自客户端可达的应用表面（UI/DOM、前端资产、浏览器运行时状态、正常网络流量、当前用户会话下可用的应用 API），每个被评分的状态变更必须在同一权限下由 UI 动作、产品 API 或应用自定义的、保留业务逻辑的语义 mutator 造成；拒绝五类机制：特权主机知识、evaluation-plane 访问、raw-state/storage 伪造、直接改数据库、exploit/提权/改基准。Table 11 还列了 base Monet 就有的 regex 触线（/api/state、_pushStateToServer / getSerializableState / resetToSeedData / __APP_STATE__ / window.state=、localStorage/sessionStorage 的 setItem/removeItem/clear）。
5. **口径对自己不利**：只有作者自己的轨迹过审计，被判 Invalid 的成功一律记失败；公开数字照发不做等价筛查，所以 23.7 分的领先是在这种不对称下测出的（Appendix D.3）。

我认为仍然存在、而作者没有充分处理的问题：

- **base 43.5% 这个起点本身可疑**。base Monet 在 Elation prescriptions 上只有 20.0%、Gmail 25.0%、Gmail accounts/contacts 21.7%，而同底座的 Browser Use 分别是 90.8 / 85.0 / 87.5。也就是说 base Monet 在这些应用上是一个明显失配的 harness（它原本是编码 agent，被临时接到浏览器上，§6.1），它的失败很大一部分是被 regex 触线挡住后无路可走（audit 显示 base 有 14.3% 的 blocked attempt）。+49.5 分里有多少是「演化」、多少是「把一个明显没适配的 harness 补到及格线」，原文没有拆开。更公允的同模型对照是 86.1% → 93.0%（+6.9 分），量级和 TB2.1 的 +7.7 分接近。
- **prompt 改动放宽了合法性边界，而合法性由作者自己定义的 rubric 判定**。演化后的 prompt 从「绝不直接写状态」变成「有界情况下可以走 app 自有 action helper」（Table 14），而 rubric 恰好把「app-defined semantic mutator」列为 VALID_INTERNAL_APP_COMMAND（Table 12）。这不是作弊，但确实意味着**演化在优化的部分内容是「更贴着规则边界走」**，而这条边界由同一批作者划定。残留的 17 条 invalid 全是 raw-state mutation，正好落在这条边界的另一侧，说明系统确实在这条线上反复试探。
- **held-out 与真实套件的 verifier 强度不对称未被讨论**。WAI 真实任务的确定性 verifier 检查的是「被评分字段的最终状态」，而演化出的 skill 恰好就是「推导契约 → 校验被评分状态与持久化」。这在语义上是正当的能力，但也是对「verifier 检查什么」的高度定向拟合；一旦 verifier 检查的东西换了（比如检查过程而非终态），这套 skill 的收益未必保留。原文未给出这方面证据。
- **TB2.1 是 in-domain 演化并直接提交榜单**。作者用「循环不读 reference solution」来防守，这挡住了答案泄漏，但挡不住对同一 89 任务分布的过拟合；TerminalWorld 那个 31.7 分的 proxy-held-out gap 恰好说明这种过拟合在本方法里是真实存在且很大的。83.2% 应当被读作 in-domain 上界而非泛化能力。
- **档案与重组的净贡献没有被证明**。WAI 全部 merge 被 revert；TerminalWorld 的 merge 有效但那里又有一条 Appendix C 的自述：「a separately skill-bundled pre-TW reference also reaches 28/41」——即一个没经过 TW 搜索的参考 harness 也能拿 28/41。作者自己据此把 TW 的结论范围缩到「多样档案 + 保守选择能恢复出一个打败所有现成 agent 的 harness」，而不是「TW 特定搜索能抬高任意起点」。这实际上削弱了 merge 是关键组件的论断。

## 6. 对「冻结参数 skill / harness 自进化」这条线的意义

放到这批工作的坐标系里，DarwinX 的位置可以用三个轴定位。

**轴一：编辑什么。** DIVE、MetaSkill-Evolve 这类工作把可学习对象收窄到 skill 库 / skill 文档，好处是编辑面小、可读、可迁移，坏处是 tools 和 control flow 留在搜索之外——这正是本文对 SkillOpt 一类工作的批评（§10：「the harness itself, its tools, control flow, and implementation, stays outside the search」）。DGM / SICA 走另一极端，编辑整个 agent 源码，搜索空间大但每次编辑的语义不可控。DarwinX 取中间：显式定义 harness 为 skill 层 + code 层两层，两层都可编辑，但编辑被要求增量。有意思的是**实证结果偏向 skill 层**——TB2.1 的 7 个新增物、WAI 的 4 个新增物全部是 skill 加 prompt 规则（Table 6、13、14），没有一个被作者作为亮点展示的 code 层改动。对只关心 skill 演化的读者，这是个有分量的旁证：即使把 code 层放开，选择压力实际落在 skill 层。

**轴二：怎么选。** 这是 DarwinX 相对 HSI（分层自改进）、MGM（Mendel Gödel Machine）这批同期工作的真正差异点，也是它自认的贡献所在。HSI 类工作的重点是把改进分层组织，MGM 类是把遗传学隐喻（交叉/重组）带进 agent 演化。DarwinX 的独特之处是把**准入判据本身**做成了带两个阈值的契约：$g>0$ 且 $R\le\delta$ 决定「能不能进树」，avg@k 重测 + preservation probe 决定「能不能引导搜索和支撑结论」。相比 DGM「子本对父本比分」的单一判据，这里把「探索的宽容」和「结论的严格」分开成两个不同强度的证据要求。§10 结尾把这条讲得最清楚：DarwinX 不降低 agent 评测的噪声，而是**校准每个决策需要多少证据**。对任何做冻结参数 skill 演化的人来说，这是可以直接搬走的设计——不管你演化的是 skill 文档还是 harness。

**轴三：fitness 从哪来。** 这一批工作的共同软肋是 fitness 信号。经典 quality-diversity / open-ended 搜索假设确定性 fitness，而 agentic 基准返回的是随机 fitness（§10 引 Bjarnason et al.：SWE-bench Verified 上 pass@1 有 2.2–6.0 分的波动，常常就是一次被接受编辑的量级）。DarwinX 的立场是彻底不引入 LLM 自评作为选择依据——fitness 一律来自基准自带 verifier 的 avg@k，没有 gold solution、没有人工挑 winner。这与「自撰验证不可靠」、「自偏好偏差」那条安全线上的结论是一致的：能用外部 verifier 就不要用自评。注意 WAI 演化期用了 LLM judge，这是本文唯一的妥协，但它把 LLM judge 严格限制在「合成 intent 的筛选信号」，最终报告仍走确定性 verifier，等于把 judge 的偏差风险转移成一个可被最终指标检验的 proxy 风险——而 §5.1 的 31.7 分 gap 显示这个 proxy 风险是真实的。

还有一条 Appendix E 提出、值得单列的观点：**可审计性是基底的属性，不是方法的功劳**。harness 编辑是人可读的，权重更新不是；每次 promotion 都留下一个 reviewer 能读的 diff，旁边还有支撑它的证据（Table 13/14 就是 WAI run 的这份记录）。作者说这是「weight-space self-improvement gives up」的东西。这句话给「冻结参数只演化 skill」这条路线提供了一个非性能的正当理由——如果自进化系统要走向部署，「改了什么、为什么改」必须能在没有可解释性工具的情况下回答。

另一条是把 preservation 读作策略接口：bounded regression 本是优化装置，但读成安全属性就是「对既有正确行为的回退上限」，而 probe set 决定保护什么。probe set 不必是基准任务，可以是合规探针——把运营方的要求变成选择约束而不是事后过滤。WAI 是部分实例（合规与能力联合打分且同时改善），一般版本作者承认未测。

## 7. 可复用的工程要点

1. **把准入拆成两个不同强度的门。** 宽门（$g>0$ 且 $R\le\delta$，低 k 筛选）决定候选能否进档案；严门（全量 avg@k + 对已知解出集合的重采样 probe）决定它能否成为父本、能否进最终报告。只有一个门时，门松了会累积噪声胜利，门严了会在互补变体出现前冻死血统。这条与你演化的是 skill 文档还是完整 harness 无关。
2. **回退量用求和而不是取最大。** $R(c)=\sum_t(-\Delta_t)_+$ 是本文对 HarnessX「sub-threshold regressions still accumulate」这一批评的直接对症设计。用「最大单任务回退 < 阈值」做 gate，会放过一大批每项都只掉一点、总量却很大的编辑。
3. **按任务当前状态选证据类型，而不是固定一种反思模板。** 把任务动态分成 reliable solves / variance-band / walls：walls 用 teacher 轨迹（因为自己没有成功样本可对比），variance-band 用自身通过/失败 rollout 对比（因为不稳定的原因通常在轨迹差异里），其余用失败诊断。三者输出统一成同一个编辑接口。这条在只有 skill 库的系统上同样可实现，成本只是给任务打个状态标签。
4. **父本按累积血统增益排序，而不是按当前分数。** 因为候选是在不同任务子集上筛的，原始分数不可比；累积增益让「在已改进父本之上再加改进」的节点自然胜出，避免每轮从 baseline 重启。配一个 $\beta$ 概率的 broaden 分支防止过早收敛。
5. **失败模式做全局聚合，把主导主题注入 proposer。** 单条失败诊断会生成逐任务补丁；跨基准聚合出的主导主题（例如「setup 成本主导超时」）才会催生通用能力（「建一个高效 setup 能力」）。共享记忆 $K_g$ 同时喂给 proposer 与 verifier，二者对「什么是系统性瓶颈」的判断才一致。
6. **在能作弊的动作空间里，把合法性做成与能力并列的评分维度。** WAI 的做法值得照抄：先写死 rubric（哪些知识来源合法、哪些状态变更路径合法），再上静态污点分析 + 独立模型复判 + 人工兜底，最后报告口径把 Invalid 的成功记为失败。本文的正面结果是能力与合规同时改善（invalid 293 → 17），机制上的解释是保守化选择只在候选的胜利能通过重复验证时才给分，这天然惩罚脆弱的 verifier-gaming。
7. **别只看 in-loop proxy 分数。** 训练子集从 0.505 饱和到 1.000 而 held-out 只有 68.3%，且最拟合 proxy 的变体不是最好的泛化者。实践含义：保留多个高分变体而不是只留 incumbent，并在最后用 held-out 挑（或合并）它们——本文 28/41 就是合并 4 个 specialist 得到的，超过任何单个（24/25/26/27）。

