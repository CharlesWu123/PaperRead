# Aspire：训练循环闭上了，能力循环还没闭上

> 只给一句「提升科学推理能力」式的宽泛目标，评测集全程保密——54 场自主后训练（24 场盲考 + 30 场带反馈搜索）里只有 1 场留下高于底座的保留增益，最强自生成 harness 也比不过手写的参考实现。

## 速览

- arXiv / 日期 / 机构：arXiv:2608.31111v1，cs.CL，2026 年 8 月 31 日提交（v1, Mon 31 Aug 2026 17:14:59 UTC），论文 Date 字段为 September 1, 2026。机构：ByteDance Seed、Singapore University of Technology and Design、M-A-P、TokenWave.AI。21 位作者，核心贡献者 Yuhao Wu、Jingyuan Zhang、Jiajun Shi；通讯作者 Yuhao Wu、Wenxuan Zhang、Shen Yan、Wenhao Huang、Ge Zhang。项目页 https://self-developing-agents.github.io/，属 self-developing-agents 研究三部曲。
- 是否冻结参数：**两面设计**。RQ1/RQ2 是权重更新面：agent 可以对底座（Qwen3.5-4B / Qwen3.5-9B）发起 SFT、GRPO、LoRA 等训练，参数不冻结；RQ3 是 harness 演化面：runtime 模型 Qwen3.5-4B 明确冻结（「RQ3 holds model weights fixed and shifts the object of evolution to the supporting agent harness」），「RQ3 does not update weights; creator-model and runtime inference therefore lie outside the training-GPU ledger」（§4.1、Appendix C.6）。
- 演化对象：RQ2 演化**模型权重**（数据选择、更新方法、超参、父本 checkpoint、继续/分支/停止）；RQ3 演化**agent harness**——「the runtime instructions, tool policy, workflow, memory, and validation logic around the model」（§2），一步生成 H1 后冻结（无 H1→H2 递归）。
- 验证信号来源：控制器侧 520 条专家撰写的 hidden evaluation items，按六个 goal 分成互斥组；agent 永远看不到 items、参考答案、rubric、judge 轨迹。adaptive-feedback 协议下 agent 只能拿到有界次数的 **aggregate 分数**（无逐题结果）；final-only 协议下提交终检前拿不到任何分数；RQ3 的分数完全不回传给 creator。判分用 gemini-3.5-flash judge（8,192-token thinking 预算，10% fail-closed 阈值）。agent 自建的 validation data 完全可见且不消耗隐藏查询额度。
- 一句话贡献：把「target operationalization」——把宽泛能力目标转换为可训练目标、学习信号与验证准则——形式化为自主后训练中缺失的一根轴，用密封评测 + 可审计轨迹证明：**关上训练循环不等于关上能力循环**（「closing the training loop is not yet the same as closing the capability loop」，§6）。

## 1. 问题：目标本身不给定的时候，自进化在优化什么

论文的出发点写在 §1 第一段：人类学习大多从一个宽泛方向开始——想成为更好的物理学家的人要自己选教科书、找练习、发现知识缺口、判断学习是否真的产生了进步。「Autonomous learning therefore involves three coupled decisions: what to improve, how to improve it, and how to verify the improvement」（§1）。

对照之下，现有 LLM 自进化工作的起点全是人类指定好的：任务、评测指标、可分解的奖励。§5 的文献地图把这个缺口画得很清楚——STaR/ReST-EM/Self-Rewarding LM/SPIN/R-Zero/Absolute Zero/SEAL 这条 self-evolution 线里，模型帮忙生成数据、奖励、任务或编辑，「but progress is measured against objectives that others defined」；PostTrainBench、LaMDAgent 这条自动后训练线给了 agent 底座、评测脚本与预算，但 benchmark 名字本身就写明了该优化什么。DGM/ADAS 这条改 agent 的线同样有显式 fitness。**所有这些工作里，三个耦合决策中的第一个（what to improve）都是人类替 agent 做掉的。**

于是 Aspire 的失效模式清单非常具体，而且后文的每个实验设计都能对应上：

1. **进度判据错位。** agent 只能对照自己可见的信号（上一个 checkpoint、自己的 validation 集）判断进步，而真正的判据是它看不见的 hidden evaluation。结论句是全文的核心主张：「progress must be judged against the base model rather than only against the previous checkpoint」（§6）。
2. **训练致回归被误读为进步。** §4 的 trajectory pattern 1 标题就叫「apparent progress can be recovery from training-induced regression」——一条正斜率的血统可能只是从被自己训练毁掉的水平爬回半山腰，离底座还差得远。
3. **自建验证的窄 proxy 特化。** RQ3 案例里 Luna 用一条 prompt 上的 8 项 checklist 从 7/8 改到 8/8 就停手，产物在 hidden set 上把机理类问题重构成「研究设计」问题（§4、Appendix D）。
4. **搜索量与搜索质量脱钩。** Sol 在 adaptive-feedback 协议里产出 33 个 evaluated checkpoint、烧掉 76.56 settled GPU-h，无一超过底座（§4）。

