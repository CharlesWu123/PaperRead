# S3Gym：把「经验驱动自我改进」拆成 Self-Testing / Self-Judging / Self-Improvement 三项可分别测量的能力

> 七个自带 verifier 的文字游戏、三个模型、三种经验表示（原始轨迹 ICL / 摘要记忆 / 参数训练）放在同一协议下对撞，结论是：自我改进既不自动也不均匀——局部自评准确与后续改进的相关性几乎为零（ρ=-0.010）。

## 速览

- arXiv / 日期 / 机构：arXiv:2608.31100v1，cs.CL，2026 年 8 月 31 日提交（论文 Date 字段为 2026 年 9 月 1 日）。ByteDance Seed、M-A-P、TokenWave.AI 联合工作。核心贡献者 Jiajun Shi、Siyuan Tao、Yuhao Wu、Zexuan Wang、Jingyuan Zhang，共 21 位作者；通讯作者 Jian Yang、Zhoujun Li、Shen Yan、Wenhao Huang、Ge Zhang（§8 Contributions）。项目页 https://self-developing-agents.github.io/。
- 定位：self-developing-agents 研究三部曲的 EXPERIENCE 层。原文（§2/§3）：「S3Gym focuses on the second layer: the agent-facing feedback signal and the experience-driven improvement loop that it enables」；Aspire 研究部署需求如何变成能力增长（第一层），HarnessDev 研究模型如何构建并维护承载它们的执行系统（第三层）。S3Gym 居中，测的是经验回路本身。
- 是否冻结参数：分两条轨。主实验（七个专有模型）完全冻结参数，经验只通过上下文注入（History ICL / Summary Memory）；副实验对 Qwen3-8B 做参数训练（SFT），研究 20 个 checkpoint 的训练动态。冻结与否本身就是要对比的变量之一。
- 演化对象：不是 harness、不是 skill 库，而是 agent 的「经验表示」——交互轨迹以三种载体回流：直接拼进上下文的带分数标注轨迹、压缩成 (保留策略, 规避错误, 下一步方向) 三元组的摘要记忆、转成 SFT 样本的参数更新。
- 验证信号来源：每个游戏自带可执行的环境 verifier（步级奖励 $r_{x,i}$ 与局级分数 $y_x$），作为外部 ground truth。关键设计：**verifier 结果在探索阶段对 agent 保密**，agent 只能靠自评分数组织经验；verifier 分数只在评测阶段与诊断分析中露面（§4.3：「Neither signal is provided to the agent during exploration in the main setting」）。
- 一句话贡献：把「LLM 能不能靠自己的经验变强」从一句口号拆解成三段可分别测量、可交叉诊断的流水线，并给出第一批系统证据——瓶颈不在积累经验，而在「判断正确」与「把正确判断转成可执行策略」这两步，前者与后者几乎不相关。

## 1. 问题：为什么把 Self-Testing / Self-Judging / Self-Improvement 拆开测

作者的出发点是一个评测盲区：现有 agent 基准「typically treat the evaluated model as a fixed policy」，只回答「此刻模型多强」这个静态问题，回答不了「模型能不能用自己过去的交互改进未来行为」——作者把这种经验驱动的能力称为 Self-Improvement（§1）。

但直接测「改进了多少」会混淆三种完全不同的失败来源。作者引了两条外部证据说明「判断」这一环有多不可靠：

- LLM-as-a-Judge 与 JudgeBench 显示模型判分「remain vulnerable to biases, calibration errors, and limitations in reasoning」（§1）。
- 一项针对 ALFWorld 步级 credit assignment 的审计：LLM-judge 分数、outcome-conditioned logprob 比率、策略自身置信度，在 executed replay 对照下识别因果关键步的能力「fail to identify causally important steps better than chance」（§1）。

这句话是全文的题眼：对自改进 agent 来说，判断不准的后果是有方向性的——「inaccurate judgments may cause harmful experiences to be retained or valuable experiences to be discarded」，即坏经验被当宝贝留下、好经验被扔掉。如果你只测最终分数，你无法区分失败到底出在「测试没产生有信息量的证据」「判断错了」还是「判断对了但没转成行为」。

理论依据来自经验学习（§1）：Dewey 与 Kolb 强调经验须经过反思与再应用才能变成知识，Popper 把进步描述为猜想反复暴露于能揭示错误的测试。据此作者把经验驱动学习拆成三个相互依赖的能力（§2）：

- **Self-Testing**：agent 探索策略并收集诊断性证据（「explores strategies and gathers diagnostic evidence」）；
- **Self-Judging**：评估动作、结果及其可复用性；
- **Self-Improvement**：由此产生的经验改变未来决策。

