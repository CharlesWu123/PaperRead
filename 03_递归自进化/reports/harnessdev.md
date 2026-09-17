# HarnessDev：把 harness 本身变成被评测的对象，然后发现「可见的进步」大多不可泛化

> 换 harness 不换权重就能让 GPT-5 在 Terminal-Bench 2.1 上从 35.2% 变 49.6%——那模型能不能自己造、自己养这个 harness？基准给出的答案：造得出雏形但全面落后人类工程（平均 67.8 vs 86.2），演化时 64 次版本切换只有 34 次方向与 held-out 一致，9 个「最终交付版」只有 2 个是 held-out 最优。

## 速览

- arXiv / 日期 / 机构：arXiv:2609.01437v1，cs.SE + cs.CL，arXiv 戳记 2026 年 9 月 1 日（论文 Date 字段为 September 2, 2026）。ByteDance Seed、新加坡科技设计大学（SUTD）、Georgia Tech、M-A-P、TokenWave.AI 五家联合。核心贡献者 Yuhao Wu、Jingyuan Zhang、Jiajun Shi；通讯作者 Yuhao Wu、Shen Yan、Wenhao Huang、Ge Zhang、Wenxuan Zhang。项目页 self-developing-agents.github.io，是 self-developing-agents 三部曲的 SYSTEM 层（另两部 Aspire=TARGET、S³Gym=EXPERIENCE）。
- 是否冻结参数：被评测的全链条都不训练权重。基准的对象是 harness（执行循环、工具、上下文、状态、生命周期、验证六个模块的系统代码），creator LLM 在开发环境里写代码产出 harness，executor LLM 在冻结后的 harness 里跑下游任务——「Changing this harness while holding model weights fixed can substantially alter task performance」是摘要第一句，也是整个基准的存在理由。
- 演化对象：可执行 harness 源码。Creation 阶段从一个「弱种子」（只解析任务/配置、写审计文件、无任何求解策略的兼容层）从零造完整 harness；Evolution 阶段从自己的 Creation 产物 H0 出发，凭 100 个 SWE-Pro 任务 + 89 个 Terminal-Bench 任务的真实执行反馈持续修订，git 仓库即血统。
- 验证信号来源：下游基准自带的原生判分（SWE-Pro task success、TB 2.1 task success、MLE-bench medal、EQ-Bench3 rubric、BrowseComp accuracy）。Creation 的隐藏评测分数不回传；Evolution 的 held-out 630 任务分数永不回传。约束合规靠逐版本审计（读判分脚本/硬编码答案/篡改日志者该版本记 0 分），全文报告为 null result——没有一个 harness 走了违规路径。
- 一句话贡献：第一个把「创建 + 演化 harness」串成闭环、并把 creator 与 executor 角色、可见反馈与 held-out 泛化、分数与 token 成本全部拆开测量的基准——然后用 73 个官方版本的数据证明：可见反馈只够做局部搜索，不够做最终版本选择。

## 1. 问题：harness 是性能差异的大头，却是评测的盲区

论文的动机链条非常干净（§1）：

**第一，harness 的影响力有硬数字。** 同权重下 GPT-5 在 Terminus 2 里解 Terminal-Bench 2.1 的 35.2%，在 Codex CLI 里是 49.6%——14.4 分纯粹来自模型之外的执行基础设施（§1）。既然换 harness 的收益比很多训练技巧还大，而领域专用 harness 的需求又在增长，那么「谁来开发 harness」就是个真问题。

**第二，现有评测把 harness 当实验配置而不是开发对象。** SWE-bench、GAIA、WebArena、τ-bench、AgentBench 这一整类基准「generally evaluate task execution under a selected harness」（§5）；Harness-Bench 前进了一步，测 harness 选择如何改变模型表现，但被选的还是人写的 harness。模型自己开发 harness 的能力——创建和持续维护——没有被系统测量过。

**第三，也是最有意思的一条论点：harness 工程和普通代码编辑在结构上不同**（§1）。改一个独立程序，目标行为是外部给定的、成功是本地可验证的；改自己的 harness，是在编辑「自己借以行动的执行基底」——改动会改变模型自己在此后所有任务里如何观察、规划和恢复。有效改进要求模型：

- 从执行轨迹里认出自己的行为缺陷（论文在此引用 Reflexion 一系的轨迹自省）；
- 诊断自己所在系统的结构瓶颈；
- 做出能累积成持久、可复用能力增益的定向修改，而不是一次性补丁。

这段论证把「递归自进化」里真正难的那一层（系统层）和普通的代码生成任务划开了界限。

