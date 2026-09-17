# Mendel Gödel Machine：从档案里榨出比较信号

> 权重不动，只改 agent scaffold；把档案里已有的跨任务、跨血统轨迹变成两个新的自修改算子。

## 速览

- **arXiv / 日期 / 机构**：arXiv:2608.07645v1 [cs.AI]，2026 年 8 月 7 日（原文第 58 行标注）。作者 Changzhi Liu（电子科技大学）、Yilun Liu、Sikuan Yan、Volker Tresp、Yunpu Ma（LMU Munich + Munich Center for Machine Learning）；Changzhi Liu 与 Yilun Liu 为共同一作。Project page https://reallcz.github.io/MGM/ ，代码 https://github.com/RealLcz/MGM 。
- **是否冻结参数**：冻结，但论文没有像 DarwinX / HSI 那样把「frozen」当作口号来强调。最直接的依据在 §5.2 开头：「Since MGM modifies the agent scaffold rather than the parameters of the underlying LLM, a successful evolution method should ideally discover reusable workflow-level improvements that transfer across both benchmarks and backbone models」。跨模型迁移实验进一步给出操作层面的证据：「we freeze the evolved scaffold and replace only the inference backbone with DeepSeek-V4-Flash and DeepSeek-V4-Pro」（§5.2）。全文没有任何梯度更新、蒸馏、适配器训练；Qwen3.6-35B-A3B 用 vLLM 起 OpenAI 兼容接口做纯推理（§C.1）。Figure 2 的标题也把 MGM 归到「Self-improving」这一类而非重训模型。
- **演化对象**：可执行的 coding agent 源码及其 scaffolding，被定义为 genotype。原文 §2：「We denote an executable coding agent $a \in \mathcal{A}$, together with its auxiliary scaffolding, as the genotype that self-improvement seeks to evolve.」具体被改的东西从附录 H 的 diff 可以看清楚：`coding_agent.py` 里的 prompt 指令段（`inspection_directive`）、`forward()` 的控制流（单轮 → 两阶段 → 加测试驱动修复循环）、新增方法（`run_tests()`、`extract_json_from_response()`）、新增工具文件（`utils/test_utils.py`）、以及围绕 editor 工具注册的 callback 与 diff 最小化过滤器（§H.2）。也就是说 prompt、control flow、tools 三层都在可编辑面内。
- **验证信号来自哪里**：benchmark 自带的任务判定，返回二值结果 $r(a,\tau) \in \{0,1\}$（§2 式 1–2）。关键约束在 §5 首段：「In all experiments, agents are not given access to private test cases or test results during evolution.」注意这里有一个细微张力：演化出来的最好 agent 恰恰在做「跑测试、读测试输出、迭代修复」（§H.1 的 node #16），说明 agent 可以在任务内跑仓库里公开的测试，只是不能拿到用于打分的私有测试。（此处原文表述稍模糊，两处口径需要靠附录 H 才能对齐。）
- **一句话贡献**：前人把不断膨胀的 archive 只当成采样用的 leaderboard，每次自修改仍然只喂一条失败轨迹；MGM 指出档案里天然存在两类比较信号（同一 agent 跨任务、同一任务跨血统），并把它们做成两个不额外消耗评测预算的自修改算子。

## 1. 问题：单轨迹自修改浪费了什么

MGM 的靶子非常明确，Introduction 第二段就把话说死了：「progress so far has focused on improving the archive that stores generated agents and evaluated traces, and on the process that samples which agent to evaluate or edit next. The self-modification process, during which the agent edits its own source code, has remained essentially underexplored: each self-modification step is conditioned only on one agent's single trajectory (typically a recent failure) on one task.」并直接批评档案「is used only as a leaderboard for sampling」。

放到形式化里看更清楚。自修改被写成

$$a' \leftarrow \Phi(a, E), \qquad E \subseteq \{(\varphi(a,\tau), r(a,\tau))\}$$

DGM 与 HGM 的贡献都在「$\Phi$ 之外」：DGM 维护档案树，HGM 把它变成固定预算的树搜索并用 Thompson sampling（§2 式 5、式 7，节点级与 clade 级 Beta 后验）决定下一步是评测还是扩展。但 $E$ 的构造方式一直是 $|E| = 1$：一条失败轨迹。

「比较信号」在这篇里有精确定义，指的是**在档案里已经付过评测代价、但从未被送进编辑器的对照结构**。具体两类：

1. **反应规范（reaction norm）**。借自 Woltereck (1909) 与 Pigliucci (2001)：一个基因型在不同环境下表达出的表型剖面。原文：「when an agent is evaluated across multiple tasks, the pattern of its successes and failures forms a reaction norm: a stable, genotype-specific profile of how performance varies across environments. Recurring failure modes can more plausibly distinct genotype-level defects from task-specific accidents.」（§1；这句 "distinct" 应为 "distinguish"，原文有笔误。）单条轨迹的根本问题是**无法区分「scaffold 的通病」与「这道题的偶然」**，而同一 agent 的多条轨迹提供了这个区分。
2. **同任务跨血统对照**。「when multiple agents have attempted the same task, their trajectories reveal transferable behavioral traits. Conditioning edits on these contrastive evidence enables targeted ability transfer across lineages and reduce redundant exploration.」（§1）单血统的问题是：血统 A 已经摸索出来的能力，血统 B 还得从零试一遍；档案里明明存着 A 在同一道题上成功的轨迹，却没人拿它当参照。

