# HSI：单个冻结 LLM 的三层自改进结构

> 同一个冻结 LLM 分别扮演执行者、改写者、改写策略的改写者，只演化 harness 代码，不动权重。

## 速览

- **arXiv / 日期 / 作者**：arXiv:2608.08466v1 [cs.AI]，9 Aug 2026（原文第 46 行标注）。单作者 Tailin Zhou，HKUST，tzhouaq@connect.ust.hk。代码：https://github.com/TailinZhou/hsi 。
- **是否冻结参数**：明确冻结，且是全文的核心前提。原文 §3.1：「The following two principles define how hierarchical self-modification is realized under a frozen LLM $M$. Throughout this work, the underlying model parameters remain fixed; improvements arise solely from modifications to the harness and the procedure that governs its evolution.」摘要同样写「a single frozen LLM $M$ operates across three hierarchical scopes」。三个层级（task harness / evolver / meta-evolver）共用同一个冻结的 DeepSeek-V4-Flash-Preview，没有任何梯度更新、蒸馏或 LoRA。
- **三个层级各自的演化对象**：
  1. **task-harness scope**：被演化的对象是 task harness $H$ 本身——prompts、tools、memory、state management、hooks、以及决定模型如何与环境交互的 policy（§3.2）。
  2. **evolver scope**：演化对象是 $H$；它自身执行的是 evolver 策略 $\Sigma$，包含 seed selection / main evolution / commit selection 三个阶段。
  3. **meta-evolver scope**：演化对象是 $\Sigma$ 这份策略代码（seed generation、candidate evolution、commit selection、final version selection 四类 policy）。meta-evolver 自己的执行逻辑不可编辑，从 immutable initialization template 载入，是 frozen outer anchor。
- **验证信号来自哪里**：完全来自环境执行反馈，不来自代码静态审查。评测在可编辑面之外，通过固定接口 `using_harness(agent, task)`（式 10）注入任务，evaluator 返回一个标量 reward 加可选文本反馈。候选 harness 用一个随机 LCB reward 排序（式 6，$z=0.5$）。数据划分与评测信号「remain outside the agent's control」（§2.4）。
- **一句话贡献**：在 backbone 完全冻结、任务执行侧关闭 thinking 的严格控制下，证明「让模型自己改写自己的 harness、并且再往上一层改写改写策略」能带来可观且部分可泛化的增益，同时用 NLE 的零增益标定出这条路线的两个经验边界。

## 1. 问题：harness 为什么不该是部署后的固定产物

论文的出发点是一个结构性观察：围绕 LLM 的可执行 scaffold——也就是 harness，包含 prompt、工具编排、memory、验证逻辑——已经是决定 agent 性能的关键变量，同一个 backbone 换 harness 会产生巨大差距（引 Harness-Bench [Yao et al., 2026]、Meta-Harness [Lee et al., 2026b]；附录 B.2.5 记 Harness-Bench 观测到最好与最差 harness 之间有 23.8 分差距）。但这个变量在工程实践里被当作部署时一次性冻结的产物。

作者由此列出两个未解决的问题（§1）：

第一，**已有的自改进系统没有真正把可演化边界推到 harness 层**。Gödel 系（Gödel Agent、DGM、HGM、GEA、HyperAgents）主要演化 agent 的 per-step decision code 或程序执行过程；而真正针对更宽 scaffold 的 harness engineering 工作（Meta-Harness、Self-Harness、AHE）又常常依赖外部 proposer 或更强的 designer model。也就是说，「更宽的编辑面」和「内生（endogenous）演化」这两件事没有同时被满足。HSI 要占的正是这个交叉点：编辑面是完整 harness，proposer 是执行任务的那个同一个冻结模型（Table 4 里 HSI 那行 Proposer 写的就是「Same frozen M」）。

第二，**harness 演化的增益到底是能力提升还是 test-time search**。作者直接引用了 Rethinking the Evaluation of Harness Evolution [Wang et al., 2026b] 这篇批评性工作：在匹配反馈与推理预算的对照实验下，harness evolution 67.4% 对 parallel sampling 72.3%；有 unit test 时 75.8% 对 86.0%；在搜索集与评测集不相交的任务上泛化增益只有 +0.6pp（附录 B.2.5）。这构成一个必须回答的攻击面。HSI 的两个回应是：任务执行侧强制 thinking-off 且 temperature 0，把推理时算力这个混淆因子钉死；以及用 held-out split 评估泛化，而不是只报 in-distribution 数字。

第三个隐含动机是**演化机制本身也该演化**。§2.2 结尾写得很清楚：「most existing approaches focus on evolving the task harness itself, rather than evolving the mechanism that governs how harnesses are discovered, selected, and rewritten.」这直接指向 meta-evolver 层的存在理由。

§2.4 用三个设计问题收束了与前人的差异：可演化边界在哪（HSI：更宽的 harness 面 + 同一冻结模型自己提议）；harness 演化该如何 scale（HSI：不是一个通用 harness 优化一次，而是每个 task family 维护自己持续演化的 harness，泛化用 held-out split 检验）；自改进过程中什么必须保持固定（HSI：`using_harness` 接口固定、$\Sigma$ 在上一层可编辑、meta-evolver 执行逻辑冻结、评测信号与数据划分在 agent 控制之外）。

## 2. 方法详解

### 2.1 两条设计原则

**Principle 1（Single frozen model, three harness scopes）**：同一个冻结 $M$ 跨三个层级运行。三个 scope「share the same frozen model $M$, prompt format, and `react()` primitive. They differ only in available tools and execution context.」并且用显式 memory boundary 隔开——task-harness、evolver、meta-evolver 各自维护独立的交互历史，但原文强调这不等于三个独立 agent（「rather than representing independent agents」）。这一句是理解全文的关键：HSI 不是多 agent 系统，而是同一个模型在三种工具集/上下文下的三种角色。

**Principle 2（Self-determined explore–exploit）**：框架不规定探索-利用的调度表。什么时候读代码、什么时候评测候选、什么时候提交、什么时候记 lesson、探索与利用如何分配算力，全部交给 $M$，并且这些决策本身属于可演化的 $\Sigma$。框架只提供三样东西：atomic interaction primitives、evolutionary feedback signals、structural invariants（具体包括 evaluation rewards、committed-version lineage、以及存在 `BOOTSTRAP.md` 里的 persistent lessons）。

### 2.2 task harness $H$ 的表示与执行方式