三个耦合决策（what / how / verify）在 Aspire 里被拆开检验：RQ1 隔离「what」——同样的 how 与 verify 接口，只把显式 benchmark 名换成宽泛描述；RQ2 把三个决定全部交给 agent（Self 配置连决策模型都是底座自己）；RQ3 把「what」交出去但把「被改的东西」从权重换成 harness。这个渐进结构（「a progression from controlled comparison to autonomous evolution」）本身就是论文的论证骨架。

值得注意的是这篇论文的姿态：它不是提出一个更强的自进化方法，而是提出一个**测谎仪**——一个让「执行了更新」和「保留了目标对齐的改进」必然分开记账的 benchmark。三个 RQ 的答案全是负结果或弱正结果，这在 self-developing-agents 三部曲里对应 TARGET 层：给定宽泛目标，让 agent 自己做目标操作化，而最终隐藏评测不给它看。

## 2. 方法详解

### 2.1 形式化：campaign 与三个固定件

Aspire 把一次自进化实验建模为一个 campaign：

$$\text{campaign} = (G,\ \mathcal{E}_G,\ J,\ \mathcal{A},\ B,\ \Sigma)$$

其中 $G$ 是自然语言 vague goal，$\mathcal{E}_G$ 是绑定到该 goal 的版本化 evaluator（items、答案、rubric、路由元数据、评分配置），$J$ 是需要模型判分时的 judge，$\mathcal{A}$ 是 typed action 契约，$B$ 是 campaign 预算，$\Sigma$ 是**预声明的**终局选择规则（§2）。每轮的输入状态包含三件东西：模型权重 $M_r$、agent harness $H_r$（围绕模型的运行时指令、工具策略、工作流、记忆与验证逻辑）、以及**决策模型** $D_r$——指导搜索的那个模型。关键不变式：evaluator 全程存在但「is never part of the agent's observation」（§2）。

这个三元组 $(M_r, H_r, D_r)$ 把「被演化的东西」和「指挥搜索的东西」拆开了——这是后文两个演化面的基础。

### 2.2 轮次结构：bounded search-and-commit

一个 evolution round 是一段有界的 search-and-commit 情节，轮内 $D_{r,j} = D_r$ 对所有交互步 $j$ 成立——决策模型在一轮里不动，而不是一次工具调用。$D_r$ 与固定的 creator 侧 scaffold $C_r$ 一起解读 $G$，可以提出多个数据操作、更新、验证、分支与候选状态才终止；「Different candidates therefore embody different goal operationalizations」（§2）——不同候选就是不同的目标操作化。轮终止后控制器可以复用 $D_r$ 或显式 promote 一个已验证的训练后代，写 $\mathcal{D}_r$ 为后代集合：

$$D_{r+1} \in \{D_r\} \cup \mathcal{D}_r$$

任何交接只发生在下一轮。这个机制在实验里实际上**没有被递归地跑**（RQ3 明确写了「No run evolves H1 into H2」），所以它是协议能力而非实证结论。

### 2.3 两个演化面

$$\mathcal{S}_M(H_0, D_r) = \{(M, H_0, D_r) : M \in \mathcal{M}\}, \qquad \mathcal{S}_H(M_0, D_r) = \{(M_0, H, D_r) : H \in \mathcal{H}\}$$

- **权重面**（RQ1–RQ2）：可变的是 $M$，$H_0$、$D_r$、控制器、evaluator 全部固定。agent 选数据、更新方法、超参、父本 checkpoint，以及继续/分支/停止。
- **harness 面**（RQ3）：可变的是 $H$，$M_0$、$D_r$、控制器、evaluator 固定。agent 编辑运行时 prompt、工具策略、工作流、记忆或验证程序，然后冻结一个版本化候选（§2、§3）。

### 2.4 信息边界：vague goal 协议的承重墙

这是全文机制设计最密的部分（§3.2、Appendix A.2、C.2）：

- **agent 看得见的**：自然语言 goal、公共历史、生命周期状态、合法请求类型、已批准标识符、剩余预算的有界投影（released view $q_{r,j}$）、以及**完全自建**的训练数据与 validation 数据。
- **agent 看不见的**：hidden evaluation items、参考答案、路由标签、rubric、候选输出、judge 轨迹。协议「returns no item-level result—only an aggregate score when feedback is permitted」（§3）。
- **防污染三道闸**（A.2）：(1) items 由领域专家从零撰写，公开 benchmark 只作任务原型与难度参照；(2) 冻结版本前做组内与跨组的 exact + semantic 去重，并对参照 benchmark 审计重叠；(3) campaign 内每次注册训练数据都过一道与 hidden set 的 exact + semantic 重叠闸，检测到匹配即拒绝，SFT/GRPO/continual-pretraining 一视同仁。
- **防契约漂移**（C.2）：每个 campaign 绑定 setting 标识符、prompt-profile 版本、渲染 prompt 的 SHA-256 与实验身份，创建与恢复时都校验——「a vague-goal run cannot silently resume under an explicit-task contract or a different prompt version」。显式任务契约额外披露任务格式、难度锚、指标与成功判据，但内容边界相同。
- **查询语义**（C.2）：agent 自建 validation 不消耗隐藏查询；adaptive-feedback 允许在记录的额度内对同一 goal 的 items 反复查 aggregate 分；final-only 只收一次终检；无效或重复请求不消耗额度，但已接受的预约若后续部署或评测阶段失败仍计数。没有任何协议会返回 items、答案、候选输出、rubric 或 judge 理由。