项目页把这个三部曲摆成一条「前向部署工程师」的循环：Aspire 管「找对要优化的目标」（TARGET 层的失效模式是：模糊目标让搜索在上游就变形——更多时间花在解释目标和选 proxy 上，而不是真训练）；S³Gym 管「从经验里学对东西」（EXPERIENCE 层的失效模式是：能执行更新却不知道是否在优化预期能力）；HarnessDev 管「让正确的改变在系统里持久」（SYSTEM 层的失效模式是「editing a harness is easier than integrating a working mechanism」——改外壳容易，把一个真正起作用的机制集成进去难，local edits fail to transfer）。三层共用同一个判问：哪个局部信号配得上塑造 agent 的下一个起点。

于是基准要测的就不是一个任务的答案，而是一件可复用的工业品：冻结、可跑、可检视、跨任务复用（§1「durable, inspectable, and reusable」）。

## 2. 基准设计详解

### 2.1 评测对象与角色分离

形式化非常简单（§3.1）：creator $L_C$ 在开发环境 $D$ 里产出 harness $H$，$H$ 冻结后 executor $L_E$ 在其中跑任务 $x$ 得 $y$，评测器 $J$ 打分：$(L_C,D)\rightarrow H,\ (H,L_E,x)\rightarrow y \xrightarrow{J} \text{score}$。harness 被抽象为 $H=\langle E,T,C,S,L,V\rangle$（§C 接口规范），对应六个功能模块：执行循环、工具、上下文、状态、生命周期、验证；所有方法返回 JSON 可序列化对象。开发与评测严格分离：同一比较内 $L_E$ 和 $J$ 固定，分数变化只能归因于 harness（§3.4）。

两个评测口径（§3.2）：

- **Self-Eval**：$L_E = L_C$，测「creator–harness 整机」；
- **Unified-Eval**：所有 harness 都用同一个固定 executor（Gemini 3.1 Pro），使 harness 可直接互比，隔离 executor 兼容性。

### 2.2 Creation：从弱种子造 harness

每个 creator 拿到的是同一个 $H_{\text{seed}}$（§3.2、§C.1）：能跑的兼容层——稳定 CLI、运行时模型配置、审计写入器、无策略的原语工具，跑起来只做一次「不行动的通过」：解析任务、可选地用 summary-only prompt 探一下模型、写完审计信封就以 partial 状态终止。没有执行循环、没有工具策略、没有上下文/状态管理、没有恢复、没有验证器。种子得 0 分是设计出来的：Creation 量的是「设计执行系统的能力」，不是「复现基准样板代码的能力」。

配套输入：任务族规格、工具与权限约束、一份简短设计教程、1–3 个开发用例；可以用这些用例的反馈改 harness，但永远看不到人类实现和隐藏评测集（§3.2）。

覆盖面（§3.3，Table 2）：4 个领域、5 个下游基准，合计 2,207 个唯一下游实例（Evolution 的反馈任务来自同一批套件、不重复计数）：

| 领域 | 基准 | 任务数 | 原生指标 |
| --- | --- | --- | --- |
| Code | SWE-bench Pro 公开拆分（SWE-Pro） | 731 | task success |
| Code | Terminal-Bench 2.1 | 89 | task success |
| Data analysis | MLE-bench | 75 | medal score |
| Writing | EQ-Bench3 | 46 | rubric score |
| Research | BrowseComp | 1,266 | accuracy |

六个 creator：Opus 4.8、GPT-5.5、Gemini 3.1 Pro、DeepSeek V4 Pro、Qwen 3.7 Max、Seed 2.0 Pro（§4.1）。开发环境统一 Claude Code 2.1.177（GPT-5.5 用 Codex 0.144.3）。解码配置（Table 8）：

| Creator | 开发环境 | temperature | top-p / top-k | 最大输出 |
| --- | --- | --- | --- | --- |
| Opus 4.8 | Claude Code 2.1.177 | 1.0 | default | 128,000 |
| GPT-5.5 | Codex 0.144.3 | default | default | 128,000 |
| Gemini 3.1 Pro | Claude Code 2.1.177 | 1.0 | 0.95 / 64 | 65,100 |
| DeepSeek V4 Pro | Claude Code 2.1.177 | 1.0 | 0.95 / — | 131,072 |
| Qwen 3.7 Max | Claude Code 2.1.177 | 0.6 | 0.95 / 20 | 65,536 |
| Seed 2.0 Pro | Claude Code 2.1.177 | 1.0 | 0.70 / — | 131,072 |