$H$ 就是一个可执行代码目录，Figure 1 给出的组成是 `HarnessPolicy` + hook/tool/helper + context/memory/prompt。执行侧的统一原语是式 (7)：

$$a_t = M(o_t, \mathcal{T}, C_t)$$

其中 $o_t$ 是当前观测，$\mathcal{T}$ 是可用工具集，$C_t$ 是 scope-specific context。选出的 action 可以改文件、请求评测、记录信息，或终止当前 stage（附录 A.1）。三个 scope 的差别只在工具可见性：

- task-harness scope：与 benchmark 环境交互，执行当前 $H$；
- evolver scope：修改 harness 目录内的文件，并在 development 任务上调用评测；
- meta-evolver scope：修改 `evolution/` 目录下的 evolution strategy 文件。

附录 A.5 明确了越界即拒：「Any modification outside the authorized directory is rejected.」并且 harness 不能改 $\Sigma$，meta-evolution 阶段也不能直接改 harness。

### 2.3 固定的 task-injection seam：契约在哪、热插拔如何实现

这是整套设计里工程价值最高的一块。契约就一个函数签名，写在附录 A.6 式 (10)：

$$\texttt{using\_harness}(\texttt{agent}, \texttt{task})$$

三条性质是原文给的：

1. **评测在可编辑面之外**（「Evaluation is performed outside the editable surfaces.」）。演化过程改不了评测器，也改不了任务注入方式。
2. **接口不变量跨所有 rewrite 保持**。§3.3.2：「The only invariant preserved across all rewrites is the task-injection interface: while internal harness components may change, the external interface connecting tasks to the harness remains fixed.」
3. **不变量的作用是可比性 + 热插拔**：因为所有版本都通过同一注入机制接任务，「all evolved versions operate under the same task injection mechanism and can be compared using identical development, validation, and test protocols」（A.6）。热插拔（hot-swap）在这里就是把 harness 目录换成另一个 committed 快照，调用方 `using_harness` 一行不动。

换 harness 不破坏调用方的保证来源于两点：接口签名固定 + 目录级权限隔离。**注意原文并没有给出更细的契约描述**——没有类型签名、没有 hook 生命周期规范、没有版本兼容性检查机制，也没有说明如果演化后的 harness 违反接口会怎样（是执行期拒绝、评测报 0，还是被 evaluator 判为 invalid）。（此处原文表述模糊。）对比 HarnessX 把 harness 形式化成挂在 lifecycle hook 上的 typed processors（附录 B.2.2），HSI 的 seam 是最小契约风格。

### 2.4 evolver：依环境反馈重写 $H$

evolver 每个 iteration 三个 stage，各对应一个式子。

**Seed selection（§3.3.1，式 1）**。设 $H_t$ 为第 $t$ 轮起始 harness，$G_t = (V_t, E_t)$ 为累积 evolution graph；每个节点 $v \in V_t$ 是一个 committed harness 快照并带 reward $r_v$，边存的是版本间的语义关系。

$$(\hat{H}_t, h_t) = \texttt{seed\_selection}(G_t, M)$$

$M$ 依据历史 reward、演化历史与累积 lessons 做选择，产出的 hypothesis $h_t$ 强制含四个字段：**选中的 anchor 版本、选它的动机、预期改进方向、falsification criterion（可证伪判据）**。这个 hypothesis 会注入后续演化过程，把演化「from unconstrained mutation into a goal-directed search guided by explicit predictions」。要求写下可证伪判据这一点，与 AHE 的 Decision Observability（每次编辑配一个自述预测、事后验证）是同一思路。

**Main evolution（§3.3.2，式 2）**：

$$\{V_t^{(k)}\}_{k=1}^{K_t} = \texttt{main\_evolution}(\hat{H}_t, h_t; M)$$

可编辑面是 harness 的全部 task-facing 组件。候选通过 task-harness scope 评测拿 reward 反馈，反馈再指导后续编辑。演化过程没有固定优化调度，$M$ 自己决定何时读代码、提改动、评测、结束本轮。

**Commit selection（§3.3.3，式 3）**：

$$C_t = \texttt{commit\_selection}(\{V_t^{(k)}\}_{k=1}^{K_t}, G_t; M)$$

关键设计是**多提交池**而非只留最高 reward 的候选：保留多条演化方向，每个入池版本连同 $M$ 生成的语义 rationale 一起写进 evolution graph，使后续 seed selection 能对成功分支、失败分支、未探索分支一起推理。

### 2.5 meta-evolver：重写 evolver 的策略代码

**Meta-evolution（§3.3.4，式 4）**：

$$\Sigma_{t+1} = \texttt{meta\_evolution}(G_t \cup C_t, \Sigma_t; M)$$

$\Sigma$ 的可编辑面包含 seed selection、main evolution、commit selection、final version selection 四个过程。原文一句话说清了它与 harness 演化的性质差异：「the meta-evolver changes not only candidate harnesses but also the search strategy used to discover future harnesses.」§4.2.3 给了具体形态：meta-evolver 把成功的局部发现**升格为可复用的演化启发式**，例如「prioritizing structured state representations over raw observations」以及「avoiding overly aggressive exploration near a performance plateau」——这些改动「affect future search behavior rather than directly modifying task performance」。BabaIsAI-Make 那条轨迹里，meta-evolver 把「LLM targets, BFS navigates」这个两层模式固化进 $\Sigma$，并把 commit pool 容量从 1 逐步扩到 3（Figure 3 图注）。也就是说 meta 层不仅改启发式文本，还改**搜索的结构性超参**。

**Best-version selection（§3.3.5，式 5）**：

$$H^* = \texttt{best\_version\_selection}(G_T, M, \Sigma)$$

与中途 commit selection 追求多样性相反，这一步 generalization-first：按 validation 性能挑，导出的 harness 用于 held-out 评测。这个选择过程本身属于 $\Sigma$，所以 meta-evolution 也能改「怎么做最终部署决策」。但附录 B.1 有一句约束需要注意：「The terminal best-version selection stage is a fixed, non-evolvable agentic stage that runs once at the end of every evolution.」——§3.3.5 说该 procedure 属于 $\Sigma$、可被 meta-evolution 适配，附录说该 stage 固定不可演化。这两处存在张力，合理读法是「执行该 stage 的外层调度固定，其内部选择 policy 属于 $\Sigma$」，但（此处原文表述模糊）。