注意这个拆法的理论出处：它与 Dewey/Kolb 的「经验→反思→再应用」以及 Popper 的「猜想→测试→排错」一一对应，所以 S3Gym 的三环节不是随意切分，而是把经验学习的经典循环投影到 LLM agent 上。这也解释了为什么 Figure 1 画的是「人类与 LLM agent 的经验驱动改进对照」：两边都是 Self-Testing 生成经验、Self-Judging 解释经验、记忆/学习机制吸收经验。

相关工作图谱（§3）也按这三环组织，值得留意各家的落点：

- 上下文级：Reflexion（verbal RL，反思上一局）；
- 外部记忆级：Voyager（进化技能库）、ReasoningBank（从自评成功/失败经验蒸馏可迁移推理策略）、Tree-of-Experience（层级化经验组织）、MetaSkill-Evolve（双时间尺度元技能演化）；
- 参数级：STaR、ReST、Re-ReST（生成/过滤/精炼自产推理轨迹）、Self-Rewarding Language Models（模型自产偏好信号迭代优化）、RetroAgent（回顾式双内在反馈，跨 episode 检索复用）、test-time self-improvement（从自身交互失败构造定向训练样本）。

这些工作各自声称「经验有用」，但没有任何一个把「自评」本身当作被测能力——这正是 S3Gym 填的空。

横向对照自适应 agent 基准（§3.3、Table 1）更清楚：PostTrainBench（更新对象是模型，经验用法是参数训练，评测用 held-out 任务）、SEA-Eval（agent 顺序适应、长期演化）、SEAGym（agent harness，更新 prompt/记忆/工具/工作流，测 ID/OOD 迁移）、PAST-Bench（agent 记忆，保留的跨会话经验，开/关配对条件）、ContinualSkillBench（技能库，上下文技能累积）、FinEvo-Bench（纵向经验、纵向任务序列）——这一整排基准的 Self-Judging 列全部标「×」，Self-Testing 最多标 Partial。作者对 S3Gym 的定位句是：不同于「primarily evaluate evolutionary outcomes or individual adaptation mechanisms」的既有基准，S3Gym 显式研究 agent 把交互经验转化为未来行为改进的**过程**。

再补一层背景（§2 Background，论文用了不小篇幅）：作者从 forward-deployed engineer（FDE，Palantir 发源的岗位）切入，指出大多数 agent 基准「begin after the problem has already been made executable」——任务已定义、奖励/裁判已定好、执行脚手架已固定。这种设置便于受控比较，却掩盖了真实部署里占大头的工作。从模型侧看，FDE 工作补齐了三块基准设计者通常预设掉的结构：

1. **目标模糊**：非正式的部署需求必须先翻译成具体目标、约束与成功标准；
2. **反馈信号缺失或不可靠**：测试、裁判、轨迹等验证机制必须先造出来，才能判断系统是否在进步；
3. **执行系统尚不存在**：工具、上下文管理、状态、生命周期、验证接口都要随需求变化而搭建和维护。

这三块结构恰好对应三部曲的分工：Aspire 接第一块（部署需求如何变成能力增长），S3Gym 接第二块（agent 侧反馈信号与经验回路），HarnessDev 接第三块（模型如何构建并维护承载它们的执行系统）。一个直接的推论是「a capable model is not yet a working system」——今天这道缺口主要靠人类工程师填补，而 S3Gym 测的是模型自己补第二块缺口的能力。

基准形态选择文字游戏（§4）：跟随 KORGym 的游戏式评测范式，理由是多轮交互、部分可观测、延迟后果、长程决策能产出丰富轨迹，而程序可验证的规则保证步级/局级打分客观可复现。环境用 TextWorld / ALFWorld / ScienceWorld 一族，但 S3Gym 把它们当作「experience-driven self-improvement 的受控测试床」而非推理评测。

## 2. 基准设计详解

### 2.1 总循环：Explore → Judge → Consolidate → Update → Evaluate

一次自改进循环形式化为（§4.1，Eq. 1）：

$$R_t^{(p)} = \mathrm{Explore} \to \mathrm{Judge} \to \mathrm{Consolidate} \to \mathrm{Update}_p \to \mathrm{Evaluate}$$

其中 $p \in \{\mathrm{History}, \mathrm{Memory}, \mathrm{Training}\}$。探索阶段在宽松配置下积累轨迹，然后自我判分、把经验固化成三种载体之一，最后在更严格的 held-out 配置上评测。

每轮循环含 $N_{\mathrm{exp}}$ 个探索 episode 与 $N_{\mathrm{eval}}$ 个评测 episode（Eq. 11）。两条防作弊约束写得很硬：「The two phases use disjoint random seeds, and evaluation trajectories are not added to history, memory, or training data」——评测种子与探索种子不相交，评测轨迹本身永不回流成训练材料（§4.4）。

