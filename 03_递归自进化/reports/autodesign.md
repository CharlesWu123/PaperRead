# AutoDesign：meta-harness 优化与论文转海报

> 冻结模型权重，让 code agent 依 rollout 反馈递归改写 design harness，在论文转海报任务上刷到 78.32。

## 速览

- **arXiv / 日期 / 机构**：arXiv:2608.13560v1 [cs.CV]，2026 年 8 月 13 日。Meituan、MBZUAI、华中科技大学、北京大学、清华大学、香港中文大学、上海交通大学联合；共同一作 Yaxin Luo、Haobin Jiang，通讯 Zhiqiang Shen、Xiaotong Li，Xiaotong Li 为 project lead。工作在 Yaxin 于美团实习期间完成。
- **是否冻结参数**：明确冻结，全文无任何训练/微调环节。Section 2.2 原文："Throughout this process, the parameters θ of the underlying model πθ in the harness remain fixed. The optimization therefore acts on the system surrounding the model rather than on the model itself, consistent with the model-versus-scaffold distinction in recent self-improving-agent taxonomies (Ren et al., 2026)."；Section 2.1 定义 harness 时同样写 "the system surrounding a fixed model"；结论节重申 "while keeping model weights fixed"。唯一涉及权重的地方是 Section 6 的展望："harness optimization can complement model post-training … Joint training should preserve this division"，即模型后训练是未来方向，本文没做。
- **演化对象**：design harness $H$ 被显式拆成五个功能组件（Section 2.1）：Context and Memory（源管理、prompt、skills、可复用资产、持久状态）、Tools and Specifications（工具与可编辑产物规范）、Execution Runtime（创作/渲染/校验/导出的工作区与运行时）、Orchestration（任务路由、尝试预算、循环控制、候选选择、fallback、finalization）、Evaluation and Feedback（规则校验、模型批评、局部化反馈）。外层每次迭代**只准改其中一个组件**（可跨该组件内多个文件）。
- **验证信号来自哪里**：三层分离。(1) 优化期评估器 $R_{\text{meta}}$——由一个 evaluator coding agent 依据**人工标注的 reference artifacts**（七维打分）实现，规则检查 + VLM 判断混合，构建后在自主优化过程中冻结；(2) acceptance gate——训练集 $\mathcal{D}_{\text{train}}$ 提升且独立开发集 $\mathcal{D}_{\text{dev}}$ 不下降才允许晋升，dev 结果**从不喂给** optimizer；(3) 最终对比用与优化循环完全解耦的 frozen PosterBench 协议 + 系统盲测人评。
- **一句话贡献**：把"设计能力"从一次性的 artifact 修订提升为对生产系统本身的持久更新——meta-harness optimizer 聚合轨迹/诊断/评估反馈，指挥 coding agent 有界地改写 harness 代码，累积出可执行的 DesignHarness，并配套 PosterBench 评测协议。

## 1. 问题：长程 agentic 设计任务为什么需要可演化 harness

论文的出发点是：把"多模态源 → 面向人的产物"（网页、幻灯、海报、视频）看成一个以 **model-harness 系统**为中心的长程 agentic 过程。这类任务需要抽取证据、跨异质信息推理、规划中间步骤、依反馈迭代改进（Introduction），因此天然是 agentic coding 的长程任务，而难点在于"real-world workflow 的复杂性 + 对大量人类反馈的依赖"。

对既有 paradigm 的批评有两处，措辞很直接：

- 摘要："While an ideal harness system should align with human design priors and accumulate reusable experience through empirical exploration to drive recursive self-improvement, **existing paradigms remain static and fall short of this capability**."
- Introduction 更具体地区分了三层：response 级反馈（Self-Refine）只改当前输出；agentic 系统可以跨尝试保留 reflection / skill / 经验（Reflexion、Voyager、ExpeL）；但"unlike human creators who continuously accumulate knowledge from successful revisions and failures, such systems treat individual human-aligned feedback as **transient signals rather than reusable design knowledge**"。
- Related Work 里对同类工作的定位："their run-time feedback generally remains within a fixed production procedure"，以及"these mechanisms preserve useful information beyond a single attempt, but they typically **do not update the harness** that repeatedly produces outputs"。

因此论文把待解问题写成一句话：如何把多模态证据、结构约束、反馈与人类偏好，**转化为生产系统的持久设计能力**（persistent design-aligned capabilities）。

优化单元的分类（海报页 Section 2 与 Related Work 一致）：

| 优化单元 | 代表系统 | 范围 |
| --- | --- | --- |
| 组件或声明式程序 | TextGrad、DSPy、GEPA | program-level optimization |
| 代码 / 工作流图 | STOP、GPTSwarm、ADAS、AFlow | agent procedure search |
| design harness | AutoDesign | cross-task system evolution |