### 2.5 系统设计：一个 typed action 接口 + 可验证候选

agent 不操作 shell、不下载训练仓库、不自己搭运行时。Aspire 暴露**单一 agent 工具**，动作是 typed 且可组合的（Figure 3）：搜索/下载/导入公开数据集、合成并注册新数据、发起 SFT 或 GRPO（LoRA 或其他允许配置）、查询任务状态、在自己 validation 数据上构造并运行检查、分支或终止一条血统（§3）。接口只暴露**语义动作**——registration、training or editing、verification、validation、evaluation、branching、termination——而隐藏后端机制；「the agent makes strategic decisions, the controller executes and constrains them」（§3）。

控制器负责数据管理、任务调度、资源隔离与 checkpoint 验证。每一步的 released interaction：控制器持有私有状态 $E_{r,j}$，agent 收到 $q_{r,j}$；$D_r$ 与 $C_r$ 提出动作，控制器先验证再更新私有状态——接受的请求产生持久迁移，拒绝的请求返回 typed error 且**不产生任何 artifact 或分数**（§3）。

**可验证候选与可审计执行**（§3）：一个权重候选只有在控制器验证了其父本、注册数据、准入更新与完整 checkpoint 发布之后才可评估；harness 候选必须先版本化冻结再评估。无效、不完整、外来的或 agent 自造的 artifact 不能进入计分血统。接受的动作用 provenance、候选血统、资源使用、aggregate 提交与终局选择记录留档。

### 2.6 候选结局与安全回滚

对一轮内已验证候选集合 $\mathcal{K}$、入口状态 $Y^{\mathrm{in}}$，候选 $k$ 的原始分数变化（§2）：

$$\Delta^{\mathrm{raw}}(k) = \widehat{s}_\Gamma\big(Y(k)\big) - \widehat{s}_\Gamma\big(Y^{\mathrm{in}}\big)$$

$\widehat{s}_\Gamma$ 是 evaluator $\Gamma$ 下的聚合分。但 Aspire 不直接用 $\Delta^{\mathrm{raw}}$ 报告，而是拆成四层（C.1）：

- **evaluated**：任何拿到持久分数已验证候选；
- **eligible**：额外满足预声明的 provenance、exploration、completion、terminal-record 要求；
- **selected**：固定选择器与平局规则下得分最高的 eligible checkpoint；
- **retained**：**只有 selected 超过 base 分数时才保留该 checkpoint，否则控制器回滚到底座**。

作者的记账理由写得很明白：「a high intermediate score may come from an incomplete run, while a nonnegative retained score may reflect rollback rather than learning」（C.1），以及「The nonnegative retained improvement follows from safety rollback and is therefore a selection outcome, not evidence that every attempted update improves capability」（§4）。也就是说，Aspire 的任何「正结果」在构造上都是保守的：回滚是协议内置的，不是事后补救。

### 2.7 隐藏评测集：六个 goal，520 条 items

评分协议的工程细节（C.3）：evaluator 跑成本地进程；checkpoint 推理统一用 no-thinking 模式（否则决策模型是否开思考会成为不可控变量）；gemini-3.5-flash 作 judge，thinking 预算 8,192 token，10% fail-closed 阈值（不确定即保守判负）；checkpoint 部署用 8 张 GPU，评完即清理。所有评测参数（items、scorer/judge、解码与聚合规则、查询额度、eligibility 要求、终局选择器、tie-breaking）在执行前固定（C.1）——这也是「预声明」能当安全语义用的前提。

| Vague goal | 评测组 | 条数 |
| --- | --- | --- |
| Scientific and academic reasoning | Science and academic reasoning | 75 |
| Humanities and social-science knowledge | Humanities and social sciences | 110 |
| Health and medical reasoning | Health and medicine | 100 |
| Mathematical reasoning | Mathematical reasoning | 126 |
| Logic, reliability, and instruction following | Logic, reliability, and instruction following | 89 |
| Academic and scientific writing | Academic and scientific writing | 20 |
| 合计 | 六个互斥组 | 520 |

第五个 goal 是刻意复合的：当前协议不声称逻辑推理、抗幻觉与指令遵循是三个可独立辨识的目标，而当作一个整合的 reliability 目标（A.1）。写作组的 20 条是 20 个顶层 task bundle，其 harness evaluator 在一个 task 内可能产出多个被评分 example——这就是 RQ3 同时报告 task macro（items 等权）与 example micro（被评 example 等权）的原因（A.1）。

## 3. 实验与结果 I：RQ1——把显式任务换成 vague goal 会怎样