两点都强调一件事：**这些轨迹是常规档案评测的副产品，用它们不花额外预算**。原文反复申明：「All strategies directly operate on trajectories accumulated during routine archive evaluation and therefore incur no extra task evaluations.」（§1）这是 MGM 的省钱主张，也是它跟 HGM 在同预算下可比的前提。

## 2. 三种自修改算子

MGM 把 HGM/DGM 的单一 $\Phi$ 拆成 $\{\Phi_{CM}, \Phi_{RM}, \Phi_{CH}\}$，选择/评测/扩展的外层框架完全沿用 HGM。

### 2.1 Clonal mutation $\Phi_{CM}$（baseline 算子，被保留为兜底）

- 触发条件：$F_i \neq \emptyset$，即所选节点至少有一个失败任务。
- 证据：$E_{CM}(i,\tau) = \{(\varphi(a_i,\tau), r(a_i,\tau))\}$（式 8），单条失败轨迹。
- 编辑器被要求做什么：「The editor diagnoses the failure and modifies $a_i$ to avoid similar failures in future tasks」（§3.1）。
- 定位：「It is used when MGM has only one informative failure or cannot construct a reliable comparison... ensures that the search can proceed even when the archive is still small.」实验里它的采样权重被压得很低，$\lambda_{CM} = 0.10$（Table 6）。

### 2.2 Reaction-norm mutation $\Phi_{RM}$（同一 agent，多任务轨迹同时进 prompt）

- 触发条件：$|S_i| \ge m_{RM}$（式 10，实验中 $m_{RM} = 2$，Table 6），且存在两条不同任务的轨迹、其中至少一条是失败。目标任务 $\tau_t$ 必须是失败任务，参照任务 $\tau_r$ 是 $S_i$ 里的任意另一条，「preferably a failed one if available」（§3.1）。
- 证据：$E_{RM}(a_i, \tau_t, \tau_r) = \{(\varphi(a_i,\tau_t), r(a_i,\tau_t)), (\varphi(a_i,\tau_r), r(a_i,\tau_r))\}$（式 11）。注意参照轨迹可以是成功的，此时对照是「成功/失败在同一基因型上的差异」。
- 编辑器被要求做什么：「the agent is asked to identify a recurring or contrastive behavioral pattern shared by the provided trajectories and to implement a general improvement」（§3.1）。这句是 $\Phi_{RM}$ 的全部指令语义——先找**共同模式**，再做**通用改动**，而不是修某道题。
- 编辑粒度：原文只在附录 H 用实例说明，是 workflow 级。Polyglot 最优 agent 的 node #9（reaction-norm mutation）直接「replaces the single-turn workflow with a two-phase pipeline」——Phase 1 抽 `contract_plan` JSON（精确类签名、构造函数、方法定义、verbatim 错误消息），Phase 2 严格按 plan 实现并做 checklist 自审；node #16（也是 reaction-norm）再加一个最多五轮的测试驱动修复循环（§H.1）。可见 $\Phi_{RM}$ 落地时改的是 `forward()` 的整体结构，不是局部补丁。

### 2.3 Cross-lineage hybridization $\Phi_{CH}$（同一任务，另一血统的参考 agent 轨迹）

- 触发条件（式 13）：$\exists j \neq i, \exists \tau_t \in S_i \cap S_j$ 使得 $\lnot(r(a_i,\tau_t)=1 \wedge r(a_j,\tau_t)=1)$。即两个血统跑过同一道题且**没有双双做对**（双双做对提供不了对照）。
- 证据：$E_{CH}(a_t, a_r, \tau_t) = \{(\varphi(a_t,\tau_t), r(a_t,\tau_t)), (\varphi(a_r,\tau_t), r(a_r,\tau_t))\}$（式 14）。
- 方向性规则（§3.2 与附录 A.2 讲得比正文细）：$\pi$ 选出的节点只是**锚点**，不一定是被编辑的对象。若两者中恰好一个解出该任务，则失败的那个作为 primary agent $a_p$ 被编辑，成功的那个作为 context donor $a_q$，子节点挂在失败血统下（式 29）。原文说明了意图：「the goal is not to further edit the already successful lineage, but to let the failing lineage inherit a transferable behavior observed in the successful trajectory.」若两者都失败，则用 utility 更高的血统作 primary，另一条作 contrastive context，用来「diagnose complementary failure modes」。
- 编辑器被要求做什么，以及**不做什么**：「MGM does not splice source files from one agent into another. Instead, it asks the target agent itself to extract a transferable behavioral trait from the reference trajectory and adapt that trait to the target agent's own codebase.」（§3.1）这一句很重要——名字叫 hybridization，实现上却没有任何基因重组/代码拼接，它是一次**以另一条轨迹为参照的诊断式重写**。
- 编辑粒度实例：Polyglot 最优血统的第一步 node #2 就是 $\Phi_{CH}$ 产物，加的是一段 read-first prompt 指令，要求先用 editor 工具看 stub、测试、类层次，只实现仓库里已定义的接口（§H.1，对应 §H 的 diff：新增 `inspection_directive` 字符串块拼进 instruction）。所以 $\Phi_{CH}$ 落地时可以只改 prompt。

### 2.4 配套：失败任务池与算子采样