每个 creator–基准对独立造 3 份、报 avg@3——于是 Code 域 6×3=18 个工件。指标两个：下游原生分 + executor 侧 token 成本（总量与每任务均值，creator 自己的 token 不计，§3.5）。

人类参照取各基准可验证的最高公开系统成绩（Appendix B.2、Table 9），配对各不相同：

| 基准 | 人类 harness | 配对 executor | 参照分 |
| --- | --- | --- | --- |
| SWE-Pro | 公开 coding-agent 配置 | Claude Fable 5 | 80.0（外部报告） |
| Terminal-Bench 2.1 | OpenAI agent 配置 | GPT-5.6 Sol | 88.8（外部报告） |
| MLE-bench | MLEvolve | Gemini 3.1 | 24.0（本地复跑） |
| EQ-Bench3 | Kimi Writer | Opus 4.8 | 83.7（本地复跑） |
| BrowseComp | OpenAI browsing 栈 | GPT-5.6 Sol | 92.2（外部报告） |

作者明确声明这些参照「are not scores obtained with one common executor」（§B.2）——不是受控对比，只是能力面的锚点。

### 2.3 Evolution：带反馈的持续开发

起点是自己的 RQ1 Code harness $H_0$。开发期反馈是固定信号（§3.2）：**100 个 SWE-Pro 任务 + 全部 89 个 TB 任务的完整评测结果**（100 任务取自 731 公开拆分）。每个 post-$H_0$ 候选冻结后按对提交：同一 commit 的 100 任务 SWE-Pro 全量评测 + 89 任务 TB 全量评测，两条腿都「settled」才进官方轨迹；同 commit 的基础设施修复会被合并（§3.2）。报告口径是等权对分 $\bar P_t = \frac12(P^{\text{SWE100}}_t + P^{\text{Term89}}_t)$（式 2）。每个任务 500 步 / 7,200 秒、trial_num=1（§E 演化契约）。

控制器的角色被刻意压到最低（§E 指令原文）：「The controller performs no accept/reject, no best-version selection, no rollback, no failure attribution, and no feedback summarization」——改什么、怎么验证、何时提交、要不要 probe、何时收工、哪个版本最好，全是 creator 的决定；连「最终版本」都必须由 creator 自己声明，控制器不会替它拍板。配套的机制约束：

- 会话可能被压缩或唤醒，磁盘文件与 git 历史是唯一可靠的持久层；
- 本地跑 harness 不限量；平台 probe 是稀缺远程信号，预算耗尽即禁用（`probes_disabled_budget_spent`），起跑前就全腿失败的 probe 不计费；
- 一个 probe 的证据包与完整评测同构（逐任务分数、adapter 状态、原始工件目录），所以它对「要不要提交全量评测」有真实的决策价值。

这套设计把「演化能力」与「搜索预算管理能力」都压到了 creator 身上。

**held-out 拆分**（§3.1、§4.3）：9 条血统（5 条 self-runtime + 4 条 fixed-Gemini 消融，Gemini 对照在两个设定里复用，每个 creator–runtime 格子只有单条轨迹）产生 73 个官方版本、64 个相邻版本切换；全部轨迹结束后，每个官方版本都在 630 个与反馈集不相交的 SWE-Pro 实例上补测，分数永不回传，「cannot affect editing, stopping, or final version selection」（§4.3）。Figure 7 画出每条血统的反馈集轨迹（$H_0$、各冻结 commit、星标声明版本），Figure 8 把反馈与 held-out 两条轨迹叠在一起。

**fixed-executor 消融**：同样 creator、同样开发环境、同样起点 harness，但 executor 固定为 Gemini——这是「creator 换了个搭档」的最小对照，隔离出「涨分是通用 harness 改进还是对自身 executor 的特化」。

**反作弊**（§3.4 硬规则，逐任务审计，违者该版本记 0 分）：不许硬编码任务 ID/答案/期望 patch/固定输出；不许读或探测判分/评分脚本、不许构造其期望状态；不许篡改评测工件或日志；不许访问基准源表、金标答案或平台私有评分实现。每次运行保留轨迹、结果与度量工件，交付源码与执行产物都可事后审计——作者对全文所有 run 做了审计并报告 null result（§3.4）。配套的运行时资源（§B.1）：MLE-bench 下游每任务一个 A800-80GB GPU、14 vCPU、227 GiB 内存、36,000 秒墙钟（34,200 秒归 agent、1,800 秒留给判分器）、500 步上限；RQ2 代码基准 500 步 / 7,200 秒。

## 3. Creation 结果：能造，但造不到人类的水平，且各域差异极大

Self-Eval（Table 4，三副本 avg@3）：