### 2.6 frozen outer anchor：为什么它是防漂移的关键

递归自改进最经典的失效模式是：改写器改写自己，于是任何「改得更好」的判据都可以被改写掉，系统从优化任务性能漂移成优化自己的评价函数。HSI 的处理方式是把递归**在结构上截断**，附录 A.5 式 (9) 给了这条链：

$$M \rightarrow H \rightarrow \Sigma \rightarrow \text{frozen anchor}$$

几个层面共同构成这个 anchor：

1. **执行逻辑不可编辑**。meta-evolver 的执行逻辑「is loaded from an immutable initialization template」（§3.2、§3.3.4、A.5）。可编辑的是策略空间 $\Sigma$，不是执行 $\Sigma$ 的那段代码。原文的表述是「The meta-evolver is restricted to the evolution strategy space.」
2. **递归深度硬性为 3**。链条在第三层终止，没有 meta-meta-evolver。原文因此说 self-modification 被限制成「layered and empirically validated edits」而不是 unrestricted self-reference。
3. **目录级权限隔离**。授权目录之外的修改一律拒绝（A.5），这让「不可编辑」不是靠 prompt 约束而是靠机制约束。
4. **评价函数在体系之外**。评测在可编辑面之外执行（A.6），数据划分与评测信号不在 agent 控制内（§2.4）。这一条才是真正堵住 reward hacking 的：即使 $\Sigma$ 被改成偏好某类候选，最终 reward 仍由外部 evaluator 给。
5. **接口不变量**。`using_harness` 固定，保证任何一代 harness 都在同一评测协议下被打分，防止「演化出一个只能在自己定义的评测下好看的 harness」。

值得注意的是，这五条里只有第 1、2 条是「递归截断」意义上的 anchor，第 3–5 条是**能力隔离**。作者把两类机制混在「frozen anchor」这个词下讨论。从工程上看，真正防漂移的主力是第 4 条（评测外置），第 1、2 条防的是无界自引用导致的不可分析性。原文没有做「去掉 frozen anchor 会漂移」的消融实验——**只论证了这个设计的必要性，没有实证它的必要性**。

### 2.7 thinking-on/off：如何隔离 harness 演化的贡献

设计极简但很有效：**任务执行时关闭 extended reasoning，自改写时开启**。原文两处措辞：摘要「disabling reasoning during task execution while enabling it during self-modification」；§1「reasoning is disabled during task execution to fix the model's per-step capability ceiling and enabled during rewriting to maximize the chance of successful self-modification」。

关键是它在整个流程中恒定：§4.1「This configuration remains fixed across development evaluation, validation evaluation, best-version selection, and final testing. Therefore, improvements observed during task execution cannot be attributed to additional reasoning computation at inference time.」

配套还有第二道约束：所有任务交互必须经过冻结 backbone $M$。「Evolution may modify the harness components ... but cannot replace the model with external search procedures or non-LLM policies」（§4.1）。这条堵住的是 AutoHarness 那类「harness-as-policy，代码直接输出动作、不再调 LLM」的路径（附录 B.2.2 记 AutoHarness 的 harness-as-policy 拿到 0.870 平均 reward）。若不禁止，演化很容易退化成「写一个不需要 LLM 的求解器」，那就不是在测 harness 演化对冻结模型的增益了。

不过 BabaIsAI-Make 演化出了 BFS pathfinding（§4.2.3），这是明确的算法组件。所以这条边界实际是「LLM 必须留在决策回路里」，而不是「不许有算法逻辑」——最终固化的模式是「LLM targets, BFS navigates」。

### 2.8 memory、probe 与工具集

**工具集（A.2）**。文件操作：`read` / `write` / `edit` / `bash`。演化专用原语：`plan`（iteration-local 推理笔记本）、`compact_context`（上下文预算紧张时压缩历史）、`evaluate`（执行当前 harness 拿环境反馈）、`lesson`（记录可复用洞见）、`end_evolution`（终止本轮）。框架不规定调用顺序。

**三层 memory（A.3）**：
- iteration-local：`plan.md`，候选被丢弃时随代码状态一起回滚；
- persistent：`BOOTSTRAP.md`，跨 iteration 的 lesson archive，记已发现模式、失败方向、可复用指导，seed selection 可读；
- evolution graph $G_t$：节点存 harness 快照 + reward + 元数据，边编码语义关系（扩展已有方案、修复某失败模式、探索不同方向）。

**probe 机制（A.4，式 8）**：

$$z = \texttt{probe}(\mathcal{T}_{\text{history}}, q)$$

不把全部历史轨迹塞进上下文，而是用一个辅助查询进程返回压缩摘要。原文举的 meta-evolver 查询例子很能说明它想干什么：哪些 seed-selection 行为与成功 iteration 相关；哪些演化模式常导致回退；哪些 hypothesis 结构出现在大幅改进之前。

### 2.9 关键超参数（附录 B.1 + §4.1）

共享配置：

| 项 | 取值 |
| --- | --- |
| backbone | DeepSeek-V4-Flash（`deepseek-v4-flash-preview` API），三层共用 |
| 外层迭代数 $T$ | 5 |
| evolver 每轮 `react()` 步数上限 | 80 |
| meta-evolver 每轮 `react()` 步数上限 | 50 |
| LCB reward 系数 $z$ | 0.5 |
| evolver / meta-evolver thinking | 开启，reasoning effort 拉满 |
| task-harness thinking | 关闭，temperature = 0 |
| archive | greedy |
| seed selection 与 commit pooling | 均可演化 |
| seed hypothesis 注入位置 | 每轮第一条 system prompt |
| seed-validation probe | 开启，seed selection 期间最多 3 次 `evaluate()` |
| init harness 是否预评测 | 否，iteration 1 冷启动 |

逐 suite 变化项见 Table 3：TextWorld/BabyAI/Crafter/MiniHack/NLE 为 Setup A（dev ratio 1.0，val 0.00），BabaIsAI 三个 sub-suite 为 Setup B（dev 0.8；BreakStop val 0.20，GoTo 与 Make val 0.25）。test episodes：TextWorld 与 BabyAI 各 10，其余 5。dev episodes：TextWorld/BabyAI/Crafter 为 3，MiniHack/NLE/BabaIsAI 为 1。test repeats：Setup A 中 TextWorld/BabyAI/Crafter/MiniHack 为 3，NLE 为 1，Setup B 全部为 1。Submit-best steps：BabyAI/MiniHack/BabaIsAI 三个 sub-suite 为 80，TextWorld/Crafter/NLE 为 50。