- 失败池 $P_t = \bigcup_{i \in V_t} F_i$（式 16），存所有曾暴露失败的任务。给新任务采样加权（式 17）：$\tau \in P_t$ 权重 $\beta_{fail}$，否则 1。实验中 $\beta_{fail}=1.0$（Table 6），也就是**主实验里这个 boost 实际上是关掉的**（此处原文未讨论，Table 6 的取值与 §3.2 强调的「concentrates evaluation on tasks that are known to reveal weaknesses」在效果上不一致，值得注意）。
- 失败池的第二个作用写得很清楚：「It also deliberately creates overlap across lineages. Since $\Phi_{CH}$ requires agents to have attempted a shared task, the pool increases the availability of controlled cross-lineage comparisons without spending additional evaluation budget.」这是把「制造可比性」当成一个调度目标。
- 算子采样（式 18）：$\Pr(\sigma|i) = \lambda_\sigma / \sum_{\sigma' \in \Omega_i} \lambda_{\sigma'}$，$\lambda_{CM}=0.10$、$\lambda_{RM}=0.45$、$\lambda_{CH}=0.45$（Table 6）。$\Omega_i = \emptyset$ 时跳过扩展、改做一次评测。
- 伪代码见 Algorithm 1（§A.1）。注意第 12–13 行：只有 `c.is_valid()` 的子 agent 才入档案；无效子代被丢弃且 else 分支落回评测。

### 2.5 孟德尔类比：指导设计还是只是命名

我的判断是**介于两者之间，偏向「真的提供了一个有用的设计切分，但生物学机制并未被真正搬过来」**。

支持「真指导」的一面：整套算子设计确实来自一个可辨识的方法论——受控比较。原文的说法是「Analogous to Mendelian genetics, which seeks to isolate heritable effects through controlled comparisons, we design self-modification operators as diagnostic processes」（§3.1）。两个新算子恰好对应两种正交的「控制变量」：$\Phi_{RM}$ 固定基因型、变环境；$\Phi_{CH}$ 固定环境、变基因型。这个 2×2 的切分不是事后贴标签，它直接决定了触发条件、证据集合、以及理论分析里候选集怎么收缩（§4.2）。reaction norm 也是有出处的真实概念（Woltereck 1909），不是生造词。

支持「主要是命名」的一面：

- hybridization 在生物学里是两套基因组重组，MGM 明确否认代码拼接（§3.1），实际是「单亲编辑 + 另一亲当参照」。这在遗传学上更接近「看着邻居长得好，自己改自己」，不是杂交。
- 没有任何等位基因、显隐性、分离定律、自由组合定律的对应物。Mendel 这个名字承载的只是「controlled comparison」这一句方法论口号。
- 理论分析里真正起作用的量是候选集大小与真缺陷密度（式 33、式 42、式 49），是信息论/诊断学的语言，不需要遗传学。
- Algorithm 1 的输入参数写作 $\lambda_A, \lambda_B, \lambda_C$，正文却是 $\lambda_{CM}, \lambda_{RM}, \lambda_{CH}$，说明命名层在后期才统一，机制层先于命名存在。

结论：如果把这篇论文里所有生物学词汇替换成「跨任务证据算子」「跨血统对照算子」，方法与结论一字不改。类比提供的是**分类框架和叙事**，不是约束。

## 3. 理论分析

### 3.1 加性 fitness 景观的设定（§4.1）

- 基因型 $g \in \{0,1\}^L$，每个 locus 对应「一个最小的 scaffold 级能力或实现选择」。oracle 记作 $g^\star = \mathbf{1}$。
- 进步度量是到 oracle 的 Hamming 距离 $d(g) = \sum_{\ell=1}^{L} \mathbb{1}[g_\ell \neq g^\star_\ell]$（式 20），$d=0$ 当且仅当 $g=g^\star$，作为零误差下界。每次运行从 $d_0$ 个错位 locus 开始。
- 任务 $\tau$ 检查一个子集 $R_\tau \subseteq [L]$，$|R_\tau| = k$；**全对才算解出**：$r(a,\tau)=1 \iff R_\tau \cap M(a) = \emptyset$，其中 $M(a)=\{\ell: g_\ell(a) \neq g^\star_\ell\}$（式 21–22）。
- 于是距离 $d$ 处的单任务成功率为 $P(r=1\mid d) = \left(\frac{L-d}{L}\right)^k$（式 23）。作者的现实映射：「This models coding tasks as requiring multiple scaffold-level capabilities to be simultaneously correct, such as localization, reasoning, editing, and validation.」
- 参数：$L=100$、$k=5$、任务池 $N=200$、$d_0 \in \{10,20,40,80\}$（Table 5）。

注意「加性」在这里的含义比较弱：fitness 是按 locus 计数的（加性），但任务成功是 AND 门（合取），所以表型层面是强非线性的。真正的加性假设是**每个 locus 的正确性独立可修，且修好一个不会破坏其他 locus 的语义**（破坏只以固定概率 $p_b=0.05$ 出现，Table 5）。

### 3.2 命题与证明思路（§4.2 与 §B.1）

核心抽象：自修改算子看不到隐藏的错误 locus，只能根据证据 $E$ 构造一个隐式候选集 $C_\sigma(E) \subseteq [L]$，然后尝试修其中一个。若命中真错误 locus，以概率 $s \in (0,1]$ 修好。有效修复概率

$$p_f^\sigma = s \cdot \Pr_{\ell \sim C_\sigma(E)}[\ell \in M(a)]$$

（式 24 / 式 33）。一切归结为：**候选集里真缺陷的密度**。

**Proposition 1**：在上述模型与 sound comparative evidence 下，$p_f^{RM} > p_f^{CM}$ 且 $p_f^{CH} > p_f^{CM}$（式 25）。

证明思路（§B.1）：