| Creator | SWE-Pro | TB2.1 | MLE medal | EQ-Bench3 | BrowseComp | 平均 |
| --- | --- | --- | --- | --- | --- | --- |
| 弱种子 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| Opus 4.8 High | 69.3 | 64.8 | 32.9 | 84.6 | 52.4 | **67.8** |
| Gemini 3.1 Pro High | 43.6 | 68.8 | 32.4 | 74.8 | 35.2 | 55.6 |
| GPT-5.5 High | 32.8 | 52.1 | 19.1 | 83.0 | 52.6 | 55.1 |
| DeepSeek V4 Pro High | 28.9 | 35.6 | 19.6 | 75.4 | 40.9 | 45.2 |
| Qwen 3.7 Max | 33.5 | 41.3 | 3.1 | 68.7 | 32.3 | 44.0 |
| Seed 2.0 Pro High | 10.8 | 6.0 | 5.3 | 71.1 | 3.2 | 22.8 |
| 人类 harness（配对模型） | 80.0 | 88.8 | 24.0 | 83.7 | 92.2 | **86.2** |

配套的编辑统计（Table 5；「中位/副本」是三个副本净 LOC 的中位数，Range 是其区间）：

| Creator | 文件 add/chg/del | 总净 LOC | 中位/副本 | Range |
| --- | --- | --- | --- | --- |
| Opus 4.8 | 19/7/16 | 2,470 | 698 | 656–1,116 |
| GPT-5.5 | 3/10/0 | 3,537 | 1,231 | 1,059–1,247 |
| Gemini 3.1 Pro | 4/4/0 | 1,006 | 324 | 270–412 |
| DeepSeek V4 Pro | 14/4/1 | 3,242 | 988 | 931–1,323 |
| Qwen 3.7 Max | 12/6/0 | 3,562 | 1,339 | 551–1,672 |
| Seed 2.0 Pro | 14/6/0 | 3,294 | 1,200 | 868–1,226 |

18 个工件合计 17,111 行。注意 GPT-5.5 只改 3 个文件却加 3,537 行——对应上面说的「巨大单体 agent」策略。

要点（§4.2）：

- **域间差距极不均匀**。摘要的措辞是「behind on code and on search and research, matching or exceeding on writing and machine-learning experimentation」：
  - 写作逼近并反超参照：Opus 84.6 vs 83.7；
  - ML 实验领先参照：Opus 32.9、Gemini 32.4 vs 24.0；
  - Search 差距最大：BrowseComp 最高 53.6 vs 92.2；
  - Code 全面落后：SWE-Pro 最高 69.3 vs 80.0，TB 最高 68.8 vs 88.8。
- **失败归因指向 harness 而非模型**：77.8% 的失败 Data 任务归因于 harness 缺陷（§4.2）——瓶颈真的在被造的系统里。
- **Unified-Eval 重排名次**（Table 3，固定 Gemini 3.1 Pro 执行）：
  - 上升：Qwen 44.0→52.8、Seed 22.8→29.8、DeepSeek 45.2→48.8；
  - 下降：Opus 67.8→53.3、GPT-5.5 55.1→44.8。
  - 作者的判读：Self-Eval 混合了 harness 设计、executor 能力与二者兼容性三样东西，「Qwen, Seed, and DeepSeek improve in several Data and Search settings under Gemini, whereas Opus and GPT-5.5 are often stronger with their own executors」（§4.2）。
- **成本极不均匀且与分数脱钩**：MLE-bench 上 token 用量相差约 19 倍，「higher cost does not reliably produce a higher score」（§4.2、Figure 9）。
- **实现风格分化**（§4.2）：Opus 常整个重写执行栈；GPT-5.5 加一个巨大的单体 agent；DeepSeek/Qwen/Seed 在种子上扩展 agent、tool、context、state 模块；Gemini 基本原地改 runner。
- **编辑量不预测成绩**（Table 5）：Gemini 加的行数最少（1,006）却拿到最好的 TB 分（68.8），「focused changes and frequent verification matter more than code volume」。
- **Opus 的开局是检索范式而非从反馈发明**：案例研究（附录案例）显示它先读种子、运行时客户端与平台契约，诊断出「种子有原子工具但没有真正的多轮控制器」，随后几乎一次性重写成单线程原生工具调用 ReAct 循环。
- **模块完成度审计**（§4.2、Figure 5）：
  - 18 个 Code harness 全部实现显式执行循环；
  - tools / lifecycle / verification 分别只在 13/18、13/18、15/18 里完整；
  - **state 与 memory 是最清晰的缺口**：11/18 定义了 State 类，只有 1 个暴露状态保存接口、1 个实现周期性 checkpoint，26,679 条记录在案的任务轨迹里没有任何 checkpoint 事件。