关于 Table 3 有两处需要指出。其一，Table 3 的 Meta 列给 TextWorld 标 off、BabaIsAI-BreakStop 标 off，但 Table 1 与 Table 2 都同时报了这些 suite 的 meta-on 与 meta-off 结果，所以 Table 3 的 Meta 列大概是指「主报告配置」而非唯一配置（此处原文表述模糊）。其二，Setup B 的 dev 0.8 与 val 0.20/0.25 之和在 GoTo/Make 上超过 1.0，说明 val 可能是从 dev 内部再切或与 dev 有重叠，原文未说明具体切分方式。

### 2.10 整体循环（按原文 §3.2 / §3.3 复述的伪代码）

```
输入：初始 harness H_1，初始 evolver 策略 Sigma_1，冻结模型 M，
      不可变 meta-evolver 执行模板 A（frozen outer anchor），迭代数 T = 5
状态：evolution graph G_1 = ({H_1}, {}), BOOTSTRAP.md = {}

for t = 1 .. T:
    # ---- evolver scope（thinking = on，<= 80 react steps）----
    (H_hat_t, h_t) <- seed_selection(G_t, M)          # 式(1)；h_t 含 anchor/动机/预期方向/可证伪判据
                                                      # 允许 <= 3 次 evaluate() 做 seed 校验探针
    h_t 注入本轮第一条 system prompt

    cand <- {}                                        # 式(2)：main_evolution
    repeat（由 M 自主决定何时停）:
        M 在 harness 目录内 read / write / edit / bash
        # ---- task-harness scope（thinking = off，temperature = 0）----
        r <- evaluate(using_harness(H_candidate, dev_tasks))   # 式(10)；接口不变量
        r_LCB <- mu - z * sigma / sqrt(n)             # 式(6)，z = 0.5
        cand <- cand ∪ {(H_candidate, r_LCB)}
        可选：lesson(...) 写入 BOOTSTRAP.md
    until M 调用 end_evolution

    C_t <- commit_selection(cand, G_t, M)             # 式(3)：多提交池，保留多条方向
    G_{t+1} <- G_t ∪ C_t（节点带 reward，边带语义 rationale）

    # ---- meta-evolver scope（thinking = on，<= 50 react steps，只能改 evolution/ 目录）----
    z_probe <- probe(T_history, q)                    # 式(8)：压缩摘要而非原始轨迹
    Sigma_{t+1} <- meta_evolution(G_t ∪ C_t, Sigma_t, M)   # 式(4)
    # A 本身不可修改；任何越出授权目录的写操作被拒绝

# ---- 终局导出（generalization-first）----
H_star <- best_version_selection(G_T, M, Sigma)       # 式(5)，按 validation 性能选
在 held-out test 上评测 H_star（与演化期同一 thinking-off 配置）
```

递归终止链：$M \rightarrow H \rightarrow \Sigma \rightarrow$ frozen anchor（式 9）。

## 3. 两个理论上界

必须先说清一件事：**这两个「界」在原文中不是定理，没有形式化陈述、没有推导、没有证明**。原文的定位词是「two fundamental limits」（§1）、「two practical boundaries」（贡献 3）、「an empirical capability boundary」（§5.1）。摘要用的是 bound 一词，但正文把它们当作经验边界处理。原文也没有给出「规模界（scaling bound）」这个名字——第二个界叫 **backbone capability bound**，与 scaling 相关的表述是贡献 3 的「Empirical characterization of scaling limits」。任何形式化版本都要到被引文献里找。以下按原文能支撑的程度陈述。

### 3.1 feedback-fidelity bound（反馈保真度界）

**原文表述**。摘要：「a feedback-fidelity bound, since evolution requires informative reward signals to guide selection」。§1 与 §5.1 的展开是：harness 改动无法靠静态审查评估，唯一有用的信号是改动后的 harness 在环境中执行是否产生更好行为（§5.1 第一条 lesson）；「Without execution-grounded feedback, self-modification can easily produce plausible-looking changes that do not translate into improved task performance.」

**推导思路（原文层面）**。演化 = 生成 + 选择。生成由冻结 $M$ 承担，选择由 reward 承担。若 reward 在候选集上近乎恒定（NLE 上初始 harness 为 0.0，meta-on 为 0.2，见 Table 1），则选择算子不携带信息，整个循环退化为随机漂移。这是一个信息论式的直觉论证，原文没有把它写成不等式，也没有定义「fidelity」的度量。

**实践含义**。第一，先建反馈再建演化：如果目标任务上初始 harness 恒为 0，先做的应该是造出中间信号（部分完成度、子目标进度、单元测试、执行日志），而不是开演化循环。第二，reward 的方差本身要被建模——HSI 用式 (6) 的 LCB 而不是均值排序，$z=0.5$，目的是「reduces the impact of stochastic high-reward trajectories during evolution」；这是对「保真度不足」的直接工程对冲。第三，注意作者自己承认演化期 dev 评测每次只跑 1 个 episode（Setup A 部分 suite 为 3），噪声靠 LCB 与最终 test 测量吸收——这本身就是一个 fidelity 上的妥协。

原文提到的可对照的形式化工作是 TTHE（附录 B.2.2）：oracle 分析显示约 14pp 的 selection regret 与约 30% 的 coverage gap，把「proxy signal reliability」认定为核心挑战。这是对 feedback-fidelity 界最接近量化的旁证，但不是 HSI 自己的结果。

### 3.2 backbone capability bound（骨干能力界）

**原文表述**。摘要：「a backbone capability bound, since harness redesign cannot overcome limitations of the frozen model」。§5.1 第四条：「harness evolution expands the effectiveness of a fixed model, but cannot completely overcome limitations in the model's underlying reasoning ability or insufficient environmental feedback.」

**推导思路**。原文的论证是经验性的：跨 BALROG 六个环境呈现单调的难度梯度，增益随难度衰减。大增益出现在模型已有 meaningful competence 的任务（TextWorld、BabyAI、Crafter、BabaIsAI-GoTo/BreakStop），小或可忽略的增益出现在更难环境（MiniHack、BabaIsAI-Make、NLE）。