**设置**（§4.1、§4.2 Setting、Appendix B）。RQ1 是 PostTrainBench 的 vague-goal 镜像：保留 PostTrainBench 的 post-training 接口与每个原始 sealed task evaluator，把 benchmark 名称（显式任务标识）替换为一段宽泛能力描述，于是 agent 必须自己选一个具体目标、一个 proxy 训练任务和一种验证方法。决策模型为 Claude Opus 4.8 与 GPT-5.6，参照系是 PostTrainBench 发布的官方数字（Claude Opus 4.8 Max 与 GPT-5.6 系统）。作者明确声明这不是 prompt-only 因果对：官方分数是 system-level 参照，「share the benchmark definition and aggregation weights, but are not treated as prompt-only causal pairs」；matched 轨迹对比也只用于过程描述。

**分数对比**（Table 3，Figure 4(a)）：

| Benchmark | 官方 Claude Opus 4.8 Max | Vague goal Claude Opus 4.8 | 官方 GPT-5.6 | Vague goal GPT-5.6 |
| --- | --- | --- | --- | --- |
| AIME 2025 | 10.83 | 5.83 | 7.50 | 3.75 |
| GPQA Main | 28.35 | 24.89 | 30.13 | 27.04 |
| HealthBench | 31.68 | 12.62 | 27.39 | 9.93 |
| HumanEval | 47.33 | 56.63 | 63.95 | 56.40 |
| GSM8K | 68.87 | 66.98 | 69.48 | 74.35 |
| ArenaHard | 36.09 | 13.07 | 26.40 | 21.72 |
| BFCL | 47.13 | 58.63 | 94.38 | 79.38 |
| **加权平均** | **32.90** | **27.07** | **36.23** | **29.58** |

加权平均分别掉 5.83 与 6.65 分，但任务级并不一致：vague-goal Claude 在 HumanEval（47.33→56.63）与 BFCL（47.13→58.63）反超，vague-goal GPT-5.6 在 GSM8K（69.48→74.35）反超；掉得最惨的是 HealthBench（31.68→12.62）与 ArenaHard（36.09→13.07）。作者的判读很克制：不假设任务级均匀退化，但聚合缺口成立。

**过程对比**（Appendix B 的 matched process accounting，48 对 Claude Opus 4.8 匹配 run 对，同决策模型、同底座、同 benchmark 叶子、同 trial 序号，剔除反作弊命中与只返回 fallback base 的对；每 trial 占一块 H20 sandbox GPU 至多 10 小时）：

- vague-goal 轨迹多 2,109 秒决策模型思考时间，每匹配对多 0.61 GPU-idle 小时，而活跃训练+评测时间减少 1.27 小时（Figure 4(b)）；
- agent 可见的任务材料与 proxy 评测脚本访问密度变为 2.98× 与 2.39×；
- 独立 trace 抽样中工具动作数不升（188.5 → 179.2），LoRA 使用更频繁。

作者自己声明这些是描述性偏移、「do not establish that one displaces the other or identify which choice causes the final score gap」。

**官方轨迹对照**（C.2，对 112 条官方轨迹跑同一解析器，两个官方系统各 56 条）：vague-goal Claude Opus 4.8 平均每轨迹 3.54 次评测、6.17 次训练启动（0.57 次/启动）；官方 Claude Opus 4.8 Max 为 2.89 与 5.14（0.56/启动）；官方 GPT-5.6 为 39.21 与 14.91（2.63/启动，4.6× 的反馈密度）。官方 Claude Opus 4.8 Max 每轨迹 165,851 个 thinking 字符，官方 GPT-5.6 只有 30,895——前者深审慎、后者高频实验两种 profile（§4）。

**RQ1 答案**（§1）：「Vague goals redirect search effort toward goal interpretation and operationalization and, in the evaluated settings, yield lower aggregate outcomes than the corresponding explicit-task references.」——vague goal 把搜索精力重定向到目标解释与操作化上，聚合产出更低。

## 4. 实验与结果 II：RQ2 与 RQ3

### 4.1 RQ2 final-only 协议：24 次终检，只有 3 次超底座

设置：Qwen3.5-4B Self 与 Qwen3.5-9B Self（底座模型自己当决策模型）各优化六个 goal，每个 model–goal 对独立跑 A、B 两次终局 run，共 24 run；每 run 40 GPU-h 内可启动多个训练任务但只能提交**一个**终检 checkpoint；报告 Avg@2（两次终检分的算术平均，不是 best-of-two）。evaluator 为本地进程，checkpoint 推理用 no-thinking 模式，gemini-3.5-flash 判分，部署用 8 张 GPU（C.3）。

| Vague goal | 4B Base | 4B Run A | 4B Run B | 4B Mean | Δ | 9B Base | 9B Run A | 9B Run B | 9B Mean | Δ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Scientific and academic reasoning | 44.000 | 0.000 | 0.000 | 0.000 | −44.000 | 45.330 | 48.000 | 48.000 | 48.000 | +2.670 |
| Humanities and social sciences | 18.820 | 9.000 | 5.909 | 7.455 | −11.365 | 27.450 | 10.273 | 9.091 | 9.682 | −17.768 |
| Mathematical reasoning | 17.860 | 16.746 | 0.159 | 8.452 | −9.408 | 25.160 | 0.714 | 2.540 | 1.627 | −23.533 |
| Health and medicine | 87.000 | 63.000 | 68.000 | 65.500 | −21.500 | 87.000 | 71.000 | 72.000 | 71.500 | −15.500 |
| Logic, reliability, and instruction following | 27.460 | 21.437 | 23.754 | 22.596 | −4.864 | 26.190 | 6.141 | 16.338 | 11.240 | −14.950 |
| Academic and scientific writing | 19.270 | 0.000 | 15.308 | 7.654 | −11.616 | 22.930 | 23.588 | 0.000 | 11.794 | −11.136 |