- $\Phi_{CM}$：单条失败轨迹只能推出 $R_{\tau_t} \cap M(a) \neq \emptyset$，自然候选集 $C_{CM} = R_{\tau_t}$。令 $c = |R_{\tau_t} \cap M(a)|$，则 $p_f^{CM} = s\,c/k$（式 36）；稀疏缺陷情形 $c=1$ 给出 $p_f^{CM} = s/k$（式 37）。
- $\Phi_{RM}$：假设两次失败共享一个复发因果缺陷 $b \in M(a)$，故 $b \in R_{\tau_t} \cap R_{\tau_r}$（式 38），候选集压到 $C_{RM} = R_{\tau_t} \cap R_{\tau_r}$。设两任务其余 $k-1$ 个 locus 从 $[L]\setminus\{b\}$ 独立采样，则

$$\mathbb{E}[|C_{RM}|] = 1 + \frac{(k-1)^2}{L-1} < k \quad (L > k)$$

（式 40–41）。由于 $b$ 必在交集内，稀疏缺陷情形下

$$p_f^{RM} \ge s \cdot \frac{1}{1 + \frac{(k-1)^2}{L-1}} > \frac{s}{k} = p_f^{CM}$$

（式 42）。代入 $L=100, k=5$：$\mathbb{E}[|C_{RM}|] = 1+16/99 \approx 1.16$，对比 $k=5$，候选集缩小约 4.3 倍。
- $\Phi_{CH}$：目标失败 $R_\tau \cap M(a_t) \neq \emptyset$，参考成功 $R_\tau \cap M(a_r) = \emptyset$（式 44–45），参考轨迹充当对照，把「与任务相关但非致因」的 locus 过滤掉。令 $C_{CH} = (R_\tau \cap M(a_t)) \cup N$，$h=|N|$ 是过滤后残留的非因果差异，则 $p_f^{CH} = s\,c/(c+h)$（式 49）。只要对照至少去掉一个无关候选，$c+h<k$（式 50），即得 $p_f^{CH} > p_f^{CM}$（式 51）。

一句话总结作者自己的解读：「comparative evidence improves self-modification not by making the editor intrinsically stronger, but by reducing diagnostic uncertainty: the editor searches over a smaller and cleaner set of candidate defects.」（§4.2）

### 3.3 适用条件（§B.1 "Discussion of assumptions"，作者自己列了四条）

1. 失败由**相对稀疏的因果缺陷**引起，否则缩小候选集不会显著提升真缺陷密度。
2. $\Phi_{RM}$ 只有在被比较的轨迹**共享一个复发的基因型级弱点**时才最有效。
3. $\Phi_{CH}$ 需要一条**信息量足够的参考轨迹**充当有用对照。
4. 编辑器必须**有能力利用**比较证据。

作者明说：「When these assumptions fail, the comparative operators may provide little or no fix-quality advantage; this case is explicitly represented in our simulation by the null setting $\rho = 1$.」这个自我设限比较诚实——命题不是无条件的，$\rho=1$ 就是它的反例通道。

### 3.4 受控代理仿真如何验证（§4.3）

把定理里的诊断优势参数化为一个可控比值

$$\rho = \frac{p_f^{RM}}{p_f^{CM}} = \frac{p_f^{CH}}{p_f^{CM}}$$

（式 26），$\rho=1$ 为 null，$\rho>1$ 表示不同程度的诊断压缩。$\rho \in \{1.0, 1.2, 1.5, 2.0\}$，主仿真取 $\rho=2.0$；$p_f^{CM}=0.25$，所有算子破坏概率 $p_b=0.05$（Table 5）。

三个方法的差异被刻意收缩到两条轴：**预算分配**与**算子集合**。DGM 每代给每个种群成员固定 $n_{eval}=10$ 次评测、种群 5、选择比例 0.4；HGM 自适应分配（$n_{min}=3$、$n_{max}=20$、失败阈值 $\tau_{edit}=0.5$）；MGM 用同一套评测-扩展框架，只是在条件满足时额外用 $\Phi_{RM}$（$\pi_{RM}=0.45$）与 $\Phi_{CH}$（$\pi_{CH}=0.45$）。为了不让计算量成为混淆变量，所有编辑成本被设为与一次评测相同：$c_{CM}=c_{RM}=c_{CH}=c_\varphi=1.0$（式 27，Table 5）。总预算 $B=500$，$n_{seeds}=100$，记录活跃节点的最小编辑距离，报 mean ± 95% CI。

结果（Figure 4、Figure 5）：在所有 $d_0$ 与所有 $\rho>1.0$ 的格点上，MGM 在最终性能与收敛速度上都优于 DGM/HGM；$\rho=1$ 时「MGM collapses back to HGM-like behavior」，作者据此论证「the simulated gain is caused directly by the diagnostic-quality advantage formalized in Proposition 1」。趋势上：$\rho$ 越大优势越大，且**在较小 $d_0$ 时更明显**——作者解释为此时需要的修复次数少而精，诊断质量的价值被放大（§4.3 末）。Figure 5 报最终性能分布，MGM 均值最低、离散度最小。

## 4. 实验设置