**原文借来的理论依据**。附录 B.2.5 明确把 On The Statistical Limits of Self-Improving Agents [Wang et al., 2026a] 当作这个界的理论基础：distribution-free PAC 保证在自修改下被保持，当且仅当 policy-reachable hypothesis family 的 VC 维一致有界（Theorem 1）；配套的 Two-Gate guardrail（validation margin + capacity cap）给出有限样本安全性（Theorem 2）；并识别出 Utility-Learning Tension——提升即时性能的改动会侵蚀可靠泛化的统计前提。作者的转译是：「when the task-required function complexity exceeds the model's reachable VC dimension, no amount of harness engineering can close the gap.」这是**借用**而非自证：HSI 没有刻画自己的 reachable hypothesis family，也没有估计 VC 维。

**关于「规模界」**。如果把「规模」理解为演化迭代数，原文的经验规律是次线性且非单调：§4.2.2「the largest performance improvement typically occurs during the first iteration, followed by smaller incremental gains in later iterations」；Crafter 上第 4 轮达最优 0.578，第 5 轮回退（Figure 2 图注）。如果理解为搜索并行度，作者主动放弃了 population-based scaling，理由是归因清晰性（§5.1 第二条），并把 population 探索列为互补的额外 scaling 维度。如果理解为跨任务规模，作者的结论是**任务特定演化才是可行的 scaling 方向**（§5.1 第三条），因为演化出的 harness 捕捉的是 task-family-specific 结构而非普适解。这三层都是经验陈述，不构成上界。

**两个界的联合实践含义**。这两条界给出一个部署前的可判定筛选：只有当（a）环境能给出非平凡且有区分度的反馈，且（b）冻结 backbone 在该任务上已有非零的基线能力时，harness 演化才值得投入。NLE 同时违反两条（初始 0.0，reward 极稀疏），结果是零增益；BabaIsAI-Make 满足 (a) 但接近 (b) 的边界，结果是有增益但方差大、held-out 只有 0.36。

## 4. 实验设置

**Benchmark**。BALROG [Paglieri et al., 2025]，六个长时程文本交互游戏环境：BabyAI、BabaIsAI、Crafter、MiniHack、TextWorld、NLE。能力侧重分别是：BabyAI/BabaIsAI 考指令遵循与导航；Crafter 考长时程规划、资源管理与序贯决策；TextWorld 考多步推理与物体操作；MiniHack 与 NLE 是难度递增的 roguelike，状态空间复杂、反馈稀疏。

**选 BALROG 的理由（§4.1 Benchmark rationale）**。需要 agent 维持状态、跨多步推理、通过工具与环境交互、依执行反馈调整行为——这些正是 harness 设计能影响的部分（memory management、state tracking、exploration strategies、action coordination）。同时六个环境在同一评测框架内覆盖不同难度区间，便于同时刻画「哪里有增益」和「哪里没有」。附录 B.2.5 补充说这个选择直接来自 Wang et al. [2026b] 对基准的两条要求：任务足够难有改进空间；性能高度依赖专用工具/技能/工作流。

**指标**。episode-level % Progress（0–100），演化期 rescale 到 $[0,1]$。候选排序用式 (6) 的随机 LCB reward，$z=0.5$。**所有报告结果用 raw % Progress 均值，不是 LCB reward**（§4.1 原文明确）。

**Backbone**。DeepSeek-V4-Flash（`deepseek-v4-flash-preview`），三层共用，全程冻结。$T=5$，每轮至多 80 个 `react()` 步。

**两套评测协议**：
- **Setup A（in-distribution evolution）**：演化与最终评测用同一任务集，但 BALROG 环境是程序化生成的，每次 `evaluate()` 采新的初始 seed，所以测的是「在已见任务的随机变体上是否改进」。用于 TextWorld、BabyAI、Crafter、MiniHack、NLE。演化期每次评测每任务 1 个 episode（部分 suite 3 个，见 Table 3）以省成本，最终评测用完整 episode 预算。
- **Setup B（held-out task generalization）**：仅 BabaIsAI，按 sub-suite 类别（BreakStop、GoTo、Make、Advanced）构造 task-family split，每个 sub-suite 切 development / validation / test，**test split 在整个演化过程中不可访问**，20% held-out。Advanced 只有 3 个任务，样本不足，被排除。

**Baselines**（§4.1）：
1. **Init Harness**：原始手写 harness，同 backbone 同协议下不做演化直接评测。这是主对照。Setup B 中 Init Harness 是三次基线运行的平均（Table 2 表注）。
2. BALROG 公开榜单结果（2026-08-03 抓取），前沿模型在各自原生配置下的数字，仅作上下文参照。
3. 明确**排除**外部 proposer 类 harness 优化方法参与受控比较，理由是它们的假设不同（依赖更强的外部模型），而 HSI 研究的是固定 backbone 下的内生演化。

## 5. 结果与消融

### 5.1 Setup A：in-distribution（Table 1）

Table 1 下方三行是唯一的受控比较，三者同为 DeepSeek-V4-Flash，只在 harness 是否/如何演化上不同：

| 配置 | BabyAI | Crafter | TextWorld | MiniHack | NLE | Avg |
| --- | --- | --- | --- | --- | --- | --- |
| DS-V4-Flash（Init harness） | 42.0 ± 3.5 | 11.6 ± 5.0 | 40.0 ± 6.2 | 0.8 ± 1.9 | 0.0 | 18.9 ± 3.3 |
| + HSI（meta-off） | 77.3 ± 1.2 | 36.4 ± 1.6 | 46.0 ± 2.4 | 5.8 ± 3.8 | 0.0 | 33.1 ± 1.8 |
| + HSI（meta-on） | **81.3 ± 4.2** | **44.6 ± 3.2** | **65.0 ± 3.0** | **15.8 ± 2.9** | 0.2 ± 0.3 | **41.4 ± 2.7** |

（数据来源：Table 1。Avg 是五个环境的非加权均值，其 std 是各环境 std 的非加权均值。BabaIsAI 未列入 Table 1，因为 sub-suite 协议与榜单的混合任务协议不同。）

meta-on 相对 init harness 的增益（§4.2.1 原文列出）：**BabyAI +39.3，Crafter +33.0，TextWorld +25.0，MiniHack +15.0**，全部为 raw % Progress，backbone 与任务期推理预算不变。平均从 18.9 提到 41.4（+22.5）。