关键数字：**12 个 model–goal 对里只有 1 个两 run 均值超底座**（9B 科学推理，45.33→48.00，+2.67；两次 run 都是 48.00）；4B 是 0/6，9B 是 1/6。**逐 run 层面 3/24 个终检超底座，其余 21/24 由 rollback 保留底座模型**。六 goal 均值从 35.735 掉到 18.609（4B）、从 39.010 掉到 25.640（9B）。最触目惊心的是 4B 科学推理：base 44.0，两个 run 的终检都是 0.000——agent 自己挑的数据和训练配方直接把能力打到零；写作 goal 上 4B 的 Run A 也是 0.000 而 Run B 是 15.308，同配置两次独立 run 差出一个数量级，方差本身就是结论的一部分。

### 4.2 RQ2 adaptive-feedback 协议：30 格里唯一一次保留增益

设置：完整的 5×6 设计（每格一条 run，非多种子估计）。五个配置 = Qwen3.5-4B Self、Qwen3.5-9B Self，加上 GPT-5.6 Luna / Terra / Sol 三个**外部决策模型**操作同一个 Qwen3.5-4B 底座。agent 可在额度内反复查询同一 goal items 的 aggregate 分数，用它选择后续更新、分支或停止点——「a sparse black-box outcome channel」（§3.2）。总账：30 run、124 个训练 plan、107 个 job、322.610 settled 训练 GPU-h，每格 40 GPU-h 与 10 小时墙钟（Table 5、C.6）。

结果（§4、C.4）：

- 30 格中 **28 格产出至少一个 evaluated checkpoint**，21 格满足 eligibility；但**只有 2 格的 best evaluated checkpoint 超过底座**：Qwen3.5-4B Self 科学推理 44.00→45.33（未保留——Self 没有任何格保住超底座模型），Terra 数学 17.86→20.10（**唯一**一个「超底座 + 过 eligibility + 过 rollback」的保留增益）。
- 22 个有 ≥2 个 evaluated checkpoint 的格里共 62 个连续转移：28 升、13 平、21 降。later search 在 14/22 格胜过第一个 evaluated checkpoint——但作者立刻拆穿这个统计：**trajectory pattern 1「apparent progress can be recovery from training-induced regression」**——Qwen3.5-4B Self 数学从 0.79→1.75→2.38 一路正斜率，离 17.86 的底座还差一个数量级（Figure 7(c)）。
- 外部决策模型各有所长但整体更差：best evaluated checkpoint 里 Luna 最高的是 humanities 7.27 与 logic 20.39，Terra 是 mathematics 20.10 与 writing 16.01，Sol 是 science 30.67 与 medicine 11.00；**六个 goal 里五个连最高分都低于底座**。
- **trajectory pattern 2「more search does not mean better search」**：Sol 搜索最宽（33 个 evaluated checkpoint、76.56 settled GPU-h），无一超底座；Terra 的数学血统后代从 20.10 跌到 2.78 再恢复到 18.17——唯一保留增益的同一条血统内部方差就吞掉了增益本身。
- RQ2 答案（§1）：「Agents routinely complete data selection, training, and checkpoint generation, but above-base improvements on hidden evaluation data remain rare and not reliably retained through continued search.」

### 4.3 RQ3 harness 演化：最强后继仍输给手写参考

设置（§4、§3）：runtime 模型固定为 Qwen3.5-4B，参考 harness 是**原版 Qwen-Agent**。同一可编辑契约下，四个 creator 各尝试从同一 $H_0$ 生成一个后继 harness $H_1$：Qwen3.5-4B Creator 与 GPT-5.6 Luna / Terra / Sol。产物冻结后在**学术与科学写作 goal 的同一批 20 条 hidden items**上各执行三次（三次测的是冻结 harness 的运行时方差，不是三次独立演化）；分数不回传 creator。每条件只有一条 creation 轨迹；没有 $H_1 \to H_2$，所以测的是**一步 harness 生成**而非递归演化。

| 配置 | Task macro | Example micro |
| --- | --- | --- |
| 原版 Qwen-Agent 参考 | 28.64 | 27.65 |
| Qwen3.5-4B Creator（无有效 harness） | N/A | N/A |
| GPT-5.6 Luna 后继 | 19.32 | 18.33 |
| GPT-5.6 Terra 后继 | 20.76 | 20.14 |
| GPT-5.6 Sol 后继 | 27.22 | 25.97 |