- **executor 特化是慢性病**：硬编码步数/输出上限会让能跑的 harness 换个 executor 就崩——一个 Opus Code harness 在 Self-Eval 表现好、在 Gemini 下近乎崩溃，因为它围绕原 executor 硬编码了 120 步上限（§6.1）。
- **验证大多是语法级的**：2,325 个已执行 Data 任务里有 441 个产出「degenerate submissions」，没有任何 harness 检测出来（§4.2）。

## 4. Evolution 结果：局部能涨，泛化存疑，换 executor 就露馅

9 条血统的汇总表（Table 6；对分口径）：

| 设定 | Creator | 反馈对 $H_0\!\rightarrow\!H_{\text{dec}}$ | held-out-630 | 终版差距 |
| --- | --- | --- | --- | --- |
| Self | Gemini 3.1 Pro | 59.9→68.7 (+8.8) | 48.89→51.59 (+2.70) | 0.00 |
| Self | Opus 4.8 | 71.1→74.1 (+3.0) | 63.02→67.46 (**+4.44**) | 1.59 |
| Self | Qwen 3.7 Max | 41.8→55.7 (+13.9) | 42.22→43.65 (+1.43) | 3.17 |
| Self | DeepSeek V4 Pro | 47.2→60.6 (+13.4) | 47.30→50.48 (+3.17) | 1.75 |
| Self | GPT-5.5 | 59.2→65.1 (+5.9) | 48.25→52.06 (+3.81) | 0.00 |
| Fixed Gemini | Opus 4.8 | 58.8→68.6 (+9.7) | 48.10→50.79 (**+2.70**) | 2.54 |
| Fixed Gemini | Qwen 3.7 Max | 62.1→63.2 (+1.1) | 49.52→48.41 (**−1.11**) | 1.11 |
| Fixed Gemini | DeepSeek V4 Pro | 47.3→53.8 (+6.5) | 43.02→40.63 (**−2.38**) | 3.02 |
| Fixed Gemini | GPT-5.5 | 56.6→59.1 (+2.4) | 42.22→31.90 (**−10.32**) | 16.51 |

四条核心结论（§4.3）：

1. **可见涨分≠held-out 涨分，且方向只有约一半一致**。5 条 self 血统在反馈对上全涨（+3.0 到 +13.9），held-out 上也全涨但缩水到 +1.43～+4.44（均值 +3.11）；但逐切换看，64 次可比切换里反馈与 held-out 同向只有 34 次（53.1%）——只比抛硬币好一点。Qwen 和 DeepSeek 的可见涨幅（+13.9、+13.4）最大，held-out 涨幅（+1.43、+3.17）却最小——最能刷反馈集的血统泛化最差。
2. **按可见分数选终版基本选不对**。creator 通常挑可见反馈分最好的版本交付，但 9 个声明版本只有 2 个是各自血统的 held-out 最优（终版差距 0.00 的两条恰好是 Self-Gemini 与 Self-GPT-5.5；最惨的 Fixed-Gemini GPT-5.5 差了 16.51 分）。作者的判词：「Visible feedback is therefore useful for local search but unreliable for final selection: repeatedly optimizing a noisy score can favor a lucky run and amplify overfitting」。
3. **fixed-executor 消融直接证伪「通用改进」**：固定 Gemini 下只有 Opus 在 held-out 上是正的（+2.70），Qwen −1.11、DeepSeek −2.38、GPT-5.5 −10.32。self 设定下的涨分很大一部分是对自身 executor（或反馈集）的特化。
4. **过程画像**（§4.3「Editing and feedback use」）：
   - 中位声明版本改 8 个文件、+476/−38 行；
   - 64 次切换里 58 次动执行/控制流、37 次动工具、17 次动生命周期恢复、16 次动上下文、只有 4 次动 state，**没有任何一次修改独立的验证器**；
   - 8/9 血统至少完成一轮「读结果→改→重评→选版」的完整循环，但失败诊断是最弱环节：专用轨迹接口总共只被调用 2 次，被明确检视的案例只覆盖 189 个反馈任务的 0.5%–40.2%；
   - creator 靠自写脚本和小 probe，而这些可以和全量评测脱节——一个 GPT-5.5 候选过了全部 5 个 Terminal probe，全量只有 0.584；
   - 正面例子是 Opus：发现 100 个 run 里 99 个报告成功、只有 48 个真通过，追因到过早收尾，加了一个完成检查——「Feedback is most useful when it exposes a concrete failure mode and the resulting change is verified end to end」。