- **基准**：SWE-bench Verified、SWE-bench Pro、SWE-bench Multilingual、Polyglot。主实验用与 DGM/HGM 相同的两个 60 题子集（SWE-bench Verified-60、Polyglot-60），「the same two 60-task subsets... as Wang et al. (2026) and Zhang et al. (2026a)」（§5）。SWE-bench Pro 与 Multilingual 的 60 题子集用 ChatGPT 随机抽取并要求覆盖全部语言，题目 ID 全部列在附录 D。
- **底座模型**：Qwen3.6-35B-A3B（主）。迁移实验用 DeepSeek-V4-Flash / DeepSeek-V4-Pro。附加实验用 Qwen3-Coder-Next-80B-A3B（§F.2）。
- **推理配置**（§C.1）：8×H100（80GB）、约 2TB 主机内存；vLLM tensor parallel，max context 262,144，GPU 利用率 92%；Qwen 开 thinking，temperature 1.0、top-p 0.95、top-k 20，不设 reasoning-effort 或 thinking token 预算；DeepSeek-V4 用非 thinking 模式、API 默认 temperature/top-p 1.0；两家都关闭 parallel tool calls。任务在 Apptainer 容器内跑（Python 3.10 基础镜像，仓库 bind-mount），默认关闭 host networking。
- **baseline**：HGM（Wang et al., 2026）为主对比；DGM 只在仿真里出现，真实实验没有 DGM 数字。
- **预算与档案规模**：200 次 $\varphi$-evaluation 与 24 次 $\Phi$-expansion（Table 1 与 Table 7 标题）。因此档案树是 25 个节点（root + 24），Figure 8 四张演化树都是 24 nodes。消融实验同预算，并开两个并行 worker（§5.3）。
- **超参**：$\beta_{fail}=1.0$、$\lambda_{CM}=0.10$、$\lambda_{RM}=0.45$、$\lambda_{CH}=0.45$、$m_{RM}=2$（Table 6）。
- **选取最终 agent 的方式**：报「best-belief agent」（§5.1）。附录 E.2 说明这不是取最高 utility：MGM 树里 node #20 与 #23 的 utility 都是 1.00，但只评过 15 次和 4 次，最终选的是 utility 0.91、评过 35 次的 node #16；HGM 里 node #24 utility 1.00 但只评过 5 次，最终选 utility 0.71、评过 14 次的 node #18。这是一个「高置信度优先于高均值」的选择规则。
- **随机性**：真实实验**未报告多 seed**，作者在 Limitations 中承认这一点。

## 5. 结果与消融

### 5.1 主结果（Table 1，Qwen3.6-35B-A3B，200 evals + 24 expansions）

| 基准 | Initial | HGM | MGM |
|---|---|---|---|
| SWE-bench Verified-60 | 68.3 | 73.3 (+5.0) | 78.3 (+10.0) |
| Polyglot-60 | 50.8 | 77.9 (+27.1) | 93.2 (+42.4) |
| 平均 | 59.6 | 75.6 (+16.0) | 85.8 (+26.2) |
| wall-clock（平均） | – | 68.61 h | 68.12 h |

MGM 相对 HGM 的净增益：SWE-bench Verified-60 上 +5.0 点，Polyglot-60 上 +15.3 点。时间几乎相同（Polyglot 上 MGM 40.14 h 反而略快于 HGM 44.20 h；SWE-bench 上 96.11 h 略慢于 93.02 h）。作者强调预算完全对齐：「Since both methods use exactly the same number of evaluation and expansion operations, this performance gap cannot be attributed to a larger search budget.」此外 Figure 6 显示 $\varphi$-evaluation、CM、RM、CH 各类操作的 token 消耗分布处于同一数量级，「the observed performance gains are not achieved simply by increased token expenditure」。

全量 Polyglot（225 题）复核（§E.1）：MGM 演化出的 agent 解出 210/225 = 93.3%，与子集上的 93.2% 几乎一致；分语言为 C++ 25/26、Go 36/39、Java 43/47、JavaScript 46/49、Python 33/34、Rust 27/30。作者据此论证不是语言特化。Figure 2 把它放到 Aider-Polyglot 榜单坐标系里：Qwen3.6-35B-A3B + MGM 93.3% 超过 GPT-5，参数量约为其 1/117（闭源模型参数量按 Li (2026) 估计）。

### 5.2 泛化

**跨基准**（Table 2，Polyglot-60 演化 → 冻结 scaffold → zero-shot 评测）：

| | Initial | HGM | MGM |
|---|---|---|---|
| SWE-bench Pro | 16.7 | 13.3 (−3.4) | 26.7 (+10.0) |
| SWE-bench Multilingual | 41.7 | 43.3 (+1.6) | 55.0 (+13.3) |
| 平均 | 29.2 | 28.3 (−0.9) | 40.9 (+11.7) |

这是全文最有说服力的一组数字：**HGM 的跨基准迁移平均是负的（−0.9 点，SWE-bench Pro 上 −3.4 点），MGM 是 +11.7 点**。单轨迹自修改会过拟合到 Polyglot 的失败模式，比较信号则倾向产出可复用 workflow。

**跨模型**（Table 3，SWE-bench Verified-60 演化，仅替换推理底座）：

| 底座 | Initial | HGM | MGM |
|---|---|---|---|
| Qwen3.6-35B-A3B（原生） | 68.3 | 73.3 (+5.0) | 78.3 (+10.0) |
| DeepSeek-V4-Flash | 50.0 | 60.0 (+10.0) | 66.7 (+16.7) |
| DeepSeek-V4-Pro | 45.0 | 70.0 (+25.0) | 75.0 (+30.0) |
| 两个迁移底座平均 | 47.5 | 65.0 (+17.5) | 70.8 (+23.3) |

再加一条：把 MGM 在 Polyglot 上演化的 scaffold 换成 DeepSeek-V4-Pro，在完整 225 题 Polyglot 上拿到 96.89%（§5.2 与 Figure 2）。作者的推论是「scaffolds evolved on smaller datasets and cheaper backbones can be reused on stronger models」。