**与前沿模型的对照**（§4.2.1，仅作参照）：TextWorld 上 HSI 65.0 超过 Grok-4 的 62.9、Claude-Opus-4.5-Thinking 的 59.0、Gemini-3-Flash 的 50.2；Crafter 上 HSI 44.6 超过 DeepSeek-R1 的 36.4、GPT-5-minimal-think 的 39.1、GPT-4o 的 33.1。Table 1 顶部的最强项是 Gemini-3.1-Pro-Thinking，Avg 51.8 ± 4.4；Gemini-3-Pro 为 52.1 ± 5.1（Avg 最高）。HSI 的 41.4 与 Gemini-3-Flash 的 43.0、Grok-4 的 43.1 同一档。

### 5.2 第三层值不值得：meta-on 对 meta-off

这是全文对「递归深度是否值得」最直接的证据。**移除 meta-evolver 后，每一个被评测的 suite 都下降**（§4.2.1 Effect of meta-evolution）：

| Suite | meta-off | meta-on | 第三层增益 |
| --- | --- | --- | --- |
| BabyAI | 77.3 | 81.3 | +4.0 |
| Crafter | 36.4 | 44.6 | +8.2 |
| TextWorld | 46.0 | 65.0 | **+19.0** |
| MiniHack | 5.8 | 15.8 | **+10.0** |
| NLE | 0.0 | 0.2 | 无意义对比 |
| Avg | 33.1 | 41.4 | +8.3 |

（数据来源：Table 1；原文 §4.2.1 明确点出 TextWorld +19.0 与 MiniHack +10.0 是最大两处改进。）

几点值得注意：

1. **量级上第三层不是边角优化**。init → meta-off 的增益是 +14.2 Avg，meta-off → meta-on 是 +8.3 Avg。也就是说第三层贡献了 HSI 总增益（+22.5）中的约 37%。TextWorld 上尤其极端：两层只拿到 +6.0（40.0 → 46.0），三层拿到 +25.0（40.0 → 65.0），第三层的贡献是前两层的三倍多。
2. **原文给的解释**：「suggesting that adapting the evolution procedure becomes increasingly beneficial as the harness search space becomes more complex」。即搜索空间越复杂，改搜索策略的边际收益越高。
3. **NLE 不构成有效对比**，两个配置都近零，meta-on 的 0.2 只说明「演化拿不到足够任务反馈来发现有用改动」（§4.2.1）。
4. **一个混淆因子需要指出**：meta-on 引入了额外的 LLM 调用预算（meta-evolver 每轮至多 50 个 react 步）。原文没有做「等预算的两层 vs 三层」对照——把这 50 步给 evolver 而不是 meta-evolver 会怎样，原文未给出。所以严格说这里证明的是「第三层值得，在总预算增加的前提下」，不是「同预算下第三层更优」。
5. meta-on 在 BabyAI 上的 std 反而更大（4.2 vs meta-off 的 1.2），Crafter 也是（3.2 vs 1.6）。meta 层提升了均值但没降低方差。原文未讨论这一点。

### 5.3 Setup B：BabaIsAI held-out（Table 2）

| Sub-suite | Init Harness | Best Dev | Best Test (meta-on) | Best Test (meta-off) |
| --- | --- | --- | --- | --- |
| BreakStop | 0.0333 ± 0.0334 | 1.0000 | 0.9800 ± 0.0632 | 1.0000 ± 0.0000 |
| GoTo | 0.1818 ± 0.0802 | 1.0000 | 1.0000 ± 0.0000 | 0.9636 ± 0.0809 |
| Make | 0.0000 | 0.5556 | 0.3625 ± 0.3284 | 0.3375 ± 0.2029 |

（数据来源：Table 2，20% held-out test；Test 结果为 across-task 标准差；Init Harness 为三次基线运行平均。）

两个明显不同的区间（§4.2.2）：

- **导航类（BreakStop、GoTo）近乎满分且可泛化**。BreakStop 从 0.0333 到 0.98（meta-on）/1.00（meta-off）；GoTo 从 0.1818 到 1.00（meta-on）/0.9636（meta-off）。原文的解读是演化出的 harness 发现了「reusable interaction patterns that transfer beyond the observed development tasks」。这是对「harness 演化只是记住修复、不是提炼策略」批评的直接反驳材料——test split 全程不可见。
- **Make 仍然困难**。dev 最好 0.5556，held-out 只有 0.36（meta-on）/0.34（meta-off），且方差极大（±0.3284）。原文归因于「multi-step crafting requires capabilities beyond the reusable harness transformations discovered during evolution」。dev 0.556 → test 0.36 的落差也是 overfitting 的直接量化。

**注意 Setup B 上 meta-on 并不占优**：BreakStop 上 meta-off（1.0000）优于 meta-on（0.9800），Make 上两者接近（0.3625 vs 0.3375，且方差远大于差值）。只有 GoTo 上 meta-on 明显更好。所以「第三层值得」这个结论在 Setup A 上强，在 Setup B 上不成立——原文只说 meta-off 变体「achieves comparable results」，没有讨论这个不一致。**这削弱了 meta 层增益的普适性主张**：在任务简单到两层就打满的场景，第三层没有空间。

### 5.4 演化轨迹（§4.2.3，Figure 2 / Figure 3）

**Crafter（Setup A，meta-on）**。dev reward 从 init harness 的 0.166 爬到第 4 轮的 0.578（被标为导出的最佳版本），第 5 轮回退。早期迭代做的是补上缺失的任务表征：暴露隐藏 reward 信号、结构化 inventory 信息、改进 action-state 对齐；后期迭代探索更专门的机制，包括 rule-based suggestions 与 safety constraints。Figure 2 图注给出的核心杠杆是「making hidden game feedback explicit: reward signal, inventory state, and crafting feasibility, successively exposed in the harness context」。meta-evolver 的作用是把这些模式固化进 $\Sigma$，让后续迭代继承。第 5 轮的回退是重要信息：**演化不是单调改进，harness 设计空间是非凸的**。

**BabaIsAI-Make（Setup B，meta-on）**。dev peak 逐轮 0.222 → 0.333 → 0.444 → 0.556（五轮）。每轮的具体改动是：iter 1 单次 react 重写 + plan tracking；iter 2 spatial-map builder 带 WIN-target 持久化；iter 3 auto-target 计算 + BFS 寻路；iter 4 auto-push 机制 + 方向性 fallback；iter 5 LLM 感知的跨房间导航。meta-evolver 把「LLM targets, BFS navigates」这个两层模式固化进 $\Sigma$，并把 commit pool 从 1 个版本逐步扩到 3 个（Figure 3 图注）。