## 2. 方法详解

### 2.1 model-harness 系统的形式化

design harness 定义为围绕固定模型的系统（式 1）：

$$y \sim H(\pi_\theta, x, c)$$

其中 $\pi_\theta$ 是 LLM/MLLM，$x$ 是多模态输入，$c$ 是上下文（目标媒介、用户约束）。harness 通过执行轨迹 $\tau$ 产出 artifact $y$，$\tau$ 记录中间动作、状态与修订序列。

meta-harness 的目标是 harness 产出质量的期望（式 2、3）：

$$J(H) = \mathbb{E}_{(x,c)\sim p_{\text{task}},\ y\sim H(\pi_\theta,x,c)}\big[R_{\text{meta}}(y,x,c)\big],\qquad H^\star = \arg\max_H J(H)$$

关键的边界声明紧跟在式 3 之后：$\theta$ 全程固定，优化作用于模型**周围**的系统。

内层循环只给了最小骨架（式 4），两个抽象模块 designer $M_{\text{design}}$ 与 critic $M_{\text{critic}}$：

$$y_k = M_{\text{design}}(y_{k-1}, f_{k-1}; x, c),\qquad f_k = M_{\text{critic}}(y_k; x, c)$$

$y_0, f_0$ 为空，故第一步从 $(x,c)$ 直接产出初稿。原文强调这只规定角色与信息流，**具体实现留空**，由外层循环去写：prompts、tools、feedback 机制、loop-control policy 都可被改。

### 2.2 meta-harness optimizer 如何依 rollout 反馈改 harness

外层循环每轮四阶段（Section 3.2）：

1. **Rollout**：当前 harness $H_t$ 在训练任务集 $\mathcal{D}_{\text{train}}=\{(x_i,c_i)\}_{i=1}^{N_{\text{train}}}$ 上执行，得到 $y_t^i$ 与轨迹 $\tau_t^i$。
2. **Evaluation**：$s_t^i = R_{\text{meta}}(y_t^i, x_i, c_i)$，七维（Faithfulness、Coverage、Density、Visual Evidence、Layout、Readability、Aesthetics）。
3. **Update proposal**（式 5）：

$$H'_{t+1} = P(H_t, \tau_t, s_t, \mathcal{L})$$

$P$ 实例化为一个 coding agent，**先当 planner 再当 code editor**。planner 角色下它分析轨迹与分数、结合优化记录 $\mathcal{L}$，**派发并行 subagent** 去检查轨迹与分数，把发现综合成"recurrent failures"的结构化证据，然后写出 harness 更新计划：观察到的 failure mode、要改的组件、打算怎么改。code-editor 角色下它在 $H_t$ 上落地代码改动，得到候选 $H'_{t+1}$。

4. **Acceptance gate**（式 6）：