### 5.3 消融（Table 4，Polyglot-60，同 200 evals，两 worker）

| 变体 | Accuracy | 相对 Initial | Time |
|---|---|---|---|
| Initial | 50.8 | – | – |
| MGM（全） | 93.2 | +42.4 | 40.14 h |
| w/o $\Phi_{RM}$ | 79.7 | +28.9 | 43.01 h |
| w/o $\Phi_{CH}$ | 74.6 | +23.8 | 39.95 h |

两个新算子各自贡献：去掉 $\Phi_{RM}$ 掉 13.5 点，去掉 $\Phi_{CH}$ 掉 18.6 点。**$\Phi_{CH}$ 更关键**，作者的解释是「it helps preserve and reuse useful evolutionary information across iterations」。注意两个消融变体都仍然明显优于 HGM 的 77.9（w/o $\Phi_{CH}$ 的 74.6 略低于 HGM，此时只剩 $\Phi_{CM}+\Phi_{RM}$——这提示 $\Phi_{RM}$ 单独上阵未必稳赢 HGM，是一个不太被作者点出的细节）。时间基本持平，排除算力差异解释。

**收敛速度曲线说明什么**：真实实验没有给逐预算的收敛曲线，只有仿真的 Figure 4。那里的读法是三条：(1) 同预算下 MGM 曲线始终在 HGM 下方（编辑距离更低），即**同样预算走得更远**；(2) $\rho$ 从 1.0 增到 2.0，MGM 与 HGM 的间距单调张开，说明增益完全由诊断质量驱动而非调度差异；(3) $d_0$ 越小间距越明显，即接近 oracle 时精确诊断更值钱。$\rho=1$ 时三条线基本重合——这条 null 是整个理论叙事的对照组，也是它可被伪证的地方。

真实实验里对应「收敛」的替代证据是演化树（Figure 8）与逐节点 utility（Figure 9）：MGM 选出的 node #16 是 utility 0.91 / 35 次评测，HGM 选出的 node #18 是 0.71 / 14 次评测，MGM 不仅峰值更高，被选节点的置信度也更高。

### 5.4 一个反直觉附加结果（§F.2，Table 7 / Table 8）

用 Qwen3-Coder-Next-80B-A3B（更大、更偏 coding）作底座在 SWE-bench Verified 上演化：Initial 33.3 → HGM 40.0 → MGM 41.7。MGM 仍胜 HGM，但绝对水平远低于 Qwen3.6-35B-A3B 的 78.3。Table 8 给出理由：Qwen3.6 在通用推理上全面更强（MMLU-Redux 93.3 vs 91.18、MMLU-Pro 85.2 vs 80.52、GPQA +11.51、SuperGPQA +7.25、HMMT Feb 2025 +20.49、HMMT Nov 2025 +13.53，正文另称 LiveCodeBench v6 +21.47 但该行未出现在 Table 8）。结论是「deciding what to edit is a diagnosis and abstraction problem」，与普通代码补全不是一回事，因此底座选型应看整体推理画像而非参数量或 coding 榜分。

需要指出一处原文数字不一致：§F.2 正文写「the corresponding Qwen3.6-35B-A3B setting, where MGM reaches 61.7% on SWE-bench Verified-60」，而 Table 1 与同节 Table 7 都写 78.3%。（此处原文自相矛盾，78.3 出现两次、61.7 出现一次，应以表格为准。）

### 5.5 定性证据：演化出来的到底是什么 skill

- 杂交案例（§F.1，Figure 10）：node #1 与 #2 都在 `javascript__queen-attack` 上失败；donor 血统里 node #2 → node #6 首次解出，学到的行为被概括为「test-contract skill」——实现前先把测试读成严格行为契约，保留精确公开 API、期望值、错误消息；这个能力传到 node #8，再通过 $\Phi_{CH}$ 作为 donor 注入另一条失败血统（root 为 node #3），产出的 hybrid child node #15 也解出了该任务。作者的结论：「hybridization is not simply another mutation operator, instead it acts as a cross-archive mechanism for capability transfer」。
- 语义分布（§F.3，Figure 11）：把演化出的「To Implement」描述做嵌入可视化，MGM 的点密集聚在 exact test-contract extraction / API-contract adherence / pre-implementation verification 一带；HGM 的点更散（迭代测试、API 对齐、上下文发现、辅助工具各自为政）。作者提出一个操作性判据：泛化性不看措辞是否宏大，而看「whether the evolved skill abstracts away from the original training instance and becomes a reusable procedure for a broad class of future tasks」。

## 6. 局限与作者自述的边界

作者在 Limitations 里列了五条，我按重要性重排并加上自己的评估：