另外几个值得记的细节：

- **DeepSeek 的回滚**。它在 self 血统上扩张 harness，换到 fixed-Gemini 后做了一次大重写、又在上下文压缩破坏 tool-message 配对后把大部分改动回滚——同一 creator 在不同 executor 下策略都不同。作者由此总结「Evolution therefore resembles local program search around runtime feedback, where deletion can be as useful as addition」。
- **死代码审计**。169 个新增函数/类里 113 个从入口可达、31 个只被死代码触达、25 个无人调用——Opus 的完成检查门是「有路径与用例级证据」的正面典型，Qwen 的消息清洗器是反面典型（把合法的 Gemini tool-result 序列弄坏了）。
- **自测台账与「正式成绩」的门槛**。案例研究里 Opus 留下了一份完整台账：五次本地自测（从 import 路径失败一路到 CLI 冒烟通过）加多次官方 dev run、一份 seed-to-final diff 净 +1252/−596。只有完整跑完两条腿官方评测的 run 才带基准分；被打断的 run 只作诊断反馈保留，不晋升为正式成绩。

## 5. 局限与作者自述的边界

作者自述（§6.1、§6、伦理声明、相关工作脚注）：

- **单次创建不代表模型**：同模型独立创建的 harness 差异可以很尖锐（Opus 那个 120 步硬编码的 Code harness 换 executor 近乎崩溃；Data 域也有过度严格停止规则的类似失败），「A single generated harness is therefore not representative」，所以要报 avg@3（§6.1）。
- **人类参照不是受控对比**：参照是「verified public system results rather than paired controls under one executor」（§4.1），配对模型各不相同（Fable 5 / GPT-5.6 Sol / Gemini 3.1 / Opus 4.8），三个值还是外部报告而非本地复跑（§B.2）。
- **容器是复现性边界不是安全边界**：「anyone reusing the generated harnesses should treat them as untrusted code and isolate them more strictly than we did」（伦理声明）。
- **matched-search 对比留作未来工作**：相对 HarnessOpt-Bench 的差别自述里承认「We treat its Evolution trajectories as adaptation to feedback-bearing sets and assess held-out generalization afterward on disjoint SWE-Pro tasks; matched-search evaluation remains future work」——即没控制搜索预算做同预算对比。
- **Evolution 只覆盖 Code 域**，反馈对只有 100+89 个任务、对分等权，每个 creator–runtime 格子只有单条轨迹。

我认为仍然存在、而论文没有充分展开的问题：

- **held-out 只换了任务、没换判分来源与任务族**。630 个 held-out 实例和 100 个反馈任务同出自 SWE-Pro 公开拆分，同一个 verifier、同一个任务分布——这已经是最窄意义上的 held-out。即便如此方向一致性也只有 53.1%，可以推想一旦像 DarwinX 那样同时换任务分布和奖励来源（合成→真实），一致性还会更差。这个基准给出的是「泛化难度」的下界，不是全貌。
- **版本数与血统数太少，噪声未被统计量化**。9 条血统、64 次切换、trial_num=1，每个版本的单次评测抖动量级论文没有给出置信区间；+1.43 到 +4.44 的 held-out 增益是否显著、−10.32 的崩溃是否一次倒霉 run，原文没有检验。DarwinX 引过 SWE-V pass@1 有 2.2–6.0 分波动的数据，这个量级和多数血统的净增益同阶。
- **「人类参照落后」的对比对 MLE/EQ 两域不太公平地利好生成方**。MLE-bench 参照 24.0 medal、EQ 参照 83.7 是本地复跑，而 SWE/TB/BrowseComp 参照是外部最优报告——两套口径混在同一行「平均 86.2」里。生成方在 MLE 上「超过参照」有相当部分是参照选取与复跑口径的产物，读「matching or exceeding」时要打折。
- **Creation 的「三个用例」信号量极小，测到的更像是先验工程知识**。creator 从 1–3 个开发用例造出 harness，本质上是从预训练里检索已知 harness 范式（论文自己的行为分析也显示 Opus 直接重写成标准工具调用 ReAct 栈）。这测的是「模型见过多少好 harness」，不是「模型能从反馈里学出多少 harness」——后一半才由 Evolution 承担，而 Evolution 的结论并不乐观。
- **token 成本只报 executor 侧**。creator 侧（在 Claude Code 里造 harness 的开销）被明确排除（§3.5），对比较「谁更便宜地造出 harness」不公平——Seed 2.0 Pro 成绩垫底但它的 creator token 从未进入任何表。
- **「创造成熟度」的排序本身受参照可得性扭曲**。Appendix A 列出的候选系统池（Code：Claude Code、OpenCode、OpenHands、SWE-agent、mini-SWE-agent；Data：DataAgent、DB-GPT；Writing：AutoResearchClaw、webnovel-writer；Research：gpt-researcher 等）里，成熟开源系统密度在 Code 域最高、在 Writing/Research 域稀薄——「代码差得多、写作追平」有多少是领域参照系强弱的函数，论文没有讨论。