### 2.2 七个游戏：探索配置 vs 评测配置

七个游戏覆盖互补的交互推理形态：潜在规则归纳（Chess）、约束满足（Minesweeper）、数值变换（Nullify）、空间规划（Tetris）、长程控制（Snake）、资源分配（PvZ）、多主体策略（Trust Evolution）（§4、§5.1）。Table 2 给出的探索/评测配置差异：

| 游戏 | 探索配置（宽松） | 评测配置（严格） | 最大步数 |
| --- | --- | --- | --- |
| Chess | 15×15 棋盘、12 个棋子、7 步历史 | 同规则但 22 个棋子 | 5 |
| Minesweeper | 9×9、10–20 颗雷、额外两条命 | 首雷即终局 | 64 |
| Nullify | 表达式由 3–7 步构造 | 表达式由 5–10 步构造 | 50 |
| PvZ | 3×7 战场 | 5×6 战场 | 64 |
| Snake | 碰撞与非法动作视为 no-op | 碰撞与非法动作即终局 | 64 |
| Tetris | 10×10 棋盘 | 8×8 棋盘 | 64 |
| Trust Evolution | 固定轮数重复博弈（合作/欺骗，收益 +2/+3/−1/0） | （表行未在抓取中返回，规则同上） | — |

宽松的方向不统一：有的给容错（Snake 撞墙不死、Minesweeper 有备用命），有的缩小搜索空间（Tetris 10×10 vs 8×8、PvZ 3×7 vs 5×6），有的降低构造复杂度（Nullify 3–7 步 vs 5–10 步）。设计意图（§4）：探索与评测配置「related but distinct」，迫使 agent 从经验中提取可迁移知识，而不是「memorize isolated actions or seeds」——记住某个种子下的具体走法没有用，因为种子不相交。

### 2.3 交互协议与自评契约

每步 agent 收到观测 $O_{x,i}$、局内历史 $H_{x,i}$ 和通路特定经验状态 $Z_t^{(p)}$，联合产出动作与自评即时分（Eq. 4）：

$$(a_{x,i}, s_{x,i}) = \pi_{\theta_t}(O_{x,i}, H_{x,i}; Z_t^{(p)})$$

响应契约是统一格式（附录，共享 response contract）：

```
Answer: <ACTION>, Score: <SELF-JUDGED SCORE>
若判定终局：Answer: END, Score: 0
```