三个有效后继全部低于参考：Sol 最接近（27.22/25.97，task macro 差 1.42 分），Terra 20.76/20.14，Luna 19.32/18.33。Qwen3.5-4B Creator 连一个有效 $H_1$ 都没产出，按预声明失败规则记零。计算账上 RQ3 训练 GPU-h 为 0（不更新权重，creator 与 runtime 推理都不入训练账，Table 5、C.6）。

Appendix D 的三条 creator 轨迹案例是全文机制层面最有信息量的段落：

- **Luna：窄验证 proxy 上的早停。** 用一条 validation prompt 的 8 项 checklist 给 $H_0$ 打出 7/8，加一个覆盖研究问题、设计、分析、风险与局限的五段固定模板后到 8/8，两个相似 prompt 也 8/8，约 40 分钟后停止。这个模板在 hidden set 上确实提升结构完整性，但**把关于机理、公式、参数或工程细节的直接问题重构成研究设计问题**而不给出被要求的技术内容——「the validation gain and the 19.32 task-macro mean ... are consistent with specialization to a narrow proxy rather than broad improvement」（§4/D）。
- **Terra：删掉了会编造的 reviewer，却漏了 final-answer invariant。** Terra 正确地移除了一个会凭空发明显著性结果与效应量的两遍 reviewer，改加对假设、模型调用、日志与计算器使用的窄护栏——但缺少输出完整性不变式：calculator 调用后若最终模型响应为空，harness 会提交 pre-tool 片段。一次受检执行里两个任务分别交出 342 与 520 字符的部分草稿，分数从 $H_0$ 的 75.00 与 52.33 掉到 2.57 与 2.91，**这两项约占该执行总降幅的 70%**。
- **Sol：宽测试 + 保守选择。** 搜索 3 小时 11 分，跨自己验证数据的四类任务与多个 prompt/工具变体，即使某些变体验证分更高也因为有幻觉、延迟或工具控制失败而拒绝；最终编辑只检查最后一条模型响应是否完整。

RQ3 答案（§4）：「One-step harness evolution can produce executable and behaviorally distinct successor harnesses, but all three valid successors remain numerically below Qwen-Agent. Their trajectories expose bottlenecks in validation diversity and output integrity.」正文把 RQ3 的发现压成两条 trajectory pattern，与 RQ2 的两条一一镜像：

- **pattern 1「narrow agent validation can specialize the harness to the wrong proxy」**——对应 Luna 案例，也与 RQ2 的「正斜率是爬坑」同源：自己可见的信号怎么涨都可能是拟合了错的 proxy；
- **pattern 2「answer review does not guarantee output integrity」**——对应 Terra/Sol 案例：即使审稿逻辑正确（Terra 删掉编造者、Sol 拒绝幻觉变体），缺一条输出完整性不变式就能让 70% 的降幅来自两个提交残稿的任务。

换句话说，RQ3 把 RQ2 的「训练致回归」翻译成了 harness 语言：权重面是训练配方毁掉能力，harness 面是验证盲区与输出管线漏洞毁掉能力——两个面上的「执行了更新」都远早于「保住了目标对齐的改进」。

### 4.4 可审计轨迹与算力账

C.5 定义了 portable adaptive-feedback artifact：包含计数、时间戳、源 hash、资源使用、提交与选择记录，**排除** hidden items、原始模型消息、命令输出与逐条 judge 理由。确定性抽取覆盖每个 configuration–goal 格，读取 63,973 条 agent 事件、1,196 条训练事件、2,194 条 phase 事件，恢复出 124 个训练 plan 与 95 次 candidate-evaluation 尝试，两轮独立人工复核检查任务级解读——所以论文的轨迹级论断（探索、checkpoint 推进、选择、回滚）有账可查，而 item 级因果分析需要受控访问。

算力总账（Table 5、C.6）：adaptive-feedback 协议 30 run / 124 plan / 107 job / 322.610 settled 训练 GPU-h（每格上限 40 GPU-h、10 小时墙钟）；final-only 协议 24 run / 83 job / 149.236 GPU-h（Qwen3.5-4B 59.269、Qwen3.5-9B 89.967）；RQ3 训练 GPU-h 为 0（不动权重，creator 与 runtime 推理不入训练账）。注意 322.610 远低于 30 × 40 的理论上限，论文口径是「settled（结清）训练 GPU 小时」，且 124 个 plan 只落地 107 个 job——也就是说预算是上限而非消耗量，报告的是真实完成的训练时数（具体结清规则原文未展开，此处为抓取文本的边界）。

## 5. 局限与作者自述的边界

作者自述（§6 结论末尾 + 各处限定句）：

- **结论范围**：受六个 goal 及其 520 条专家撰写 items 的覆盖与评分质量限制；每个 configuration–goal 格只有一条 canonical adaptive-feedback run（明确说了不是多种子估计）；内容级 trace 证据仅受控访问可得。未来方向：更宽的 goal 覆盖、重复 run、刷新评测版本、以及**能控制漂移与无关能力损失的递归演化**。
- **RQ1 不是因果对**：官方数字是 system-level 参照，与 vague-goal 结果共享 benchmark 定义与聚合权重但「not treated as prompt-only causal pairs」；过程统计也只是描述性偏移。
- **RQ3 的比较是描述性的**：Table 1 报三次执行均值但「Per-execution dispersion is not reported, so differences between executable harnesses are descriptive」；Appendix D 明确声明案例是 case evidence，不是额外重复或稳定排序。
- **保留增益不等于学习证据**：「The nonnegative retained improvement follows from safety rollback and is therefore a selection outcome, not evidence that every attempted update improves capability」（§4）。
- **递归没测**：$D_{r+1} \in \{D_r\} \cup \mathcal{D}_r$ 的交接与 $H_1 \to H_2$ 都停留在协议层。