## 6. 对「递归自进化」这条线的意义

这个库里的 harness 演化工作可以按「谁在被演化、谁来判好坏」摆开：DarwinX 用种群选择演化 Monet 的 harness、fitness 全部来自基准 verifier、在 held-out 上验证合并价值；HSI 做分层自改进；AutoDesign/ADAS/AFlow/EvoAgentX 在 prompt/workflow/算子/拓扑空间里搜索（本文 §5 把它们归为「search over prompts, workflows, operators, or agent topologies」）；MGM/DGM/SICA 直接改 agent 源码。HarnessDev 和它们全都不是竞争关系——它是**给这一整批工作发考卷的人**。相关工作一节把它与三个近邻基准的差别说得很清楚（§5）：

| 近邻基准 | 它测什么 | HarnessDev 的差别 |
| --- | --- | --- |
| Meta-Agent Challenge | meta-agent 在沙箱里迭代编程 agent 工件，五个域的受保护 held-out 测试打分 | 接近 Creation，但 HarnessDev 还研究持续开发、分离 creator/executor、量执行成本 |
| HarnessOpt-Bench | LLM 优化器拿种子 harness + 分级反馈 + 固定评测预算，可信环境按不可见分区上的规范化增益打分 | 最接近 Evolution；HarnessDev 把从零 Creation 接到 Evolution、评 self/fixed 两种 runtime、逐版本测 held-out |
| Evo-Bench | evolver 改共享 CodeAct 种子、runtime 固定，只评各血统最终修订版 | HarnessDev 还含 Creation、量 token 成本、测跨 executor 迁移、给每个冻结版本打 held-out 分 |

注意 Evo-Bench 与 HarnessOpt-Bench 都强调「最终修订版」或「提名候选」，而 HarnessDev 的差异化主张恰恰是**沿轨迹逐版本打 held-out 分**——只有这样才能区分「适应反馈集」和「held-out 泛化」。这个位置有三层含义：

第一，**它把「可见进步≠可泛化」从个案观察升格为带 64 次切换的测量**。此前各演化工作都承认 proxy 分数和真实泛化有 gap（DarwinX 的 TerminalWorld 训练子集饱和到 1.000 而 held-out 只有 68.3%），但那是自家系统的单次观察。HarnessDev 用 9 条血统、73 个版本把两件事做成了可复测的统计：

- 反馈方向与 held-out 方向一致率 53.1%（34/64）；
- 声明版本 held-out 命中率 2/9。

这等于给所有「我用基准内分数证明我的演化有效」的论文发了一条统一警告：你的选择信号大概率只有一半时间指向正确方向。对 DarwinX 这类刻意用「准入宽、采信严 + preservation probe」来对冲该问题的方法，这是外部证据；对只用 in-loop 分数的方法，这是直接质疑。

第二，**executor 特化的测量填补了一个空白**。这条线上的工作几乎都在单一 runtime 模型上演化（Evo-Bench 固定 runtime、HarnessOpt-Bench 固定评测预算），「演化出的 harness 换个底座还灵不灵」很少被测。HarnessDev 的 fixed-Gemini 消融给出的是相当冷的数字：

- 4 条血统 3 条 held-out 回退（−1.11、−2.38、−10.32），只有 Opus 为正（+2.70）；
- 病因具体可指认：硬编码步数上限（120 步）、上下文压缩破坏 tool-message 配对、消息清洗器误伤合法 tool-result 序列。

这提示 harness 演化的「可迁移性」应该像模型评测里的跨分布泛化一样成为标准栏目。

第三，**它把 Aspire–S³Gym–HarnessDev 三部曲拼成了完整的自进化回路图谱**：目标形成（TARGET）、经验学习（EXPERIENCE）、系统持久化（SYSTEM）。HarnessDev 对应最底层，而其结论——「editing a harness is easier than integrating a working mechanism」（项目页对 SYSTEM 层失败模式的概括）、26,679 条轨迹里零 checkpoint、没有一次切换修改独立验证器——说明当前模型在系统层的自进化主要发生在「控制流与工具的局部修补」上，状态、记忆、验证这几个真正让能力持久化的模块几乎没被碰过。这与 DarwinX 消融（新增 skill 全是 verification/artifact-contract 族、没有一个加领域知识）形成有趣的互补：