$$\text{Accept}(H'_{t+1}) \iff J_{\text{train}}(H'_{t+1}) > J_{\text{train}}(H_t) \ \wedge\ J_{\text{dev}}(H'_{t+1}) \ge J_{\text{dev}}(H_t)$$

原文明确：dev 结果**只**给 gate 用，"never exposed to $P$ when constructing an update proposal"，$\mathcal{D}_{\text{dev}}$ 是防 harness 过拟合训练任务的护栏（引 Nguyen et al., 2026）。

优化记录 $\mathcal{L}$ 存每轮的 harness $H_t$、轨迹与分数、被选组件、更新计划与对应代码 diff、接受/拒绝决策，并保留**仓库级 checkpoint**；dev 集的轨迹与分数不入记录。$\mathcal{L}$ 作为持久上下文传给下一轮，被拒时下一轮能换个方向提案而保留"已试过什么"的证据，支持比较、复现与回滚。

一个容易被忽略的设计约束：**外层每轮只维护单一活跃 harness，不做 harness 变体的树搜索**（原文 "does not perform tree search over harness variants"）——这是它与 Darwin Gödel Machine 式开放演化的核心区别。

### 2.3 递归改进的循环结构与终止条件

```
Algorithm 1  AutoDesign meta-harness optimization
Require: 固定模型 π_θ; 初始 harness H_0; 评估器 R_meta
Require: 训练集 D_train; 开发集 D_dev; 外层迭代数 T
Ensure:  优化后 harness H_T 与优化记录 L
 1: 在 D_train 上运行 H_0，收集轨迹 τ_0 与分数 s_0
 2: 在 D_dev 上运行 H_0，收集分数 s_dev_0
 3: for t = 0 to T-1 do
 4:     optimizer P 检视 (τ_t, s_t, L)，提出候选 H'_{t+1}
 5:     在 D_train 上运行 H'_{t+1}，收集 τ'_{t+1}, s'_{t+1}
 6:     在 D_dev 上运行 H'_{t+1}，收集 s'dev_{t+1}
 7:     if J_train(H'_{t+1}) > J_train(H_t) and J_dev(H'_{t+1}) >= J_dev(H_t) then
 8:         d_t <- Accept
 9:         (H_{t+1}, τ_{t+1}, s_{t+1}, s_dev_{t+1}) <- (H'_{t+1}, τ'_{t+1}, s'_{t+1}, s'dev_{t+1})
10:     else
11:         d_t <- Reject
12:         (H_{t+1}, τ_{t+1}, s_{t+1}, s_dev_{t+1}) <- (H_t, τ_t, s_t, s_dev_t)
13:     end if
14:     把 harness checkpoint 与本轮记录追加到 L
15: end for
16: return (H_T, L)
```

终止条件是**固定迭代预算 $T$**，算法里没有基于收敛的停止判据；$T$ 的具体取值原文未给出（只在 Figure 5 出现 "24h Outer Agent Loops" 的字样，以及贡献 1 中"7 天演化轨迹、至少 123 次递归迭代"的统计）。此外还有一个人为的"软终止"：自主优化会在 plateau 处停滞（Figure 1a 的 80.88），需人工引导才继续上升。

### 2.4 Human-in-the-Loop：两条通道

- 通道一，方向性引导 $g_t$（自然语言）并入 planner 输入，提案变为 $H'_{t+1}=P(H_t,\tau_t,s_t,\mathcal{L},g_t)$。引入理由原文写得很实在：作为 $P$ 的 coding agent "may converge prematurely to a locally satisfactory harness configuration, at which point outer-loop optimization stagnates"。
- 通道二，当人眼发现 $R_{\text{meta}}$ 未捕捉的系统性 artifact bias 时，人可以对"实现评估器的 coding agent"给指示以修订评估器。原文明确："Such evaluator revision requires explicit human input. Otherwise, $R_{\text{meta}}$ remains fixed because the meta-harness receives no external signal with which to identify or correct evaluator bias." 两条通道里人都只给观察与高层方向，不直接编辑 harness 或评估器代码。

### 2.5 "对齐人类设计先验"在实现上到底是什么

这一点原文分散在多处，拆开看是三个互不相同的注入点：

1. **评估器由人工标注的参考产物初始化**（Section 3.2 Evaluation）：优化前，把人类沿七维标注的 reference artifacts 交给 evaluator coding agent，由它据此实现 $R_{\text{meta}}$——规则检查负责可直接度量的属性，VLM 判断负责 aesthetics 等感知属性。Figure 3 中对应 "Anchors / ref. artifacts / Init."。
2. **共享 prompt 里的显式设计规则**（Appendix A.2）：这是全文最"重"的人类先验载体。Shared User Prompt 逐条规定了 3072×1536 / 2:1 尺寸、三列布局、7–10 个编号 section（每列 2–4 个）、header 只允许 title/authors/institution 三行且禁止 logo、QR、venue、badge、禁止 KPI 大数字条带、必须用原始 PDF crop 而非重绘表格、必须用 Times/Georgia 类学术衬线体、booktabs 风格无竖线表格、th/td 全部左对齐、native 表格 3–7 行 3–6 列、限制加粗与斜体、克制的配色（一个 muted accent + 最多一个次要 accent）等。甚至规定了 DOM 契约：每个源图/表必须放在 `<section class="source-flow-unit figure-flow-unit" data-source-id="..." data-layer-id="...">` 里、该元素必须 `display: flow-root|block` 而非 grid/flex、浮动列表要留 marker gutter。
3. **评分函数的权重与硬门**（式 7、8 与 Table 6）：把"可读性优先"写进了权重，见第 3 节。

需要如实指出一处：A.2 说这份 Shared User Prompt 是"used across compared systems"，即**所有对比系统拿到同一份**。因此这些人类设计规则本身不是 AutoDesign 的独占优势；但也意味着"对齐人类设计先验"里相当大一部分是**手工 prompt 工程**，而非 meta-harness 自主学到的。同时这份共享 prompt 里含有明显是 AutoDesign 校验器专用的 DOM 约定（"in the DOM shape expected by validation"），把它交给 baseline 是否公平，原文未讨论（此处原文表述模糊）。

### 2.6 关键超参数与运行规模

- 内层最大修订次数 $K = 12$（Section 4.3）。一旦候选通过全部 blocking check 立即终止并进入 finalization；预算耗尽则用保留的尝试历史走 fallback 序列挑一个可交付候选。
- 每轮外层更新限定在 **1 个**功能组件（五选一）。
- PosterBench 权重 $\alpha=(10,10,15,10,20,25,10)$，合计 100（式 7、Table 6）。
- 标准 P0 gate 上限 40 分，更严重的 gate 类型可设更低上限（式 8、A.4）。
- 演化规模（贡献 1）：7 天演化轨迹，调用 **224 个 subagent**，记录**至少 123 次**递归迭代，累积 **54 次 harness 更新**。
- 单次成品运行（贡献 4 / Figure 2）：**253 次 tool call、11 个编辑轮次、约 40 分钟、成本 < `$3`**，人工干预可忽略。
- 运行时版本（A.1）：codex-cli v0.142.3、Claude Code v2.1.119，各模型均用最高 thinking-effort。
- $N_{\text{train}}$、$N_{\text{dev}}$ 的具体论文数、以及训练/开发集与 PosterBench 的重叠情况，原文未给出。

### 2.7 演化出的 DesignHarness 长什么样

Section 4 是对最终实现的**事后刻画**（不是设计），四个阶段：

- **Paper Ingestion**：抽 metadata、section outline、支撑主张的关键段落、图表及其源位置，组织成 content brief + medium-specific artifact plan；每个抽取元素保留回源引用以便 revision 期核查。这个上下文**只构建一次**，跨所有内层 refinement 步复用——这是"局部代码编辑而非整体重生成"的前提。
- **Generation & Revision**：designer 是 coding agent，产物全程保持为可编辑 HTML，可导出 PNG/PPTX/MP4 供视觉批评。
- **Validation & Finalization**：rule-based validator 做确定性 blocking check（不安全/缺失资产、断裂的 provenance 链接、严重溢出或重叠、排版与布局约束违规），通过则直接 finalize；否则返回局部化诊断 + 非阻断检查结果（覆盖度、信息密度、与源的数值一致性）。失败候选再渲染成预览交给 critic VLM 评设计契约合规、layout、readability、aesthetics。两路反馈合并为修复信号 $f_k$。
- Figure 14 给出实现级架构累积视图，并明确其**不是**第二套 taxonomy、也**不是**外层迭代的时间线；同时区分了三个评估器：harness 内的 image-native evaluator、外层的 $R_{\text{meta}}$、以及最终冻结的 PosterBench。

## 3. PosterBench 评测设计

**构成**（Section 5.1）：100 篇主赛道，覆盖五个学科——AI/ML、生物医学与健康、气候与地球环境、经济与政策、物理与天文；PosterBench-mini 是共享的 10 篇子集，用于受控消融与快速测试。所有系统拿到同一份源 PDF 与源资产，输出渲染成统一海报格式后打分。各赛道"固定什么、变什么"由 Table 5 的受控矩阵给定（5 个赛道 + 1 个 harness-attachment 消融）。每学科各占多少篇，原文未给出。

**打分方式：三者混合，不是纯人工也不是纯 LLM judge**。Table 6 逐维给出了 score mode：

| 维度 | 权重 | 打分方式 | 操作定义要点 |
| --- | --- | --- | --- |
| Faithfulness | 10 | Programmatic + VLM | 数值与源 grounding 检查，再判主张/实体/视觉证据是否与论文一致 |
| Coverage | 10 | VLM | 对照紧凑 source brief 检查 problem/method/evidence/takeaway 是否保留 |
| Density | 15 | Programmatic | 信息占用率、OCR 文本覆盖、内部空白、粘贴正文截图 |
| Visual Evidence | 10 | Programmatic + VLM | 图表是否相关、可读、就近解释；guard 拒绝生正文裸 crop |
| Layout | 20 | Programmatic | 渲染尺寸与比例、OCR fallback、裁切、重叠、导出边缘损伤、可见占位符 |
| Readability | 25 | Programmatic + VLM | 海报尺度文字与空间检查 + 层级、扫读路径、平衡、拥挤判断 |
| Aesthetics | 10 | VLM | 学术视觉工艺：字体、配色纪律、构图连贯 |

即：**权重最高的 Layout(20) 与 Density(15) 由程序化指标主导，Readability(25) 是混合，纯 VLM 只占 Coverage(10) + Aesthetics(10) = 20 分**。这是这套协议可信度的主要来源。

**聚合与硬门**（式 7、8）：先算加权 rubric 分，再取 record-level ceiling 的最小值：

$$R_{\text{poster}} = \min\big(R_{\text{rubric}},\ C^{\text{layout}},\ C^{\text{viability}},\ C^{\text{failure}},\ C^{\text{gate}}\big),\qquad \text{Overall}=\frac{1}{N}\sum_i R_{\text{poster}}(p_i,A_i)$$

四类 ceiling 分别约束严重布局损坏、呈现可用性不足、已确认的可见失败、渲染完整性受保护违规；未激活的 ceiling 取 100。因为**先封顶再平均**，表格里的维度均值加权**无法反推 Overall**（A.4 明确说明 $\frac{1}{10}\alpha^\top \bar q \ne \text{Overall}$）。此外，对 ≥20 张可读海报的批次会做一次盲化 style-homogeneity 检查，且它**只能降低** professional-aesthetics 分；mini 只有 10 张，不触发该检查。

**作者为 LLM judge 可信度做了什么**（这是本文最需要核查的点，逐条核实如下）：

1. **评估器分离**：PosterBench 是 frozen external evaluator，与优化期的 $R_{\text{meta}}$ 分开；原文明确 "PosterBench evaluates completed systems and is neither optimized nor modified by the outer loop"。rubric、权重、protected gate 都是**人工指定并在对比评测前冻结**（A.4）。
2. **限制 VLM 的权重占比**：如上，纯 VLM 维度仅 20/100，Layout/Density 完全程序化。
3. **给 judge 屏蔽身份**：每次 VLM 判断只收到渲染图、紧凑论文 brief 与选定 grounding 信号，"but no system identity or generation prompt"（A.4）。
4. **可审计记录**：released record 含 case_id、system、overall_score、七维分数与 evaluation_status，支持重聚合与独立审计（A.4、A.5）。
5. **独立人评校准**：11 名志愿者、系统全盲两两比较、936 份响应（933 判定 + 3 skip），Bradley–Terry 拟合，2000 次交叉 bootstrap（重采样论文与评审员）。并直接报告 benchmark–human 对齐：poster 级 Pearson $r = 0.34$，95% CI [0.22, 0.44]；把 919 份非 skip 判定按分差分箱后，benchmark 偏好与人类一致率从 0–3 分差的 **51.9%** 升到 ≥20 分差的 **74.4%**（Figure 10b）。
6. 作者对 (5) 的解释是"这是协议的有用性质，而非要求它复刻人类偏好"，理由是 PosterBench 评七个维度而盲测只问一次即时二选一。这个解释合理，但 $r=0.34$ 与 0–3 分差时 51.9%（约等于随机）意味着**该基准在细粒度上几乎没有分辨力**，只在大分差处可信。
7. 需要重点标注的一条：A.5 报告 **nominal Krippendorff 系数仅 0.101**，作者说明它是 paper–system-pair item 上的名义一致性诊断、不是排序估计量。但 0.101 的评审员间一致性极低，意味着作为"独立验证"的人评本身噪声很大——AutoDesign 的 BT 点估计 64.0% 的 95% 区间是 **55.2–77.8%**，下界离 50% 只有 5 个点。
8. 残留的自我强化风险：A.4 承认 PosterBench 的七个维度 "use the same quality vocabulary as the outer-loop evaluator $R_{\text{meta}}$"，且两者都由 rule + VLM 构成。词汇与信号族同源意味着在 $R_{\text{meta}}$ 上做优化天然会在 PosterBench 上涨分，二者并非统计独立；此外 $R_{\text{meta}}$ 本身是由 coding agent 自己实现的。作者用"frozen + 人工指定 + 人评"来缓解，但没有给出两个评估器分数的相关性分析（原文未给出）。

## 4. 结果与消融

**主赛道（Table 1，100 篇）**：

- AutoDesign + DesignHarness + Claude Code + Claude 4.8 = **78.32**，最高分；同配置的 Claude Design 70.87，差 **7.45** 分；OpenDesign 69.45，差 8.87 分（数值与 Section 5.1 叙述一致）。
- AutoDesign + Codex + GPT-5.5 = 77.97。
- 裸 coding agent：Codex/GPT-5.5 = 73.37，Claude Code/Claude 4.8 = **70.01**（贡献 3 说挂上 DesignHarness 可 +8.31，即 78.32）。Doubao/Seed 2.1 = 61.14，GLM 5.2 = 52.22，Kimi K2.7 = 51.46，DeepSeek V4-Pro = 46.01。
- 人工手写工作流：PosterGen 56.71、Any2Poster 49.09、Paper2Poster 44.61。注意 Paper2Poster 的 Density 高达 8.36 但 Coverage 仅 2.35、Aesthetics 1.69，Any2Poster 的 Layout 9.59 全表最高但 Coverage 5.44——说明单维刷高与整体质量脱钩。
- 值得注意的反向项：AutoDesign 的 **Visual Evidence 5.97、Aesthetics 5.59**，都**低于** Claude Design（7.62 / 7.36）和裸 Claude Code（7.01 / 6.53）。它靠 Density（8.41 vs 6.48 / 5.71）和 Readability（8.17 vs 5.96 / 6.68）取胜，而这两维正是权重最高（15 + 25 = 40）的那两维中的核心。换句话说，**演化把系统推向了评分函数最看重的方向，同时在美学与视觉证据上出现退化**——这与 Figure 1a 里 plateau 时仍标注 "✗ Information sparse figures" 一致。

**mini 主赛道（Table 2，10 篇）**：AutoDesign + Codex/GPT-5.5 = **81.46**（裸 Codex 75.87）；AutoDesign + Claude Code/Claude 4.8 = 74.56（裸 69.55）。

**七个受控 code-agent–model 配置（Table 4，harness-attachment 消融，mini 10 篇）**：模型与 coding agent 固定，只切换有无 DesignHarness。

| 配置 | Original | +AutoDesign | Gain |
| --- | --- | --- | --- |
| GPT-5.5 / Codex | 75.87 | 81.46 | +5.59 |
| Claude 4.8 / Claude Code | 69.55 | 74.56 | +5.01 |
| Seed 2.1 Pro / Claude Code | 54.01 | 71.83 | +17.82 |
| Kimi K2.7 / Claude Code | 57.20 | 70.12 | +12.92 |
| GLM 5.2 / Claude Code | 50.32 | 64.33 | +14.01 |
| LongCat 2.0 / Claude Code | 43.26 | 55.13 | +11.87 |
| DeepSeek V4 Pro / Claude Code | 34.73 | 54.29 | +19.56 |

七配置均值 54.99 → 67.39，增益区间 5.01–19.56 分（Section 5.2.1）。摘要把它写成 "+12.4%"，但按表算是 **+12.40 个绝对分点**（相对增幅约 22.6%）——摘要的百分号是笔误级别的表述不一致。规律很清楚：**基座越弱，harness 收益越大**；harness 主要在补弱模型的执行与自检能力，对 GPT-5.5 这类强模型只剩 5 分左右。作者给出的一条机制解释是 MLLM 独有的修复信号：每次尝试都把上一轮的渲染预览作为视觉上下文喂回，让模型能定位纯文本诊断抓不到的 layout/裁切/视觉证据失败。

**三个受控赛道（Table 3，mini）**——这是"哪个组件真正起作用"的关键：

- (a) Design Harness Track（固定 Claude Code + Claude 4.8）：AutoDesign 74.56 > OpenDesign 70.36 > Claude Design 66.83。harness 层的净贡献约 4–8 分。
- (b) Coding Harness Track（固定 AutoDesign + GLM 5.2）：**Kimi Code 82.31** > ZCode 69.53 > OpenCode 67.87 > Claude Code 64.33。**跨度 17.98 分**，是三个赛道里最大的。也就是说，在固定 design harness 与模型的条件下，换 coding harness 带来的方差**超过**换 design harness、甚至超过换模型。这一点作者只客观陈述（"Kimi Code achieves the highest score at 82.31"），未展开讨论其含义（此处原文表述模糊，未解释 GLM 5.2 + Kimi Code 为何能反超 Claude 4.8 配置）。
- (c) Model Track（固定 AutoDesign + Claude Code）：Claude 4.8 74.56 > Seed 2.1 Pro 71.83 > Kimi K2.7 70.12 > GLM 5.2 64.33 > LongCat 2.0 55.13 > DeepSeek V4 Pro 54.29，跨度 20.27 分。

**演化轨迹（Figure 1a，单篇代表论文）**：初始 harness 49.00 → 自主优化 plateau 80.88 → 人工引导重定向后 final 88.39；同图给出 handcrafted workflow 56.30 作参照。plateau 前后的失败标注变化很有信息量：初始是"证据稀疏 / 阅读流破碎 / 版面填充不足"，plateau 时"内容流结构化 / 表格有据"但仍"图信息稀疏"，最终"视觉丰富 / 内容连贯 / 密而可读"。

**成本–性能（Figure 8，mini）**：Pareto 前沿为 LongCat-2.0（55.13 @ `$0.27`/张）→ Doubao Seed 2.1 Pro（71.83 @ `$2.75`）→ Claude 4.8（74.56 @ `$7.63`）→ GPT-5.5（81.46 @ `$10.02`）。Doubao 以 27% 成本达到 GPT-5.5 的 88% 分数。LongCat 的 `$0.27` 依赖其评测时的缓存命中不计费策略（脚注 1/2）。

**人评（Section 5.3，Figure 9）**：AutoDesign BT 点估计 **64.0%**（95% 区间 55.2–77.8），高于 Claude Code 51.7、OpenDesign 43.4、Claude Design 40.9。tie-adjusted 逐对胜率：vs Claude Code 61.3%、vs OpenDesign 63.1%、vs Claude Design 67.6%；逐对样本量 n=155/156/156。完整 roster 为 $\binom{4}{2}\times 100 = 600$ 任务/人，实际提交 936 份，未完成任务不做插补。

**定性轨迹（Section 5.4，Figure 11）**：单次运行五个选定尝试，A1（0.36）critic 发现 analysis lane 被裁切 → A3（0.42）行高重分配解除约束 → A5/A6（0.62）header 重排 + 证据缩放形成更平衡的层级 → A9 以 0.78 被接受。编辑始终局部化，有效布局与源内容跨修订保留。

## 5. 局限与作者自述的边界

作者自述（Section 6、海报 Section 9、Section 3.2）：

- **只在论文转海报上验证**。"PosterBench formally evaluates academic posters only; the slide, webpage, and video artifacts therefore remain pilots."（Figure 13 的幻灯/网页/会议视频只是 pilot。）
- **每轮只改一个组件**，作者的理由是保持 credit assignment 可解释；代价是无法做需要跨组件协同的改动，且搜索效率受限。
- **不做树搜索**，单一活跃 harness 路径，容易陷入局部最优——这正是必须引入 human-in-the-loop 的原因（Figure 1a 的 80.88 plateau 是直接证据）。
- **组件选择器与评估器演化是 open problem**。作者写：selector 应该基于 failure attribution、不确定性、期望改进与组件交互来选下一个有界更新（现在是怎么选的，原文未给出明确机制，只说由 planner 从证据里"formulate"）。
- **评估方法的自我强化风险，作者自己点出来了**。Section 6 原文："Any adaptive evaluator must remain versioned and anchored by frozen reference tasks, adversarial probes, and periodic human audits so optimization doesn't reward-hack a moving target." 当前做法是把 $R_{\text{meta}}$ 在每次优化 run 内冻结、并把最终评测交给独立冻结的 PosterBench + 盲测人评。
- **评估器 bias 无法自主发现**：Section 3.2 明确 "$R_{\text{meta}}$ remains fixed because the meta-harness receives no external signal with which to identify or correct evaluator bias"。也就是说系统在评估器维度上**没有**自我纠错能力，只能靠人看图发现偏差后触发修订。

我在核对中另外注意到、作者未充分展开的几处：

- **Goodhart 的实证痕迹已经出现**：如第 4 节所述，AutoDesign 在高权重维度（Density 15、Readability 25）显著领先，却在 Visual Evidence 与 Aesthetics 上低于 baseline。这是"演化对齐评分函数而非对齐人类"的直接症状，而这两个落后维度恰好是纯/半 VLM 判断维度。
- **人评的统计效力偏弱**：Krippendorff 0.101、BT 区间下界 55.2%、poster 级 $r=0.34$、0–3 分差一致率 51.9%。人评支持"AutoDesign 更受偏好"的方向性结论，但不足以支撑细粒度分数差的可信度。
- **训练/开发集与 PosterBench 的关系未披露**：$N_{\text{train}}$、$N_{\text{dev}}$、papers 是否与 100 篇主赛道或 10 篇 mini 重叠，原文未给出。mini 被同时用作"受控消融集"和 Figure 8 的成本分析集；若 mini 与优化期的 train/dev 有交集，Table 3/4 的解释力会被削弱（原文未说明，此处存在信息缺口）。
- **单点数字与主表口径不同**：Figure 1a 的 49.00/80.88/88.39 是"某一篇代表性论文"的分数，不是基准均值，不能与 78.32 直接比较。

## 6. 对"冻结参数 skill / harness 自进化"这条线的意义

把它放到几个坐标轴上看：

**轴一：演化对象的粒度。** 从 prompt/组件（TextGrad、DSPy、GEPA）→ 工作流图/代码（STOP、GPTSwarm、ADAS、AFlow）→ 整个 harness 代码库（Self-Improving Coding Agent、MOSS、Meta-Harness、HarnessX、Self-Harness、Agentic Harness Engineering）。AutoDesign 站在最粗的一端，但用"五组件分解 + 每轮改一个"给这个粗粒度对象加了**结构化的 credit assignment 约束**。这与 DarwinX/HSI 一路"直接改 agent 源码/skill 库"的做法相比，是把演化搜索空间显式分区，牺牲搜索自由度换可归因性。

**轴二：演化物的载体形式。** MetaSkill-Evolve 类工作的载体是**可复用 skill 条目**（离散、可增删、可检索）；AutoDesign 的载体是**可执行 harness 代码 + 仓库 checkpoint**，skill 只是其 Context-and-Memory 组件里的一项。前者演化"知识条目"，后者演化"生产系统"。AutoDesign 的经验是：一旦载体是可执行系统，规则校验器（rule-based validator + blocking check）就能作为**廉价、确定性的验证信号**，这是 skill 库形式很难获得的。

**轴三：验证信号的独立性。** 这是 AutoDesign 相对同类最值得抄的一点。它有三级隔离：优化期 $R_{\text{meta}}$（会被优化压力污染）→ dev 集 acceptance gate（对 optimizer 完全不可见）→ 最终 frozen PosterBench + 系统盲测人评（外层循环无法触碰）。HELIX/HSI 一类"自评自改"的设计如果只有一级信号，几乎必然 reward-hack；AutoDesign 用 held-out gate 明确对标 Recursive Self-Evolving Agents（Nguyen et al., 2026）的做法。它自己也承认这套隔离不彻底——$R_{\text{meta}}$ 与 PosterBench 共用同一套七维词汇。

**轴四：自主性程度。** DarwinX / Darwin Gödel Machine 追求开放式、无人干预的演化（树搜索、种群、archive）；AutoDesign 是**单路径 + 人工引导拐点**。Figure 1a 的 80.88 → 88.39 是这条线上的一个重要经验数据点：**纯自主 harness 演化会 plateau，而 plateau 的突破来自人给的方向而不是更多算力**。对"冻结参数自进化"的实践者，这提示 plateau 检测与人工 redirect 接口应该被当作一等设计，而不是补丁。

**它给这条线补上的独特东西**：一个**长程、多模态、审美主观**的任务域。此前 harness 自进化的验证场景多集中在 SWE / 编码 / 推理基准，这类任务有近乎客观的通过判据。AutoDesign 证明了同一套 meta-harness 范式在"没有单元测试可跑"的设计任务上也能跑起来——代价是必须自己造一套可程序化的代理指标（Layout/Density 的空间与 OCR 审计），并且必须承认这套代理指标与人类偏好只有 $r=0.34$ 的相关性。

## 7. 可复用的工程要点

1. **把演化对象显式分成 N 个功能组件，每轮只改一个。** AutoDesign 的五分法（Context & Memory / Tools & Specs / Execution Runtime / Orchestration / Evaluation & Feedback）可以直接搬到任何 agent harness 上。约束一次一个组件（允许跨该组件多文件）让每次涨跌都能归因到单一干预，也让"被拒的提案"变成有用信息而不是噪声。

2. **acceptance gate 必须用 optimizer 看不见的 held-out 集。** 具体实现就是式 6 的两条件：train 严格提升 + dev 不退化；并且在工程上确保 dev 的轨迹与分数**都不写进** optimizer 的持久上下文 $\mathcal{L}$。这是防止 harness 过拟合训练任务最低成本的措施。

3. **把优化记录 $\mathcal{L}$ 做成带仓库 checkpoint 的结构化日志。** 每轮存：harness 快照、轨迹与分数、被选组件、更新计划、代码 diff、接受/拒绝决策。收益有三：被拒后下一轮能换方向而不重复试错、支持回滚、支持事后复现。这比"把历史塞进 prompt"要可靠得多。

4. **让评分函数的高权重维度尽量程序化，把 VLM 判断压到低权重。** PosterBench 的 100 分里 Layout(20) + Density(15) 完全程序化，纯 VLM 只占 20 分。对应到工程上：优先造能确定性判定的检查（渲染完整性、溢出/重叠、OCR 覆盖率、数值与源一致性），VLM 只用于确实无法程序化的感知维度。同时对 VLM judge 屏蔽系统身份与生成 prompt。

5. **内层用"blocking check 早停 + 预算耗尽 fallback"的双出口。** $K=12$ 次尝试，任一候选通过全部 blocking check 立即终止；预算耗尽则从保留的尝试历史里按 fallback 序列挑一个仍满足安全与完整性约束的可交付候选。这避免了"要么无限循环要么交付废品"的常见失败。

6. **产物保持可编辑代码形态，并把上下文构建做成一次性的。** ingestion 阶段一次性抽出 metadata/outline/关键段落/图表 + 回源指针，跨所有 refinement 步复用；产物全程是可编辑 HTML，修订落成局部代码 edit 而非整体重生成。这同时降低了 token 成本、保留了 provenance 可核查性，并让最终产物直接可交付给人二次编辑。

7. **把 plateau 检测与人工 redirect 做成一等接口。** 引导以自然语言 $g_t$ 并入 planner 输入（式变为 $P(H_t,\tau_t,s_t,\mathcal{L},g_t)$），人只给观察与方向、不直接改代码；评估器的修订单独走一条需显式人工输入的通道。这样既保留了自主性，又在系统自身无法察觉评估器偏差时留了出口。