我认为仍然存在、而作者没有充分处理的问题：

- **统计功效弱到几乎不能支撑任何方向性结论。** RQ2 的唯一保留增益（Terra 数学 +2.24 分）出现在 30 格中的 1 格，而同一条血统的内部轨迹 20.10→2.78→18.17 显示单格方差就与「增益」同量级；RQ3 的 Sol 27.22 vs 参考 28.64，20 条 items、三次执行、无离散度报告——1.42 分的差距在这个样本量下基本是噪声。论文诚实地标注了这些，但标题式的「remains below a fixed reference」仍会被读成比实际更强的结论。
- **六个 goal 更像知识域抽样而非能力目标。** science / humanities / medicine 三项本质是知识问答，把它们叫「vague goal」的操作化，很大程度上等价于「猜中评测分布是知识型 M/C 还是问答型」。真正宽泛的能力目标（比如「更可靠地用工具」「更会写长文」）只有一个半（写作 20 条、复合 reliability 89 条）。vague goal 的难度谱系没有被探讨。
- **底座被打到 0 分的机制没有分析。** 4B 科学推理 base 44.0、两次终检 0.000；写作 Run A 0.000 vs Run B 15.308。这是「训练致回归」的极端形态，但论文只把它当作轨迹 pattern 的证据使用，没有拆解是数据选择问题、配方问题还是灾难性遗忘——而这恰是 TARGET 层最值得知道的技术细节。
- **judge 是软肋但只在局限里一笔带过。** 520 条 items 的评分靠 gemini-3.5-flash（8,192 token thinking、10% fail-closed），fail-closed 阈值意味着最多一成的判分被保守丢弃；判分质量直接决定「超底座」判定的符号，而论文对 judge 的一致性没有给出独立校准。
- **反馈协议的额度值没披露。** adaptive-feedback 的查询额度（「bounded number of queries」「recorded allowance」）具体数值在抓取范围内未给出，而官方 GPT-5.6 的 2.63 次/启动 vs vague-goal 0.57 次/启动的对比说明反馈密度可能是重要变量——额度不透明让「sparse black-box channel 到底多稀疏」无法复现。
- **外部决策模型 Luna/Terra/Sol 的差异未说明。** 三个 GPT-5.6 配置具体差在哪里（persona？推理档位？）在正文抓取范围内没有交代，而这三个名字承担了 RQ2/RQ3 的全部外部对照。
- **负结果与「做不到」之间隔着一层基线缺失。** 论文没有给「人类专家在同样信息边界下操作同一接口」的对照——vague goal 操作化到底有多难，需要一个非 LLM 的锚点才能定性。

## 6. 对「递归自进化」这条线的意义

放在这个论文库里，Aspire 的位置很特殊：它是三部曲里 **TARGET 层的测量仪**，而这个库里的其余工作几乎全部假设 TARGET 已经被解决。

**轴一：目标从哪来。** DIVE、MetaSkill-Evolve、DarwinX、HSI、MGM、AutoDesign 这一批工作的共同前提是有明确任务分布或自带 verifier 的基准——fitness 信号是给定的。Aspire 把这个前提抽掉：agent 拿到的只有一句自然语言，连「什么算进步」都要自己发明。结果是所有现成机制（skill 演化、种群选择、血统重组）在这个设定下都还没来得及上场，卡点出现在更上游：目标操作化与自验证。这补上了坐标系里缺失的一格——它测的不是「演化机制多强」，而是「演化机制的前提是否成立」。

**轴二：进度判据。** Aspire 最可迁移的一句话是「progress must be judged against the base model rather than only against the previous checkpoint」。这与 DarwinX 的 preservation probe / avg@k 确认是同族设计，但动机更深一层：DarwinX 防的是基准噪声下的假胜利，Aspire 防的是**训练自己造成的回归被后来的恢复掩盖**。对任何做自进化的系统，这是零成本可抄的评测纪律：每个候选既对照父本也对照初始底座，两个都记。

**轴三：自评偏差这条线的又一实证。** 本库的 skill-misevolution、DIVE 的 verifier 依赖都在讲「自撰验证不可靠」。Aspire 给了三个新的失败形态：Luna 的窄 proxy 特化（自验证满分、隐藏评测 19.32）、Terra 的输出完整性漏洞（harness 层一个缺失的不变式贡献 70% 降幅）、RQ2 的正斜率幻觉（0.79→2.38 的「进步」离底座 17.86 十万八千里）。三者共同点：**agent 的一切自建信号在统计上都偏向乐观，而唯一不偏乐观的信号（hidden eval）在部署场景里恰恰不存在**。这是 TARGET 层的核心困难，也是 Aspire 作为负结果的价值所在。