- DarwinX 说的是**选择压力落在哪里**——即便放开 code 层，被选中的也全是验证/契约类 skill；
- HarnessDev 说的是**编辑能力够不到哪里**——state/memory/verifier 在 18 个工件与 64 次切换里几乎无人触碰。

还要单独记两句作者在结论里的陈述（§6.2）。第一句是定位纲领：「If model weights are one place intelligence accumulates, the harness is another: explicit, inspectable, testable, reusable, and continually improvable」——这是把「冻结权重、演化 harness」从工程技巧上升为智能累积的第二载体的表述，与本库「递归自进化」的立库理由完全同构。第二句是评测 checklist：要回答这个问题必须

- 把「开发 harness 的模型」和「执行任务的模型」分开；
- 记录开发环境本身；
- 同时测量下游性能、跨 executor 迁移、与人类工程的距离、回退、成本。

这六件事（外加 token 成本）可以直接当作这条线的评测 checklist 用。

## 7. 可复用的工程要点

1. **给「自改进」类系统补一套 post-freeze held-out 复测**。每个冻结版本在评测者不可见、开发者不可见的拆分上补测，事后把「可见分数轨迹」和「held-out 轨迹」画在一起（本文 Figure 8 的做法）。如果两条线经常分叉，你的选择信号就是噪声放大器。成本可控：本文对 73 个版本各补测 630 个 SWE-Pro 实例。
2. **版本选择不要交给开发循环自己**。本文 9 个声明版本只有 2 个 held-out 最优，且 creator 系统性地挑「可见分最高」的版本；更稳的做法是保留整条轨迹、由外层用 held-out（或多次重评）做终选——这正是 DarwinX「两道门」与本文数据的共同指向。
3. **把 creator 与 executor 拆成两个角色再测迁移**。任何 harness/skill 演化系统都值得跑一次「换 executor 重测」消融：同一冻结产物在原 executor 与外部 executor 上各评一遍。本文结果显示特化是常态（−1.11 到 −10.32），特化的主要病根是硬编码步数/输出上限与消息格式耦合——这两类改动应当在 review 时被自动标记。
4. **接口契约先行**：固定 CLI 入口（`python -m harness run --task-json ... --model-config ... --output-dir ...`）、强制 result.json（诚实状态 success/partial/failed）、trajectory.jsonl、任务产物（如 patch.diff），全部 JSON 可序列化。这使「任何模型写的任何 harness」都能被同一控制器冻结、评测、审计——是整个基准能成立的地基，也是自进化系统对外暴露版本的标准做法。
5. **审计反作弊要「逐版本、逐任务」并保留执行证据**。规则写死四类禁止（硬编码答案、读判分脚本、篡改日志、访问金标），违规版本记 0 分；同时保留轨迹+结果+度量工件支持事后复核。本文对全部 run 审计后报 null result，并把审计脚本随基准发布——这套「先声明边界、再程序化验证」的流程可以直接搬。
6. **用编辑量、模块完成度、死代码率做免费诊断**。本文的三板斧很有参考价值：净 LOC 不预测成绩（1,006 行的 Gemini 拿 TB 最佳）；六模块完成度暴露系统性缺口（state/memory：11/18 定义、1/18 能存、0 次 checkpoint 事件）；169 个新函数里 56 个不可达或无调用者。这三个指标都能静态算，不需要额外评测预算，却能提前指出「改了但没生效」的假改进。
7. **反馈要「具体失败模式 + 端到端验证」才有用**。Opus 的完成检查门（99 报成功 vs 48 真通过 → 定位过早收尾 → 加检查）是全文唯一被点名的正例；probe 与全量脱节（5/5 probe 通过、全量 0.584）是最典型的坑。工程含义：诊断环节别用代理探针替代全量评测，且每次修改都要在真实评测路径上确认生效。
8. **「删除和回滚也是演化算子」**。中位声明版本 +476/−38 行、DeepSeek 大规模回滚重写——自进化系统应把回滚做成一等操作（git 血统天然支持），而不是只允许前进。这与 DarwinX 的 preserve-and-extend 契约互为镜像：一个约束「不许退」，一个测量「善用退」。
9. **把「官方版本」的门槛做高、把诊断性运行做低。** 本文只有「同一 commit 完整跑完两条腿全量评测」才算官方版本，被打断的 run 降级为诊断反馈；probe 明码计价、预算耗尽自动禁用。这套预算分层避免了「拿半截评测当成绩」，值得任何演化循环照抄。