**跨两条轨迹的共同模式**（§4.2.3 结尾）：初期迭代发现缺失的抽象，中期引入结构化算法组件，后期精修或裁剪竞争设计。原文以此论证「self-improvement occurs through progressive harness restructuring rather than simple prompt optimization」。这是很重要的定性证据——如果增益只来自 prompt 微调，那批评者关于「等价于 test-time scaling」的指控就成立了；而 BFS 寻路、spatial map builder、WIN-target 持久化这些属于结构性组件，不是 prompt。

## 6. 局限与作者自述的边界

作者在 §5.1（Lessons）、§5.2（Conclusion）与 Acknowledgments 里给出的自述边界：

1. **反馈是可靠演化的地基**。harness 改动无法靠静态审查评估，唯一可信信号是执行后的行为改善。缺少 execution-grounded 反馈时，自改写「can easily produce plausible-looking changes that do not translate into improved task performance」。
2. **主动放弃 population 搜索，换取归因清晰**。「HSI intentionally avoids population-based parallel scaling and instead follows a single evolving lineage, making it possible to attribute performance changes to harness redesign rather than to increased candidate throughput. This design trades search efficiency for clearer measurement of endogenous improvement.」population 探索（DGM、GEA）被明确列为互补方向。
3. **演化出的 harness 是 task-family 特定的，不是普适的**。BabaIsAI 内的强 held-out 泛化说明可以在同一 task family 内发现可复用策略，但「the same mechanisms do not automatically transfer across substantially different environments」。作者据此建议未来的 scaling 方向是为不同任务分布维护多个专门化的可演化 harness，而不是单一通用 harness。
4. **backbone 能力决定可达改进前沿**。MiniHack、BabaIsAI-Make、NLE 上增益小或可忽略。结论句：「self-improving agents should be viewed not as replacing stronger models, but as a mechanism for systematically extracting additional capability from existing models through environment-grounded harness adaptation.」
5. **评测规模有限，作者明确承认这是初步探索**。Acknowledgments：「Due to practical computational constraints, the evaluation focuses on a selected set of benchmarks, backbones, and comparisons rather than a full-scale empirical study.」

我认为还有几处作者未列出但影响结论强度的局限：

- **单 backbone、单 benchmark、单作者规模**。全部实验只用 DeepSeek-V4-Flash 一个模型、BALROG 一个 benchmark。「冻结模型能通过 harness 演化改进」这个结论的模型依赖性没被检验。对比 Self-Harness 在三个模型上验证（MiniMax M2.5 40.5→61.9，Qwen3.5-35B-A3B 23.8→38.1，GLM-5 42.9→57.1，附录 B.2.2），HSI 的覆盖面窄得多。
- **$T=5$ 太短，无法回答长程递归行为**。演化只跑 5 轮，而 DGM 跑 80 轮、HyperAgents 跑到 200 轮。「递归深度是否值得」这个问题在 5 轮尺度上的答案，不能外推到长程；Crafter 第 5 轮就已出现回退。
- **frozen anchor 的必要性没有消融**。原文论证了它的设计动机（防无界自引用），但没有实验展示去掉它会发生什么（漂移、reward hacking、崩溃）。这是全文最重要的架构主张，却是纯设计论证。
- **meta 层的预算混淆**（见 §5.2 第 4 点）。
- **Setup A 的「泛化」较弱**。Setup A 只是同一任务集重采环境 seed，不是新任务。真正的 held-out 只有 BabaIsAI 三个 sub-suite，其中两个（BreakStop、GoTo）简单到被打满，唯一有区分度的 Make 泛化落差明显（dev 0.556 → test 0.36）。
- **成本未报告**。API 调用量、token 消耗、单次演化耗时，原文未给出。这与 Gödel Agent（约 `$15`）、EurekAgent（$<11）、Live-SWE-Agent（每任务 `$0.02`–0.12）这些明确报成本的工作形成对比。
- **Table 3 与正文的两处配置不一致**（见 §2.9 末尾）。

## 7. 对「冻结参数 skill / harness 自进化」这条线的意义

先说结论：HSI 在这条线上的独特位置是 **同一冻结模型同时充当执行者与改写者，并且把递归推到第三层且用不可编辑的外层锚点显式截断**。Table 4 里 HSI 那一行的三个字段直接概括：Proposer = Same frozen M，Surface = 3-layer hierarchy，Feature = Endogenous hierarchy with frozen outer anchor。

**与 DIVE 的关系**。原文未引用 DIVE，以下是坐标系定位而非原文观点。DIVE 类工作走的是「冻结权重 + 演化可复用技能库」，其核心资产是 skill/经验条目，检索与复用是主机制。HSI 的核心资产是**可执行的 harness 代码目录**，包含 prompt、tool、memory、hook、policy，粒度比 skill 条目粗且是结构性的（能演化出 BFS 寻路器、spatial map builder，见 §5.4）。两者的验证机制也不同：DIVE 那一路通常靠任务成功率筛技能，HSI 靠固定 seam 上的 LCB reward 筛整个 harness 版本。互补性很明显：技能库解决「知识复用」，harness 演化解决「架构复用」。

**与 MetaSkill-Evolve 的异同（重点）**。原文未引用 MetaSkill-Evolve，以下是对照分析。

- **相同点**：两者都是双时间尺度结构。MetaSkill-Evolve 的快尺度是具体 skill 的更新、慢尺度是 meta-skill（关于如何演化 skill 的知识）的更新；HSI 的快尺度是 harness $H$ 的改写（每轮内多次候选），慢尺度是 evolver 策略 $\Sigma$ 的改写（每轮一次）。两者都主张「改写规则本身要被学习」，都不动权重。HSI 的 §4.2.3 描述的 meta-evolver 行为——把成功局部发现升格为「prioritizing structured state representations over raw observations」这类高层原则——在功能上就是在积累 meta-skill。
- **差异一：慢尺度的载体形式**。MetaSkill-Evolve 的 meta-skill 是自然语言/文本化的元知识条目；HSI 的 $\Sigma$ 是**可执行策略代码**（`evolution/` 目录下的文件），meta-evolver 用 `read`/`write`/`edit`/`bash` 直接改代码。改代码比改文本条目表达力更强，但也更容易破坏可执行性——HSI 靠目录权限拒绝越界写、靠外部评测拒绝无效版本来兜。
- **差异二：递归是否显式截断**。HSI 的贡献之一就是给出了明确的终止链 $M \to H \to \Sigma \to$ frozen anchor（式 9）与「meta-evolver 执行逻辑从 immutable template 载入」这条机制。meta-skill 类框架通常隐式停在两层，没有把「为什么不需要 meta-meta」作为设计命题来论证。HSI 把它显式化了。
- **差异三：模型同一性的严格程度**。HSI 强调三层共用同一个冻结 $M$、同一 prompt format、同一 `react()` 原语，只在工具集与上下文上不同，并明确否认这是多 agent（§3.1 Principle 1）。这让「增益来自结构而非来自更强的改写者」这个主张更硬。
- **差异四：混淆因子控制**。thinking-off + temperature 0 的任务执行配置，是 HSI 相对同类工作最干净的一处方法论贡献。MetaSkill-Evolve 一路的工作通常不做这层隔离，因而难以排除「增益来自推理时算力增加」。