关键细节：自评分数「is intended to be the reward obtained by the proposed action under the stated game rules, rather than a free-form confidence value」——不是置信度，是 agent 按规则推演的预期回报。局内历史按 Eq. 6 追加：$H_{x,i+1} = H_{x,i} \oplus \mathrm{Format}(O, a, s, F, O')$——**agent 自己的分数进了历史**，而 verifier 奖励 $r_{x,i}$「remains benchmark-side information」。终局时环境返回 $y_x = \mathrm{Score}(\tau_x)$（Eq. 7）。步级 $r$ 用来评 Self-Judging 的可靠性，局级 $y$ 用来评行为表现；主设置下探索期两个信号都不给 agent。

### 2.4 三种经验载体如何注入（§4.3、§4.5）

- **History ICL（原始轨迹）**：$C_{t+1} = \mathrm{Serialize}(C_t, \mathcal{T}_t^{\mathrm{exp}}, \mathcal{S}_t^{\mathrm{exp}})$（Eq. 8），带自评分数标注的轨迹直接序列化拼进后续上下文，$Z_{t+1}^{(\mathrm{History})} = C_{t+1}$（Eq. 14）。保留全部细节证据，代价是上下文长度。
- **Summary Memory（摘要记忆）**：$M_{t+1} = \mathrm{Summarize}(M_t, \mathcal{T}_t^{\mathrm{exp}}, \mathcal{S}_t^{\mathrm{exp}})$（Eq. 9），压缩成三元组 $M_{t+1} = (R_t^{\mathrm{retain}}, R_t^{\mathrm{avoid}}, D_t^{\mathrm{next}})$（Eq. 10）——要保留的策略、要规避的错误、下一轮的具体方向。$Z_{t+1}^{(\mathrm{Memory})} = M_{t+1}$（Eq. 15）。这是一个信息瓶颈，因此「depends more strongly on the quality of Self-Judging and summarization」。
- **Parameter Training（参数训练）**：$\mathcal{D}_t^{\mathrm{SFT}} = \mathrm{BuildSFT}(\mathcal{T}_t^{\mathrm{exp}}, \mathcal{S}_t^{\mathrm{exp}})$（Eq. 16），轨迹与自评转成 SFT 样本，$\theta_{t+1} = \mathrm{SFT}(\theta_t, \mathcal{D}_t^{\mathrm{SFT}})$。推理时不带历史、不带记忆。

### 2.5 评测协议与指标（§4.4、§5.2、§6.1）

- 通路 $p$、游戏 $g$ 在第 $t$ 轮后的评测分：$\overline{Y}_{t,g}^{(p)}$（$N_{\mathrm{eval}}$ 个 episode 平均，Eq. 12），相对原始模型的增量 $\Delta_{t,g}^{(p)}$（Eq. 13）。两个都报：前者是终态能力，后者是「从自己历史中获益的能力」。
- 上下文级通路跑 30 轮循环，在 $\{0, 3, \ldots, 30\}$ 处设评测 checkpoint；AUC+ 用分段线性梯形积分 $\int_0^{30}\max(0, y(x)-y_0)\,dx$（Table 4 注）。
- 三个互补指标：Avg.（全程平均）、Max.（最好单点，识别偶发突破）、AUC+（持续高于基线的面积，区分持续改进与孤立峰值）。因为各游戏分数量纲不同，AUC+ 只做同游戏内比较，跨游戏一致性用游戏内排名或「改进了几个游戏」来衡量。
- 训练级研究（Qwen3-8B）：20 个连续 checkpoint，epoch 0 是原模型、1–19 是用探索轨迹更新后的模型；每个 checkpoint 在七个游戏的严格配置上评测（无 ICL、无记忆）；报告 Avg./Max./$\Delta_{\mathrm{Final}} = y_{19}-y_0$/AUC+（$\int_0^{19}$）。
- 模型：七个结果完整的专有 LLM——GPT-4o、GPT-4.1、o3-mini、Gemini-2.5-Flash、Gemini-2.5-Pro、GPT-5.5、Gemini-3.5-Flash。有未完成 checkpoint 的模型被排除出主表，避免基于不同游戏覆盖做比较（§5.2）。

### 2.6 防作弊机制汇总

1. 探索/评测种子不相交；评测轨迹不进历史、记忆、训练数据（§4.4）。
2. 探索与评测配置相关但不同（棋盘尺寸、容错、构造复杂度都变），背动作序列或背种子无效（§4）。
3. verifier 真值在探索期对 agent 保密，agent 拿不到环境分数来「对答案」（§4.3）。
4. 分析口径排除无效数据点：Max./Avg. 「exclude explicitly marked invalid concurrency points」，AUC+ 用相邻有效 checkpoint 连线（Table 4 注）——并发异常不当作成绩。

## 3. 实验一：上下文级通路（七个模型，History ICL vs Summary Memory）

### 3.1 各模型/游戏的表现（Table 4a，ICL 平均分）

| 模型 | Chess | Minesweeper | Nullify | Tetris | Snake | PvZ | TrustEvo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GPT-4o | 0.007 | 0.044 | 0.030 | 0.030 | 0.212 | 11.636 | 8.242 |
| GPT-4.1 | 0.010 | 0.042 | 0.030 | 0.152 | 0.515 | 16.909 | 7.371 |
| o3-mini | 0.012 | 0.222 | 0.030 | 1.273 | 4.000 | 26.333 | 9.242 |
| Gemini-2.5-Flash | 0.009 | 0.063 | 0.030 | 0.121 | 1.424 | 20.697 | 9.008 |
| Gemini-2.5-Pro | 0.025 | 0.421 | 0.212 | 0.273 | 1.576 | 28.242 | 14.500 |
| GPT-5.5 | 0.017 | 0.604 | 0.545 | 4.242 | 9.061 | 44.033 | 7.848 |
| Gemini-3.5-Flash | 0.547 | 0.482 | 0.394 | 1.970 | 8.455 | 44.697 | 17.242 |

结构性观察（§5.3「Cross-game consistency」）：Chess/Minesweeper/Nullify 分数稀疏或高度离散，单个成功 episode 就能大幅抬 Max. 而 Avg./AUC+ 只动一点；Tetris/Snake/PvZ/Trust 提供更密的序列反馈，更能区分持续适应。结论是三种指标互补，且跨游戏不能拿原始 AUC 幅度平均。

ICL 通路的 AUC+（Table 4c，Gemini-3.5-Flash 行未在抓取中返回）：

| 模型 | Chess | Minesweeper | Nullify | Tetris | Snake | PvZ | TrustEvo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GPT-4o | 0.233 | 1.437 | 0.500 | 1.000 | 0.000 | 0.052 | 3.443 |
| GPT-4.1 | 0.186 | 1.329 | 1.000 | 0.000 | 8.501 | 129.000 | 5.966 |
| o3-mini | 0.004 | 0.000 | 1.000 | 0.000 | 0.000 | 5.383 | 62.638 |
| Gemini-2.5-Flash | 0.017 | 0.000 | 1.000 | 0.000 | 7.317 | 24.402 | 6.251 |
| Gemini-2.5-Pro | 0.000 | 3.539 | 1.500 | 0.000 | 0.000 | 60.416 | 161.876 |
| GPT-5.5 | 0.474 | 0.959 | 1.000 | 96.251 | 0.163 | 548.499 | 164.411 |

这组数字本身就说明「同一模型在不同游戏上的自改进量级差三个数量级」（GPT-5.5 在 Tetris 96.3、PvZ 548.5，在 Chess 0.47、Snake 0.16），且不同模型的强项几乎不重叠——自改进能力没有一个一致的「模型排名」。

总体发现（§5.3）：自改进潜力由底座、通路、环境三方共同决定——ICL 下 Gemini-3.5-Flash 拿最强 Chess 及最大 Snake/Trust AUC；GPT-5.5 领先更脆的 Minesweeper/Nullify/Tetris 并拿最大 PvZ AUC（GPT-5.5 PvZ AUC+ = 548.499）；换到 Summary Memory 后 GPT-5.5 在 Chess/Nullify/Tetris 变成最强，Gemini-3.5-Flash 仍保持 PvZ/Trust 平均分第一。作者由此强调「high base capability alone does not determine self-improvement」——模型差异同样体现在检索、压缩、应用自身经验的效率上。

### 3.2 History ICL vs Summary Memory：没有一个赢家

这是全文最实用的实证结论（§5.3）。Summary Memory 不是原始历史的无条件升级：

- **摘要赢的案例**：Gemini-2.5-Flash 的 Minesweeper AUC+ 从 0.000（ICL）升到 7.794（摘要），PvZ 从 24.402 升到 238.501；GPT-5.5 的 Chess 从 0.474 升到 16.840。模式是「长轨迹难以直接使用的模型」从压缩中获益最大。
- **摘要输的案例**：GPT-5.5 的 PvZ AUC+ 从 548.499 跌到 33.219；Gemini-3.5-Flash 的 Chess 从 12.280 跌到 0.000；某模型 Trust Evolution 从 200.000 跌到 55.095。失败机制有二：摘要丢掉了状态相关的证据，或保留了错误的判断。
- **分游戏规律**：摘要平均占优的游戏（Chess、Nullify、Trust 一类）是经验能压成稳定策略规则的；直接历史平均更好的是 Minesweeper、PvZ、Snake——它们依赖局部棋盘布局、波次时机、危险位置、部分可观测风险，摘要保得住高层目标却丢掉了正确执行所需的「state-contingent details」。原文结论（§6.3）：「Summary Memory is therefore most effective when experience can be compressed into a stable policy rule, rather than when success depends on reconstructing the exact current state」。

轨迹级证据（§6.3 的 case study）把这个判断落到具体样本：

- 成功摘要（GPT-5.5 / Trust）：「Always defect when the observed payoff structure consistently favors defection; avoid unnecessary reciprocal exploration」，轨迹证据是首步选 cheat 得环境分 3.0，结果 ΔNABA = +66.89——把收益反馈翻译成了对手条件化的显式策略。
- 成功摘要（Gemini-3.5-Flash / Nullify）：「Plan backward to create exact opposites, use floor or ceiling operations to remove decimals, and track index changes after every merge」，ΔNABA = +8.50——成功在给出了具体的算术规划程序。
- 失败摘要（GPT-5.5 / PvZ）：「Prioritize sun production, early defense, Wall-nut stalling, and coverage of threatened lanes」，开局 X 1 0 得分 1.0 但严格分从 38.67 掉到 32.33，ΔNABA = −2.56——建议合理但太粗，抓不住波次时机、当前僵尸位置与可用阳光预算。

作者归纳出摘要改进有效的两个必要条件：分数必须识别出「可复用的失效模式」而不是只说这局打得差；摘要必须把信号转成「precise enough to execute in a new state」的动作规则。

## 4. 实验二：Self-Judging 可靠性与 Qwen3-8B 训练研究

### 4.1 自评到底准不准（Table 5，98 个 run、116,117 个转移）

| 游戏 | Agreement | NMAE | Over-conf. | Under-conf. |
| --- | --- | --- | --- | --- |
| Chess | 0.496 | 0.141 | 0.365 | 0.139 |
| Minesweeper | 0.820 | 0.524 | 0.062 | 0.118 |
| Nullify | 0.827 | 0.056 | 0.170 | 0.004 |
| PvZ | 0.881 | 0.882 | 0.032 | 0.087 |
| Snake | 0.879 | 0.121 | 0.110 | 0.011 |
| Tetris | 0.846 | 0.041 | 0.151 | 0.002 |
| Trust | 0.665 | 0.392 | 0.291 | 0.044 |

三个层次的发现（§5.4/§6.2）：

1. **自评只是部分可靠**。PvZ/Snake/Tetris/Minesweeper/Nullify 的二元 agreement 较高（0.82–0.88），但部分是零奖励转移占比大造成的虚高；NMAE 才检验幅度校准——Tetris（0.041）与 Nullify（0.056）低，PvZ 在高 agreement（0.881）下却有最大校准误差（0.882）。「Models can therefore recognize whether an action appears locally useful while substantially misestimating its value」——认得出「有用」，估不准「多有用」。
2. **Chess 与 Trust 是最清晰的失败案例**。Chess 的 agreement 接近随机（0.496）且 over-conf 最高（0.365）：预测在语法上完整却摆错棋子，置信与真实分脱钩。Trust agreement 弱、NMAE 高（0.392）、over-conf 高（0.291）。规律：当奖励取决于隐藏动态、对手策略或精确多物体状态预测，而不是立即可见的局部后果时，自评失效。
3. **自评准 ≠ 会改进——全文最重要的负结果**（§6.2「Judgment–improvement coupling」）。把探索轨迹按相邻评测 checkpoint 分块，算块内 agreement $A_t$、校准误差 $E_t$ 与下一评测的归一化分数变化 $g_t$（Eq. 23），全基准上 $\rho(A, g) = -0.010$、$\rho(-E, g) = -0.018$，最高/最低判断质量三分位的分数增益差也小且略负。逐游戏的相关（Table 6）：

| 游戏 | ρ(A, g) | ρ(−E, g) | 三分位差(A) | 三分位差(E) |
| --- | --- | --- | --- | --- |
| All | -0.010 | -0.018 | -0.004 | -0.016 |
| Chess | -0.014 | -0.058 | 0.028 | -0.039 |
| Minesweeper | 0.071 | 0.006 | 0.069 | 0.005 |
| Nullify | -0.032 | -0.082 | -0.065 | -0.058 |
| PvZ | -0.038 | -0.023 | 0.014 | 0.010 |
| Snake | 0.022 | 0.022 | 0.009 | 0.009 |
| Tetris | -0.048 | -0.021 | 0.010 | 0.004 |
| Trust | -0.014 | -0.003 | -0.001 | 0.006 |

只有 Minesweeper 的 $\rho(A,g) = 0.071$ 是弱正相关，其余全部在零附近或为负。结论原文：「accurate local scoring does not reliably produce improvement at the next evaluation checkpoint」；再叠加另一组弱负相关（事件 agreement 与 NABA 的 Pearson r = −0.23、Spearman ρ = −0.11），最终判断是：**局部 Self-Judging 准确只是 Self-Improvement 的必要非充分条件，agent 还必须把反馈转成可复用的状态抽象、决策规则与探索策略**。

### 4.2 Qwen3-8B 的 20-checkpoint 参数训练研究（§6.1）

训练级结果按游戏分化成四档：

- **显著改进（Trust Evolution）**：分数从 0 涨到最大 30，19 个更新后 checkpoint 中有 18 个高于初始基线，训练后平均 8.684、AUC+ 达 163.5。这是「interaction-derived strategies can be internalized into model parameters」最清晰的证据。
- **微弱/瞬态（Chess、Snake）**：Chess 大多数 checkpoint 为零、最终 checkpoint 达 0.0667；Snake 在 epoch 8、12、15 达 1 分随后回落为零——「discovers occasional successful behavior without retaining it consistently」。
- **零改进（Minesweeper、Nullify、Tetris）**：整个训练过程评测分恒为零。作者猜测探索期成功轨迹太少、无法引导有效监督信号，但注明验证该假设需要轨迹级分析。
- **严重负迁移（PvZ）**：初始分 23，每个更新后 checkpoint 都只有 6。参数更新覆写了原本有效的行为；候选原因包括对探索轨迹的过拟合、宽松探索与严格评测的失配、不可靠的自评信号。

总评（§6.1）：参数训练能实现自改进但不跨任务一致；训练级自改进不仅取决于「能不能更新参数」，还取决于被内化经验的质量、多样性与正确性。结论（§7）明确说「Training on self-generated trajectories remains unstable in the current implementation」。

## 5. 局限与作者自述的边界

先忠实转述作者自己承认的边界：

- **训练不稳定是当前实现的属性**（§7）：「remains unstable in the current implementation」——作者没有把 Qwen3-8B 的结果外推为「参数训练此路不通」。
- **假设未验证**（§6.1）：Minesweeper/Nullify/Tetris 零改进的解释（成功轨迹太少）被明确标记为未验证假设，「verifying this hypothesis requires trajectory-level analysis」。
- **AUC+ 量纲限制**（§5.3）：各游戏分数尺度差异大，AUC+ 只能同游戏内比较；跨游戏一致性要用排名或改进游戏数衡量，不能平均原始幅度。
- **数据完整性筛选**（§5.2）：主表只收「七个游戏结果完整」的模型，未完成 checkpoint 的模型被剔除——等于承认部分实验没有跑完，样本存在选择。
- **摘要有效性的双条件**（§6.3）：Summary Memory 被定性为「selective compression mechanism」与「selective improvement mechanism」，作者明确拒绝把它当作 raw history 的普适替代。

我认为仍然存在、而论文没有充分处理的问题：

- **游戏不是任务**。七个文字游戏共享一个特性：规则封闭、状态可枚举、verifier 确定性。Trust Evolution 这类「对手策略稳定」的博弈与真实部署里「环境本身在漂移」的经验回路差距极大。摘要记忆「压成稳定策略规则就有效」这个结论，在规则会变的开放环境里未必成立——而论文对这一外推边界只字未提（未抓到任何相关表述）。
- **判断-改进耦合只有相关性证据**。分块相关、三分位差这些设计聪明，但 ρ 接近零既可能说明「判断没用」，也可能说明块粒度太粗、或 $g_t$ 噪声太大把弱信号淹了。116,117 个转移的步级数据其实支持更细的因果分析（比如按判断正误分层看轨迹保留率），论文止步于相关性。
- **$N_{\mathrm{exp}}$ / $N_{\mathrm{eval}}$ 的具体数值、SFT 超参（学习率、每轮样本量）在正文抓取中未出现**，训练结果（尤其 PvZ 23→6 的坍塌）无法与「训练预算不足」的替代解释区分。
- **专有模型黑箱**。七个模型里五个是 API 产品，「检索、压缩、应用经验的效率」的机制归因全部只能靠行为差异反推，无法检查上下文里到底发生了什么。
- **单一底座的训练研究**。Qwen3-8B 只是 8B 开源模型；Trust 上 0→30 的漂亮数字可能恰好是「小模型在封闭博弈上可教」的特例，没有任何跨规模、跨家族的重复。
- **自评契约把「判断」操作化为一个数**。真实经验组织的判断是结构化的（哪一步错、为什么错、可迁移到哪里）；强制每步报一个标量分数可能系统性低估了模型的结构化判断能力——测到的或许是「契约的表达瓶颈」而非「判断能力」本身。

## 6. 对「递归自进化」这条线的意义

放到递归自进化的坐标系里，S3Gym 的位置很特殊：它不是又一个自改进系统，而是给整条线提供**诊断仪器**的基准。三个对接点：

**对接点一：self-preference / 自评不可靠这条安全线。** 这条线的既有结论（LLM-as-a-Judge 的偏差、自偏好、ALFWorld 步级 credit assignment 审计「不比随机好」）通常被引来说明「不能让模型自己当裁判」。S3Gym 没有反驳这一点，反而把裁判拆成了两个用途并分别测量：自评作为**经验组织信号**（哪些轨迹进摘要、哪些进 SFT 数据）与 verifier 作为**真值**（评测与诊断）。它的两个负结果对这条线是重要补充：(1) 自评在局部后果可见的任务上 agreement 可到 0.88，但幅度校准（PvZ NMAE 0.882）和隐藏动态任务（Chess 0.496）会塌；(2) 更致命的是**自评准确度与后续改进的相关性≈0**——这意味着即使你的自评基本靠谱，把它当经验过滤器也未必换来进步。任何「ReasoningBank 式自评蒸馏」的工作都该先过 S3Gym 这一关。

**对接点二：与 DarwinX 一类外部 verifier 主导的演化形成互补而非对立。** DarwinX 的立场是彻底不让自评进选择信号（fitness 一律来自基准 verifier 的 avg@k）；S3Gym 的立场是故意把 verifier 藏起来、逼 agent 用自评，然后量出自评的成色。两者合起来构成一个完整的论证：**verifier 可得时用 verifier（DarwinX 路线），verifier 不可得时（真实部署的大多数场景）自评是唯一选择，而 S3Gym 量出这个唯一选择目前有多不靠谱**。注意 S3Gym 里 verifier 仍然存在（benchmark-side），它只是被从 agent 的信息面里拿掉——这是「用外部真值测量无外部真力时的行为」的干净实验设计。这与三部曲的分工一致：Aspire 管需求层、S3Gym 管经验层、HarnessDev 管执行系统层；S3Gym 在论文里的自我表述是「the agent-facing feedback signal and the experience-driven improvement loop」的测试床。

**对接点三：给「经验表示」这个被忽视的轴提供了第一份系统对照。** 递归自进化文献里大家默认争论「改权重还是改上下文」，S3Gym 把第三种变量显式化了：同一个轨迹，以 raw-history、摘要、SFT 样本三种载体回流，效果是任务结构决定的——可压缩成规则的任务摘要赢，状态敏感的任务原始轨迹赢，封闭博弈小模型训练赢、其他场合训练不稳定甚至负迁移（PvZ 23→6）。这对 DarwinX（skill 层摘要）、ReasoningBank（策略蒸馏）、STaR/ReST（轨迹训练）都是一个统一的反思框架：你的经验载体和你的任务结构匹配吗？

还有一条方法论贡献值得单列：**把「改进失败」归因到环节的能力**。因为同时记录了自评分与 verifier 分，S3Gym 可以回答「这次没改进，是因为判断错了，还是判断对了但没转成行为」——这是以往只报终态分数的自改进系统做不到的。递归自进化的任何后续工作，只要声称「我的 agent 会从经验学习」，都可以被这套三层分解拷问。

最后补一句它在这条研究线里的「仪器」属性：S3Gym 自己不做任何改进方法的创新，七个游戏、三种通路全部是现成构件（KORGym 式游戏环境、Reflexion 式历史、ReasoningBank 式摘要、STaR 式 SFT）。它的价值是把这些构件放进同一个带真值旁路的实验舱，量出每个环节的成色——对一条正在快速堆叠系统的线来说，「先有量尺再有系统」是这篇论文最克制也最有用的姿态。

## 7. 可复用的工程要点

1. **把自改进回路拆成三段分别埋点。** Explore → Judge → Consolidate → Update → Evaluate 五段循环里，Judge 段的输入（自评分）与真值（verifier 分）同时落盘。这样任何失败都能定位到环节，而不是只在终态分数上猜。落地成本：一条 response contract（`Answer: <ACTION>, Score: <SELF-JUDGED SCORE>`）加一个旁路记录器。
2. **自评分数的语义要定义为「按规则推演的预期回报」，不是置信度。** 这个契约细节决定了自评可比性：自由发挥的置信度没法和 verifier 奖励对齐做 NMAE；规则推演式自评可以。
3. **探索/评测配置做「相关但不同」的配对。** 同结构、不同参数（棋盘尺寸、容错强度、构造复杂度）+ 不相交种子 + 评测轨迹不回流，三件事一起做才能挡住「背种子/背动作序列」式的假改进。这比单纯换 seed 强一档。
4. **经验载体按任务结构选择：先问「成功依赖状态细节还是稳定规则」。** 依赖波次时机、局部布局、部分可观测风险的任务（PvZ/Snake/Minesweeper 型）用原始轨迹 ICL；可压成 if-then 规则的任务（Trust/Nullify 型）用摘要记忆。混合负载下两条通路都保留，别下注单一路径。
5. **摘要写出来的标准是「能在新状态里执行」。** 从 case study 反推的验收标准：一条有效摘要必须（a）指认可复用的失效模式而非「这局差」，（b）给出具体到状态条件的动作规则（Trust 的「payoff 结构偏向欺骗就永远 defect」是正面样板，PvZ 的「优先产阳光」是反面样板）。可以把它做成摘要生成的 checklist 甚至自动过滤器。
6. **判断质量与改进收益解耦监控。** S3Gym 的核心负结果是 agreement 与后续 gain 相关性≈0（ρ=-0.010），说明「自评准确率」不是自改进管线健康的充分 KPI。工程上应同时监控两个仪表：自评校准（agreement + NMAE）与「被保留经验的实际转化率」（采纳某条经验后的下一轮分数变化）。
7. **训练自产轨迹前先查「成功轨迹密度」。** Minesweeper/Nullify/Tetris 全程零分的候选解释是探索期几乎没有成功轨迹可引导监督信号。训练前统计正样本密度，密度过低时先回到上下文级通路或主动制造成功 episode，再谈 SFT。
8. **警惕参数更新覆写既有能力。** PvZ 从 23 崩到 6 且 19 个 checkpoint 全部如此，是「训练级自改进」最典型的负迁移形态。上线任何自训练回路都应配 preservation 检查（对应 DarwinX 的 preservation probe 思路）：训练前后在同一 held-out 集上对比，回退超阈值就回滚。
9. **指标三件套：Avg / Max / AUC+。** 稀疏奖励任务里 Max 会被单次幸运爆表，AUC+ 区分持续改进与孤立峰值，Avg 反映整体。三者都报，并用「改进了几个任务」而非原始分数平均做跨任务比较。