1. **加性 fitness 景观在真实 coding agent 上大概率不成立**，这是全文理论部分最脆弱的地方。作者自己写：「Our formal analysis and Monte Carlo study use an additive fitness surrogate. They isolate diagnostic compression under controlled assumptions and do not capture the full complexity of editable agent scaffolds.」具体哪里不成立，值得说清楚：
   - 模型假设每个 locus 独立可修、且任务只是它们的合取。真实 scaffold 里 prompt 段、control flow、工具之间是强耦合的——加一个两阶段 contract 流程会改变后续所有 prompt 的语义位置，不是翻转一个二进位。附录 H 的 diff 恰恰是这种「结构性重写」，不是 bit flip。
   - 模型有一个固定 oracle $g^\star$ 与零误差下界 $d=0$。真实 scaffold 空间没有已知最优点，也没有固定维度 $L$——每次编辑都可能新增 locus（新工具、新文件）。搜索空间是可增长的，Hamming 距离这个进步度量在那里没有定义。
   - $\Phi_{RM}$ 的证明依赖「两次失败共享同一复发缺陷 $b$」（式 38），这正是需要被验证的结论本身，而不是可以假设的前提。作者把它列为 sound-comparison assumption，诚实但不解决问题。
   - 破坏只用一个常数 $p_b = 0.05$ 建模，与真实自修改中「一次坏重构毁掉整条血统」的重尾风险不匹配。
   - 仿真里 $\rho$ 是**外部注入的自由参数**，不是从命题推导出的数值。因此 Figure 4 严格来说验证的是「若诊断优势存在则 MGM 更快」，而不是「诊断优势存在」。后者只有真实实验的 Table 4 消融支持。
2. **MGM 是历史依赖的，冷启动无优势**。「Reaction-norm mutation needs multiple trajectories from the same agent, and cross-lineage hybridization needs overlapping tasks across lineages. When the archive is small, task overlap is sparse, or informative failures have not yet appeared, MGM has little comparative evidence and may behave like single-trajectory baselines.」失败池只能部分缓解：「it cannot create informative contrasts before failures accumulate.」
3. **好证据不等于好编辑**。「MGM improves the evidence given to self-modification, but it does not guarantee that the resulting edit is correct, general, or maintainable... High-quality evidence therefore need not yield a high-quality modification, and failed edits can waste budget.」并明确指出编辑质量受底座诊断能力上限约束（§F.2 是这条的实证）。
4. **实证覆盖窄**。主演化只在两个固定 60 题子集、单一预算下跑，「Subset selection and limited seed diversity leave residual uncertainty about variance across random restarts and alternative task samples.」也就是说 Table 1 / Table 4 的差距都没有方差估计——15.3 点的 Polyglot 差距很大，5.0 点的 SWE-bench 差距在无 seed 的情况下解释力有限。
5. **成本与适用域**。「evolution and evaluation on repository-level tasks still consume substantial wall-clock and GPU resources」；结论只覆盖 coding agent scaffold 与公开 SE 基准，「do not establish that the same operators would transfer unchanged to non-coding agents or open-ended real-world software maintenance」。
6. **安全边界**（Ethical Considerations，作为方法约束读）：自修改与评测全程在隔离容器内、无网络、host 文件系统只读挂载；作者强调错误的自编辑会**遗传给后代**，风险画像与静态模型不同，任何超出沙箱的部署都需要重新审查执行边界。

另外补两条作者未讨论的：$\beta_{fail}=1.0$ 使失败池加权在主实验中形同关闭，但 §3.2 把「制造跨血统重叠」当成 $\Phi_{CH}$ 可用性的关键机制——这个机制在报告的配置里并没有真正开启，$\Phi_{CH}$ 的高可用性更可能来自 HGM 式评测调度天然产生的重叠。以及 24 次扩展 / 25 节点是一个很小的档案，比较信号的密度在更大档案上如何变化没有数据。

## 7. 对「冻结参数自进化」这条线的意义

把这批工作按「可编辑面 × 搜索结构 × 证据构造」三轴放在一起看，MGM 的位置很清楚：**它是唯一把改进点放在「证据构造」这一轴上的**。

- **DGM**（Zhang et al., 2026a）：确立了 XGM 设定——档案 + 可遗传的 scaffold 源码编辑。可编辑面最宽（整个 agent 程序），搜索结构是开放式演化，证据是单轨迹。
- **HGM**（Wang et al., 2026）：把它变成固定预算树搜索，用 clade 级 metaproductivity 改进采样。改的是**选谁**，证据仍是单轨迹。MGM 直接继承它的 $\pi$ 策略，只替换扩展的执行方式（§3.2）。
- **MGM**：可编辑面与搜索结构照抄 HGM，只把 $E$ 从「一条」变成「一对」。它自己的定位话术是「Prior Gödel Machine-style methods mainly decide which node in the archive should be expanded. MGM instead asks what evidence should be given to the editor once an expansion is triggered.」（§G.1）
- **DarwinX**：也是冻结模型下的 harness 演化，但改的是**选择结构**——种群化 + preserve-and-extend 准入契约，解决单血统路径依赖；证据侧它把 failure/teacher/self 三类统一成同一编辑接口，与 MGM 的「同基因型跨环境 / 同环境跨基因型」是不同的切分维度，两者不冲突。DarwinX 的 skill 层与 code 层分离，MGM 没有做这个分层，被改的就是一份 `coding_agent.py`。
- **HSI**：把自改进堆成三层（task harness / evolver / meta-evolver），改的是**谁在改**。MGM 完全是单层的：编辑器就是被编辑的 agent，$\Phi$ 的策略（$\lambda$ 权重、触发条件）是人写死的超参。把 MGM 的算子选择策略交给 meta-evolver 去演化，是一个显然的正交组合。
- **DIVE**：可编辑面最窄（一段自然语言 skill 文本），但在算子层做得最重（多种群 + 异质算子 UCB 分配 + 算子自生成）。DIVE 和 MGM 的对比最有信息量：DIVE 的多算子是「多种改写方式」，MGM 的多算子是「多种证据结构」。前者问「怎么改」，后者问「凭什么改」。

**「档案比较信号」能否搬到 skill 演化上**：我认为可以，而且比搬到源码演化上更容易，理由有三条：