**轴四：与 PostTrainBench 系的分工。** PostTrainBench 给显式任务，Aspire 是它的 vague-goal 镜像（保留接口与 evaluator，只换目标文本）；RSIBench-Data 发现多数持续搜索收在自己最好 checkpoint 之下——作者明确把这与 Aspire 的「candidate progress vs retained gain」区分相连；AI4AI-Bench 让 agent 在隐藏评测下重写训练算法而多数提交不改学习方式。Aspire 在这条「自动后训练 benchmark」线里的独特性是**同时覆盖权重与 harness 两个面**，且用同一套信息边界与回滚记账。

**轴五：对 DGM/STOP/DarwinX 的反向校准。** DarwinX 报告 +7.7 到 +49.5 的 harness 增益，Aspire 的 RQ3 最好情况是 −1.42。差距不在「harness 演化有没有用」，而在**选择信号**：DarwinX 的循环每一步都吃真实 verifier 的 avg@k；Aspire 的 creator 在评估前就被冻结、分数永不回传，等于在一个没有任何外部反馈的通道里做一步生成。两个结果合起来读才是完整命题：harness 演化的收益几乎全部来自外部选择信号，没有选择信号的一步生成连参考实现都追不上。这对「递归自进化」的启示是冷的——递归的每一层都需要一个不被自己污染的信号源，Aspire 证明把这个信号源藏起来之后，现在的模型还不能自己造一个等价的出来。

还有一个工程谱系上的观察：Aspire 的「四层候选记账（evaluated/eligible/selected/retained）+ 协议内置回滚」把安全语义做进了 benchmark 而不是部署层。论文库里的冻结参数演化工作大多把「不退化」当优化目标，Aspire 把它当**评测协议**——退化在报告里永远显式为 rollback 次数而不是被 best-of-k 吞掉。

## 7. 可复用的工程要点

1. **进度永远双对照：对父本也对初始底座。** 单对照父本会把「从自己造成的损伤里恢复」记成进步（Aspire Figure 7(c)：0.79→1.75→2.38 vs base 17.86）。两行代码的事，防的是自进化系统里最常见的记账错误。
2. **把候选结局拆成四层并分开报告。** evaluated（拿到分）、eligible（过 provenance/完成度）、selected（固定规则选出的）、retained（过回滚闸的）。Aspire 的教训是 best-evaluated 与 retained 可以差出一个量级（Terra 数学 20.10 被保留、Self 科学 45.33 被回滚），报告口径必须显式。
3. **回滚做成协议预声明，不做事后处理。** 「只有 selected 超底座才保留，否则回滚」在 campaign 开始前用 $\Sigma$ 固死，并记录 tie-breaking。事后挑规则会让任何自进化实验的报告偏向乐观。
4. **信息边界用密码学级绑定固化。** campaign 绑定 setting 标识符、prompt-profile 版本、渲染 prompt 的 SHA-256、实验身份，创建与恢复时校验——防止一个 vague-goal run 静默滑回显式任务契约或另一个 prompt 版本。任何「隐藏评测」实验都该这么做。
5. **训练数据注册时过与评测集的重叠闸。** Aspire 用 exact + semantic 双闸在数据进 SFT/GRPO/CPT 前拒绝匹配项，评测集本身组内跨组去重并对参照基准审计。没有这道闸，hidden eval 的「hidden」只是修辞。
6. **给 agent 一个 typed 语义动作接口而不是 shell。** registration / training / verification / validation / evaluation / branching / termination 七类语义动作，控制器验证每个请求、拒绝时返回 typed error 且不产生 artifact 或分数。这同时买到了资源隔离、可审计轨迹和「无效操作不消耗评测额度」的干净语义。
7. **harness 演化必须写输出完整性不变式。** Terra 案例：calculator 后空响应导致 pre-tool 部分草稿被提交，两项占一次执行总降幅的 70%。任何自改 harness 的系统都该有一条「最终提交物非空且完整」的硬检查，这比 reviewer 逻辑优先级更高——Terra 恰恰是删掉了会编造的 reviewer 却漏了这条。
8. **自建 validation 集先过多样性门槛再许停手。** Luna 用 1 条 prompt × 8 项 checklist 的 7/8→8/8 就停止，产物在隐藏评测上把机理问题重构成研究设计问题。最小可行的多样性约束：不同题型至少各一条、直接问答与开放任务都要有，验证分满格不构成停止条件。
9. **反馈通道设计成「aggregate-only + 有界额度 + 失败仍计数」。** 有界额度防止评测集被当训练信号用；「已接受的预约在后续阶段失败仍计数」防止 agent 用失败重试白嫖查询。这条对任何 black-box 优化 API 都适用。
10. **审计靠可移植轨迹 artifact 而不是日志即兴分析。** Aspire 的 artifact 只含计数、时间戳、源 hash、资源、提交与选择记录（不含 items、原始消息、judge 理由），确定性抽取 63,973 条 agent 事件恢复 124 个训练计划与 95 次候选评估。这个「能查账但查不到题」的粒度是 hidden-eval 实验可复现性的样板。