**与 DarwinX / MGM 的关系**。原文未引用这两个名字，但引了同源的 DGM 与 HGM，可以据此定位。DGM 系（附录 B.2.1：SWE-bench 20.0%→50.0%，Polyglot 14.2%→30.7%，greedy 消融 39.7% vs 完整 50.0%）与 HGM（引入 Clade-level Meta-Productivity，SWE-Verified-60 56.7% vs DGM 53.3%，比 DGM 快 2.38–6.86 倍）的共同特征是 **population/archive 驱动的开放式搜索 + 编辑整个 codebase**。HSI 在两个维度上与它们正交：

- 搜索维度：HSI 主动放弃 population，走单一 lineage（§5.1 第二条），换归因清晰性。这是方法论选择而非能力不足，作者明说 population 是互补的额外 scaling 维度。
- 编辑面维度：DGM/HGM 编辑的是 coding agent 的完整代码库（决策过程为主），HSI 编辑的是 harness——prompt、tool 编排、memory、state、跨步交互模式。域也不同：DGM/HGM 在 coding benchmark，HSI 在长时程交互游戏。
- HyperAgents 是最近的对照：它把 meta-mechanism 本身变成可编辑（task agent 与 meta agent 融合成单个可编辑 Python 程序）。HSI 与它的关键差别是 **HSI 保留了一个不可编辑的最外层**，HyperAgents 走的是「融合式自引用」。HSI 相当于给同一个方向提供了一个更保守、更可分析的变体。

**这条线上 HSI 最有价值的两个贡献**：

1. **给出了第三层递归的第一份量化证据**（Table 1 的 meta-on vs meta-off，Avg +8.3，TextWorld +19.0）。此前「演化机制本身该不该演化」主要是理念论证。虽然有预算混淆且 Setup B 上不成立，但这是目前最直接的数字。
2. **把「冻结外层锚点」从模糊的安全直觉变成了具体机制**：immutable initialization template + 目录级写权限拒绝 + 评测外置 + 固定注入接口。这四条可以直接搬到任何 skill/harness 自演化系统里。

同时 HSI 也强化了这条线的一个共识性结论：harness/skill 演化是**从已有模型中榨取额外能力的机制，不是替代更强模型的机制**（§5.2 原句）。这与 Live-SWE-Agent 发现 GPT-5-Nano 自演化会退化 68.2%、Continual Harness 发现 Flash-Lite 停在 20% 以下（附录 B.2.2）共同指向同一个「模型能力地板」。

## 8. 可复用的工程要点

1. **先定一个最小的 task-injection seam，再谈演化**。像 `using_harness(agent, task)` 这样一个函数签名就足够支撑热插拔：内部实现随便换，外部调用方与评测协议零改动。落地时要在这个最小契约上补 HSI 没写的部分——接口一致性校验（演化后的 harness 若不满足签名应在评测前被拒绝而不是评测出 0 分）、以及版本与接口版本号的绑定。

2. **评测器和数据划分放到可编辑面之外，用目录权限而不是 prompt 约束来隔离**。HSI 的做法是 evolver 只能写 harness 目录、meta-evolver 只能写 `evolution/` 目录、越界写直接拒绝（附录 A.5）。这比在 system prompt 里写「不要修改评测代码」可靠得多，也是防 reward hacking 的主力机制。

3. **候选排序用 LCB 而非均值**：$r = \mu - z\sigma/\sqrt{n}$，HSI 取 $z=0.5$（式 6）。在演化期每任务只跑 1–3 个 episode 的低预算设定下，均值排序会持续选中「运气好的高方差版本」。同时保持一个纪律：**排序用 LCB，报告用 raw 指标**（HSI 明确区分了这两者）。

4. **强制候选带可证伪判据**。HSI 的 seed hypothesis 必须含四字段：anchor 版本、动机、预期改进方向、falsification criterion，并注入本轮第一条 system prompt（附录 B.1）。这把演化从盲目突变变成有预测的搜索，事后也能统计「哪类假设结构先于大幅改进」——HSI 的 probe 机制正是这么用的（附录 A.4）。

5. **提交池保留多条方向，不要只留最优**。HSI 的 commit selection 显式维护 diverse pool，每个入池版本带语义 rationale 写进 evolution graph，边编码「扩展已有方案 / 修复某失败模式 / 探索新方向」（§3.3.3、附录 A.3）。Crafter 第 5 轮的回退说明设计空间非凸，只留最优会让后续搜索无路可退。BabaIsAI-Make 上 meta-evolver 主动把池容量从 1 扩到 3，说明池大小值得作为可调项而不是常量。

6. **上下文用 probe 摘要而不是原始轨迹**。$z = \texttt{probe}(\mathcal{T}_{\text{history}}, q)$（式 8）：让改写者按需查询压缩摘要，而不是把全部历史塞进上下文。配套三层 memory 分工——iteration-local（`plan.md`，候选被弃时随代码回滚）、persistent lessons（`BOOTSTRAP.md`，跨轮可读）、evolution graph（结构化长期记忆）。回滚语义要和代码状态绑定，否则失败候选的笔记会污染后续判断。

7. **做 thinking-on/off 隔离，并在所有评测阶段保持一致**。执行侧关推理（temperature 0），改写侧开推理。这一条不改变系统能力，但决定了你能否说服别人「增益来自结构改进而非推理时算力」。同时要禁止演化把 LLM 从决策回路里摘掉（HSI：不得用外部搜索或非 LLM 策略替代 $M$），否则演化会退化成写一个不需要模型的求解器。