1. MGM 的两个算子对档案的要求非常轻——只需要 (agent 版本, 任务, 轨迹, 二值结果) 四元组，以及一棵记录亲子关系的血统树。skill 演化系统（DIVE、SkillOpt 类）本来就在跑批量 rollout 并保留 verifier 结果，$\Phi_{RM}$ 所需的「同一份 skill 在多任务上的成败剖面」是现成的，甚至比 coding agent 更便宜（一次 rollout 远小于一次 SWE-bench 评测）。
2. $\Phi_{RM}$ 恰好针对 skill 演化最典型的失效模式。DIVE 报告的问题是「a locally beneficial edit may remove useful guidance, overfit to a small set of failures」——单条失败轨迹驱动的文本改写会把偶然错误写成永久规则。要求编辑器先在多条轨迹里找**复发模式**再动笔，正是对这个失效模式的直接约束。这一点几乎可以零成本加进任何 skill 优化循环：把 prompt 从「这条轨迹失败了，改进 skill」换成「这 $m$ 条轨迹里 $\tau_t$ 失败、$\tau_r$ 如此表现，找出共同的行为模式，写一条通用规则」。
3. $\Phi_{CH}$ 搬过去时需要一个改造。MGM 明确不做代码拼接，而是让目标 agent「extract a transferable behavioral trait from the reference trajectory and adapt that trait to the target agent's own codebase」。对自然语言 skill 来说，「adapt 到自己的 codebase」这一步的阻力更小——skill 是文本，跨血统的能力转移可以就是「把对方 skill 里那条起作用的规则用我自己的措辞与结构重写进来」。但这也带来 MGM 没有的风险：文本 skill 太容易被直接抄袭合并，从而丧失血统多样性、退化成单点。DIVE 用多种群与互补集合选择来维持多样性，MGM 用「子代必须挂在 primary 血统下」来限制混合方向；两者的约束都需要保留，不能只搬算子。

再补一条更实际的判断：MGM 最值得被 skill 演化线借鉴的其实不是两个算子本身，而是 §3.2 那个调度思路——**主动制造可比性**。为了让跨血统对照可用，它专门维护失败任务池来增加不同血统的任务重叠。skill 演化里对应的动作是：让不同种群/不同 skill 版本在同一批「已知能暴露问题」的任务上被评过，而不是各自随机采样，这样档案里的对照结构才存在。这个成本几乎为零，收益是把「比较信号」从偶然变成可依赖。

## 8. 可复用的工程要点

1. **把自修改的 prompt 输入从「一条轨迹」升级为「一个对照结构」**，并显式在指令里要求先找共同/差异模式再做通用改动。参照 §3.1 的两句指令语义：$\Phi_{RM}$ 要「identify a recurring or contrastive behavioral pattern shared by the provided trajectories」，$\Phi_{CH}$ 要「extract a transferable behavioral trait from the reference trajectory」。这是零额外评测成本的改动，Table 4 显示两者分别值 13.5 与 18.6 个点。
2. **档案 schema 要能支撑对照检索**。最小字段集：agent 版本 ID、父节点 ID（血统）、任务 ID、完整轨迹、二值结果。有了这四样，$\Phi_{RM}$ 的触发条件（$|S_i| \ge m_{RM}$ 且至少一条失败）与 $\Phi_{CH}$ 的触发条件（$\exists \tau_t \in S_i \cap S_j$ 且未被双方解出）都是一次索引查询。不要把档案退化成只存分数的 leaderboard。
3. **主动制造任务重叠**。维护失败任务池 $P_t = \bigcup_i F_i$，给里面的任务加采样权重，目的不只是「多考难题」，而是让不同血统落在同一批任务上，从而让跨血统对照存在。注意 MGM 自己把 $\beta_{fail}$ 设成 1.0，所以这条的最佳权重原文未给出，需要自己调。
4. **混合的方向要写成规则，不要让模型自选**。MGM 的规则很值得直接抄（§A.2）：采样策略选出的节点只是**锚点**，谁被编辑由同任务结果决定——恰好一方成功时编辑失败方、成功方只当 donor，子代挂在失败血统下；双方都失败时用 utility 更高的一方作 primary。这保证了「能力从强血统流向弱血统」而不是反过来把好血统改坏。
5. **不要拼接代码/文本，要求重新表述**。「MGM does not splice source files from one agent into another」这条约束是防止继承任务特异行为的关键。落地为：参考轨迹只进 context，产出必须是目标 agent 自己 codebase 上的编辑。
6. **最终产物选择用「置信度加权」而非最高分**。§E.2 的做法：utility 1.00 但只评过 2–5 次的节点不选，选 utility 0.91 / 35 次评测的节点。在小档案 + 稀疏评测的设定下，最高分几乎总是被评测次数最少的节点占据，直接取 argmax 会系统性地选到噪声。
7. **底座选型看通用推理，不看 coding 榜分或参数量**。§F.2 的对照很干净：Qwen3-Coder-Next-80B-A3B 演化只到 41.7%，Qwen3.6-35B-A3B 到 78.3%；差别体现在 GPQA（+11.51）、HMMT（+20.49 / +13.53）这类推理项上。比较信号越丰富，对底座的诊断与抽象能力要求越高——这是引入 $\Phi_{RM}/\Phi_{CH}$ 的隐性代价。
8. **沙箱不可省**。自修改与评测跑在无网络、host 只读挂载的容器内（Ethical Considerations）。原因不是通用安全洁癖，而是这个设定特有的：一次错误自编辑会被**继承**到全部后代，污染是持久且难审计的。
