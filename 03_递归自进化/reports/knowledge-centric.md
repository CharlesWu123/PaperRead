# Knowledge-Centric Self-Improvement：把持久物从 agent 换成知识库

> 让 agent 一次性、可丢弃，只让一个被策展的证据型知识库持久演化。

## 速览

- arXiv 2607.19592v1 [cs.AI]，2026 年 7 月 21 日。作者 Xuefei (Julie) Wang、Lauren Hyoseo Yoon、Chengrui Qu、Amanda Zichang Wang、Atharva Sehgal、Eric Mazumdar、Yisong Yue，全部来自 Caltech。代码 https://github.com/recursive-knowledge/KSI 。致谢 NSF #2505096、#2240110 与 OpenAI、Point72 的资助。
- 是否冻结参数：是，且比一般「冻结权重」更极端——不仅不训练，连 agent 的 prompt、架构、编排都不动。原文第 3.1 节：「The agents do not inherit private memory, identity, specialization, or modified prompts from previous agents. All persistent state lives in the knowledge base.」引言又写：「we keep agents generic, stateless, and disposable」、「The only object that changes is the curated knowledge base.」结论把对立面点明为「rather than the internal parameters or memories of the agents themselves」。任务执行体就是现成 SDK 调用（Anthropic Claude Agent SDK + Haiku 4.5，OpenAI Agents SDK + GPT-5.4-mini medium reasoning，见 4.1 节）。
- 持久对象的形态：一个共享知识库，存三类工件（3.1 节）——(1) typed attempt table，记录每次尝试与结果；(2) forum posts，把执行 trace 转成有证据支撑的 claim；(3) distilled bundles，把存活的 claim 压成下一代可直接消费的指导。粒度是「条目级 insight」而非「文件级 skill」：Insight 的字段是 `text`（"when X, do Y" 形式的可执行 claim）、`applies_when`、`does_not_apply_when`、`evidence`（列表，每条含 task_id / post_id / quote）、`confidence`（high/medium/low）（Appendix E.3, Listing 13）。bundle 分 `PerTaskBundle`（每个未解任务一份）与 `CrossTaskBundle`（每代一份），六个共享字段：transferable_insights、confirmed_constraints、rejected_hypotheses、pitfalls、checks、next_steps，外加 evidence_post_ids。存储实现是 SQLite（Figure 4 的 "Eval + stores SQLite"），交付形态是渲染进 agent workspace 的 `MEMORY.md`（Appendix E.3 末尾，`runtime/seeding.py`）。
- 验证信号来自哪里：全部来自 benchmark 的硬验证器，不是 LLM 自评。ARC 用官方 exact grid match、每个 test input 两次盲提交（Appendix I）；Polyglot 用语言相关 test command + Docker evaluator，session 内 `tries=2` 带 test feedback；SWE-bench Pro 用官方 harness 评 workspace diff；Terminal-Bench 2 用容器内验证测试套件、只有最终环境状态过测才算 solved（Appendix F、K）。insight 的可信度则来自另一层信号：forum 里同代 agent 的支持/反驳证据，以及跨任务是否复现。
- 一句话贡献：提出并受控验证「知识中心自改进」——在 agent 完全固定的前提下，用 task-level forum → cross-task forum → distillation 三段协议把尝试转成可检验、可迁移的知识资产，在五个 benchmark 上同时超过 agent-centric 与 prompt-optimization 基线且成本更低，并证明冻结后的知识资产能零样本迁移到 held-out 任务与另一个 LLM 家族。

## 1. 对 agent-centric 自改进的质疑

这篇论文的靶子写得极其明确：「Self-improving AI systems typically treat the agent as the object that improves, by optimizing prompts, workflows, harnesses, or even the agent's own code.」（Abstract）它把 prompt/workflow 优化 [11,44,50]、harness search [16]、agent 代码自修改 [42,27,14,38,33] 归为同一类，然后下判词：「This agent-centric view can make improvements expensive to maintain and difficult to transfer, because gains become tied to a particular agent design, task distribution, or adaptation run.」

把这句话的三个绑定拆开，就是三种具体失败模式。

**绑定到 particular agent design。** 改进被写进了一个具体载体的形状里：某个 prompt 模板的措辞、某个 harness 的循环结构、某个 agent 代码库的函数签名。这类增量不具备语义独立性——你没法把 DGM 演化出来的一段 agent 代码搬到另一个 harness 上，因为它依赖那个 harness 的工具接口、上下文格式和控制流。原文引言给出的机制是**稀释与冲突**：「A single persistent agent must absorb many local lessons, some of which are task-specific, redundant, or mutually inconsistent; as the agent grows, useful behavior can be diluted by conflicting updates, and each new adaptation might degrade performance on the previous tasks.」这是 agent-centric 路线的结构性问题：所有教训必须投影到同一份可执行载体上，而可执行载体没有「作用域」这个概念。prompt 里写「遇到 scheduling 任务先建约束图」和「不要过早引入图结构，先跑贪心」这两条只要同时存在就互相打脸；写进 skill 文件也一样。冲突只能靠覆盖解决，覆盖就是信息丢失。

**绑定到 task distribution。** 优化目标是在训练任务池上的表现，于是产出物会吸收任务池的形状。第 4.2 节的实测正好是这个论断的证据：GEPA 和 OpenEvolve 在同样的 train-50 池上优化一个可复用的 solver prompt，在预算对齐后 ARC-AGI-1 只到 44% / 54%，Polyglot 只到 36% / 46%（Table 2），而知识策展是 86.7% / 68.0%。作者的解读是两者优化对象不同：prompt optimizer 精炼的是一个**无条件的策略**，而知识资产记录的是 distilled insight、环境假设、复发失败模式——即**带条件的**知识。这一点值得单独强调：一个 prompt 必须对池里所有任务同时成立，所以优化压力天然把它推向平均化、泛化到无信息的措辞；而 Insight 有 `applies_when` / `does_not_apply_when` 字段，它可以在只对一类任务成立的前提下被保留下来，不需要牺牲其它任务。这是知识中心相对 prompt/skill 演化最锋利的一刀：**载体决定了能不能表达作用域**。

**绑定到 adaptation run。** 收益依附于那一次演化轨迹——同一个种子、同一个模型、同一段搜索历史。换一个 base LLM，演化出来的 agent 代码或 harness 未必还有效，因为它优化的是那个模型的失败模式。原文把这条作为核心可检验命题，在 4.3、4.4 节反过来验证自己的产物不受此限：「bundles curated under one LLM family remain effective when consumed by another. This is evidence that curation yields an artifact whose utility extends beyond the run that generated it.」

**把批评讲到最有力的版本。** 沿着上面三条往下推，agent-centric 路线（包括 skill / harness 演化）面临的是一组维护学问题，而不是性能问题：

1. **不可审查性。** 演化出来的 prompt/skill/代码是「已编译产物」。它为什么这么写、依据哪次失败、在什么条件下成立、有没有反例——这些元数据在演化过程中被丢弃了。你只能看到最终文本，不能看到它的证据链。本文的知识条目强制携带 `evidence: [{task_id, post_id, quote}]`，等于把编译丢掉的调试符号保留下来。
2. **无法删除。** 审查不了就无法安全回滚。skill 库越长越大，没人知道哪条能删；删掉一条可能悄悄破坏三个任务。于是只能追加，追加又加剧稀释。
3. **单调性缺失。** 「each new adaptation might degrade performance on the previous tasks」是灾难性遗忘的 prompt 版本。agent-centric 系统一般没有针对已解任务的回归门禁，所以第 N 轮适配的收益可能是负的，而你察觉不到。
4. **载体表达力不足。** 前面说的作用域问题。skill 文件的自然语言指令是命令式的（"do X"），缺少「在什么条件下不成立」的位置；把否证信息塞进 skill 会让它自相矛盾，所以否证信息通常被直接丢掉——于是同一个错误假设会被后续 agent 反复重试。本文专门为此设了 `rejected_hypotheses` 字段，并用 `FALSIFIED: ... -- UNTRIED: ...` 的格式保存否证的**边界**（Appendix C.2, Listing 3）。
5. **迁移需要重跑。** 换模型、换任务域，agent-centric 产物基本要重新演化一遍，之前的算力沉没。知识资产至少在本文的实验里可以冻结后直接搬（Table 4）。

**一个容易被忽略的补充论点：agent-centric 路线的产物是「不可分割」的。** DGM 这类系统的输出是一个 agent（一份代码库 + prompt），你要么整体接受要么整体拒绝。知识库的输出是一个**集合**，可以逐条接受、逐条删除、逐条打上 confidence，也可以只取跨任务那一层而丢掉任务专属那一层。本文的迁移实验正是利用了这个可分割性——task-conditioned adapter 从共享资产里每字段挑 0–3 条（Appendix L）。skill 库在这一点上处于中间态：它是文件级可分割的，但单个 skill 文件内部仍是不可分割的整体，而 skill 文件通常就是知识的自然聚合单位，所以实际粒度接近「整体接受」。

**这个批评为什么直接冲击 skill / harness 演化整条路线。** 因为 skill 演化的三个核心假设都被上面的分析削弱了：假设一，skill 是自然的知识载体——但 skill 是**程序**载体，用来装命题会丢失作用域与否证；假设二，skill 可以在 agent 间共享——但 skill 引用具体工具名、路径、上下文格式，换 harness 就要改写；假设三，skill 库越大越强——但没有证据链就没有删除依据，膨胀与稀释是同一件事的两面。本文的立场可以概括为一句话：**你应该演化的不是「怎么做」的指令，而是「什么成立」的命题；前者天生绑定载体，后者天生可迁移。**

反过来说，作者的正面主张是：可靠性的负担应该从 agent 转到证据流程本身——「This shifts the burden of reliability from the agent to the evidentiary process. Therefore, the agents themselves can remain simple and disposable」（第 2 节）。这句话是全文的思想内核。agent-centric 路线让一个越来越复杂的载体承担正确性；知识中心路线让一个多方对抗的证据流程承担正确性，载体保持一次性。

## 2. 知识中心范式的协议

系统按代（generation）运行。原文承认这是工程折衷：「In principle, agents can run asynchronously and in a decentralized manner. For practicality and direct comparability with agent-centric baselines, we implement a generation-based system.」（4.1 节）每代对每个**未解**任务起一个全新 agent，已解任务从活跃池移除，不再花 token。

```
输入: 任务池 T (|T|=50), 代数 G=10, 知识库 KB = {attempts: [], posts: [], bundles: {}}

for g in 1..G:
    A = { t ∈ T | t 未解 }
    # ---- 阶段 0: 执行 ----
    for t in A (最多 25 个容器并发):
        agent ← 全新实例（干净上下文, 无私有记忆/角色/定制 prompt）
        seed  ← { per_task_bundle: KB.bundles.per_task[t],
                  cross_task_bundle: KB.bundles.cross_task }   # 渲染成 MEMORY.md
        result ← agent.solve(t, tools=SDK 原生工具集, seed)     # 单次 solving session
        KB.attempts += (t, result.outcome, tool_trace, token_usage)
        if 验证器(result) 通过: T.mark_solved(t)               # 硬信号, 非自评

    # ---- 阶段 1: task-level forum, 1 轮 ----
    for t in A:  # 每个任务一个 thread
        for agent in 该任务本代及历史的贴主:
            require: 已调用 knowledge(t) 且 query(t, ...)      # MCP 检索门禁
            post ← { load_bearing_assumption, evidence,
                     evidence_post_id, proposed_change_for_next_gen,
                     predicted_outcome, confidence }
            # 读同 thread 早前帖, 引用 id 支持或反驳
            KB.posts += post

    # ---- 阶段 2: cross-task forum, 2 轮 ----
    room ← task_id = "__cross_task__"   # 哨兵房间, 全代共享
    round 0: 每 agent 贴 concrete_primitive + task_grounding（>=40 字符原文引用）
    round ≥1: 必须 cite 一个 peer post id 且取 AGREE | DISAGREE | SYNTHESIZE 之一,
              且 evidence_task_ids 非空且必须来自 Task Evidence Map
              （服务端硬拒绝：缺失或引用未知 task id 的 round-1 帖被 reject）
    每帖还需 anti_meta_self_check：论证该 primitive 不是「教科书搬来的通用建议」

    # ---- 阶段 3: distillation ----
    for t in A:
        KB.bundles.per_task[t] ← per_task_distill(仅该任务的 task-level posts)
    KB.bundles.cross_task ← cross_task_distill(仅 cross-task posts)
    # 两条输入流严格隔离, 防止 cross-task 猜测污染 per-task 策展
    # 每个 bundle 六字段: transferable_insights / confirmed_constraints /
    #   rejected_hypotheses / pitfalls / checks / next_steps (+ evidence_post_ids)
```

**运行时与工具面（Appendix A、F）。** 一次尝试的生命周期是：Engine（`engine.py`）派发任务 → Host launcher（`container_host`, `main.ts`）以 docker run 挂载并投入 JSON payload → 一次性 Worker 容器内的 agent-runner 驱动 provider 查询循环，其中知识库与 forum 通过 MCP 工具暴露 → 容器回一个 stdout JSON envelope → Host 归一化结果 → Engine 评分并落库（SQLite）。一个细节值得学：Host 会把「看起来成功但内容为空」的 envelope 重分类为 `silent_failure`，「so that they are not scored as false zeros」；ARC 的 attempt 文件预先填 `__NOT_SUBMITTED__` 哨兵，parser 拒绝该值，所以从未覆写的 run 记为 no-submission 而非答错，「the submission rate equals the actual overwrite rate」。任务执行期间**不暴露 benchmark 专属 MCP 工具**，benchmark 差异全部由 workspace 准备、trace 捕获与事后评估承担——这是「agent 保持通用」这一主张在工程上的具体兑现方式，也是它能成立的原因：所有 benchmark 特化都被推到 agent 之外。

**几个实现细节比协议骨架更有信息量。**

**每阶段的输入输出（按 3.1–3.3 节整理）。**

- 阶段 0（执行）。输入：任务描述、标准工具集、来自共享知识库的 seed bundle。输出：一次 attempt 记录（结果、tool_trace、token 用量）与硬验证器判定。约束：单次 solving session，全新上下文，无私有记忆、无角色专精、无任务专属架构、无定制编排。
- 阶段 1（task-level forum）。输入：本任务 thread 的历史帖 + 本次执行的 trace。输出：六字段 JSON 帖，构成「本任务的局部指导」——什么看起来重要、什么不该再试、下一个新 agent 动手前该验证什么。原文对内容范围给了域相关的例子：ARC 是不变色、物体边界、被拒变换、与训练样例的具体不匹配位置；coding / terminal 是 API 签名、test-runner 行为、文件路径假设、依赖问题、失败测试暴露的边界情况。
- 阶段 2（cross-task forum）。输入：本代所有 task-level 帖 + Task Evidence Map。输出：跨任务 claim（复发错误类型、验证策略、不变量、环境假设、分解模式），每条必须有具体证据支撑，round≥1 必须表态。这一阶段决定「哪些局部观察值得活过产生它的那个任务」。
- 阶段 3（distillation）。输入：存活的 per-task 帖（分任务）与 cross-task 帖（全代）。输出：per-task bundle + cross-task bundle，六字段 typed 结构。原文强调这是**选择**而非摘要：「Distillation is therefore designed as a selection step that is tailored to the new task rather than a generic summarization step」。

三阶段构成一个抽象阶梯（原文用词 abstraction ladder）：局部证据 → 经跨任务辩论存活的 claim → 紧凑 seed bundle。

**insight 的格式强制「具名」。** task-level post 的 `load_bearing_assumption` 必须点出「a specific tool, API, file, data shape, or invariant -- not a framing like 'read more carefully'」；cross-task post 的 `concrete_primitive` 必须是「a single named operation, API call, function/class, error type, file path, language feature, test-runner flag, or numeric invariant -- verbatim」，并显式列出被拒的措辞类型：「REJECT framings like 'separation of concerns', 'two-phase pipeline', 'pattern', 'approach', 'strategy', 'architecture'」（Listing 11、12）。这是防止知识库退化成鸡汤的第一道闸门。`predicted_outcome` 还要求可否证（"tests X and Y will pass; test Z still fails because ..."），等于给每条 insight 附一个可以被下一代实测打掉的预测。

**入库门禁是多层的，而且有一层在服务端。** 我数出五层：(a) MCP 服务端的检索门禁——`ForumProtocolState`（`memory/mcp_server.py`）在 agent 未先调用 `knowledge(task_id)` 与 `query(task_id, query=...)` 之前拒绝 `forum_post`，「This is what binds posts to retrieved evidence rather than free-form prose」（Appendix E.1）；(b) 服务端对 round-1 cross-task 帖的 `evidence_task_ids` 校验，缺失或引用未知 task id 直接拒；(c) schema 级的 `task_grounding.where_it_appeared` 要求 ≥40 字符的原文引用，且必须包含 `concrete_primitive` 里的一个非停用词；(d) `anti_meta_self_check`——原文强调「is part of the schema, not a prompt-level suggestion: posts whose concrete_primitive cannot be defended against the meta-test are dropped at distillation time」；(e) distiller 的选择性——「the distiller LLM is instructed to keep claims that are actionable, evidence-grounded, and scoped, and to drop vague advice that does not name the condition under which it applies」，且模糊值（如 "read more carefully"）被标记为待拒。搜索空间穷尽也有专门信号：`proposed_change_for_next_gen` 置为字面量 `EXHAUSTED`。

值得注意：这五层里只有 (a)(b)(c) 是硬约束，(d)(e) 依赖 distiller LLM 的判断。也就是说**「防止错误 insight 入库」的最后一道防线仍是一个 LLM 调用**（temperature 0.0），原文没有给出 distiller 判错率的量化评估（原文未给出）。

**disagreement 被当成证据而非不稳定。** 这是本文与 ExpeL [47]、Agent Workflow Memory [29]、AgentKB [24] 这类「agent 自己压缩自己轨迹」的路线的分界线：「Prior work relies on agent-side abstraction: single agents compress their own trajectories into reusable artifacts. We instead treat knowledge as evidence adjudicated through discussion among multiple attempts and multiple agents.」（第 2 节）Appendix C 给了三个端到端记录：

- ARC-AGI-1 任务 b548a754：round-0 帖 196 因为一次失败就把整个「marker 控制几何」假设族一刀切否掉；round-1 帖 240 引用同代已解任务 05f2a901（score 1.0）作反例 DISAGREE；distiller 的处理不是选边站，而是把否证**收窄到实际被试过的那一个参数化**——`FALSIFIED: marker-controlled rectangle extension [...] with parameterization 'marker positioned above rectangle -> rectangle remains unchanged' (score 0.0) -- UNTRIED: marker selects which rectangle transforms, ...`，并在 `next_steps` 里排出四个待试假设。第 2 代新 agent 拿到这个 bundle 后解出了该任务（score 1.0）。原文点评：「Had the swarm adopted the round-0 post as consensus, the marker-direction family would have been marked dead」。
- Polyglot `java__react` / `rust__react`：帖 157 声称两语言需要同一个 `equals()` 门；同一 agent 在 round 1 读了 Rust 侧的 per-task 帖 124 后**推翻自己**，指出 Java 的同步即时传播单栈内收敛、`previousValue.equals(newValue)` 足够，而 Rust 的循环式传播需要「snapshot before the loop, compare to final after the loop」。distillation 把冲突转成一条**条件化 insight** 加一条 falsification。`rust__react` 在第 2 代被解，实现的正是这个 scoped guard；`java__react` 在第 3 代被解。
- Polyglot `go__connect`（六边形棋盘连通性，seed 1 十代全未解）：关于 row-parity 邻居偏移 vs 统一 8-邻居并集的争论跨代持续，两派都没解出来，知识库**保留双方**为 FALSIFIED/UNTRIED 标记连同支持与反对证据，不强行取共识。原文把这称为 intended failure mode：「when the evidence is genuinely conflicting, the protocol's job is to keep the conflict legible to future agents, not to average it away.」

这三个例子是全文最有说服力的部分——它们展示了 skill 文件形态**结构上做不到**的三件事：收窄否证的作用域、把矛盾转成条件化 claim、把未解决的分歧当一等公民存下来。

**协议里一个未被强调但影响很大的设计：已解任务出池。** 「Solved tasks are removed from the active pool, so the system does not spend tokens revisiting tasks already passed.」（4.1 节）这条规则同时做了三件事：(a) 大幅压低成本，因为后期每代只处理越来越难的残余任务；(b) 把解率变成 10 代累积量；(c) **完全规避了 agent-centric 路线被批评的「新适配损害旧任务」问题**——因为旧任务不再被评测。这是一个方法论上的不对称：论文用「不重测已解任务」的设置来击败一个其主要缺陷是「重测会退化」的对照路线。我不认为这是刻意的，但它意味着知识库的单调性优势在本文里是**被设置保证的，而不是被验证的**。要真正验证，需要在第 10 代用当代知识库回测第 1 代已解的任务，看解率是否保持——这个实验原文没有做（原文未给出）。

## 3. 三个可检验的优势主张

Abstract 的原话是 improvement 可以更 **inspectable, transferable, and portable**（引言/摘要处并列，第 1 节另一处措辞为 inspected, condensed, and shared）。

**Inspectable（可审查）。** 主张：知识库是外部化的、可读的、可压缩的、可共享的，「the system no longer has to preserve an increasingly specialized agent, but instead maintains an external knowledge base that can be inspected, condensed, and shared across fresh agents」。支撑：这条**主要靠构造而非实验支撑**。Appendix B（Figure 5、6）展示了 ARC 与 Terminal-Bench 2 两条完整策展链路的真实知识资产文本；Appendix C.1 的 Table 5 给出可审查性的一个量化侧面（Haiku 4.5，seed 1，cross-task round≥1，关键词计数，可共现故列不互斥）：

| Benchmark | Posts (round≥1) | AGREE | DISAGREE | SYNTHESIZE |
|---|---|---|---|---|
| ARC-AGI-1 | 141 | 37 | 10 | 104 |
| ARC-AGI-2 | 123 | 38 | 9 | 81 |
| Polyglot | 249 | 80 | 14 | 167 |
| SWE-bench Pro | 265 | 61 | 15 | 201 |
| Terminal-Bench 2 | 576 | 296 | 25 | 308 |
| 合计 | 1,354 | 512 | 73 | 861 |

作者对「DISAGREE 只占 73/1354」的解释是这正是预期状态：「the stance requirement makes conflict explicit and forces it to carry evidence; it does not manufacture conflict」。我的读法略有不同：SYNTHESIZE 占到 861/1354（64%）说明模型的默认行为是「把两方话缝在一起」，而缝合恰恰是最容易生成看似兼容、实则失去作用域的泛化 claim 的动作。真正稀缺的是 DISAGREE（5.4%），而 Appendix C 的三个高价值案例全部来自 DISAGREE。也就是说，**协议里产出最大价值的那条通路使用频率最低**，原文没有讨论如何提升它（原文未给出）。另外注意一个诚实的坦白：GPT-5.4-mini 的 run「express contrast in free text without emitting the literal keywords」，所以关键词统计只能限于 Haiku 的 run——即**协议的结构化程度本身是模型依赖的**。没有针对可审查性的用户研究或人工评估（原文未给出）。

**Transferable（可迁移到新任务）。** 主张：distilled bundle 能提升未见任务的零样本表现。支撑：第 4.4 节 + Table 4，见下一节。

**Portable / persistent（跨 LLM 与跨 run 存续）。** 主张：知识资产的效用超出生成它的那次 run 和那个模型家族——「indicating that the improvement is not merely an LLM- or run-specific behavior」。支撑分两块：4.3 节 Table 3 证明**协议**在两个模型家族上都有效（同一流程换模型重跑）；4.4 节 Table 4 证明**产物**可以跨家族搬运（冻结资产，donor≠recipient）。第二块才是真正针对 portability 的实验，第一块只是协议鲁棒性。

## 4. 受控案例研究设置与结果

**构成。** 五个 benchmark，三个能力域（4.1、Appendix K）：Polyglot（Aider Polyglot，225 个 Exercism 练习，六语言；取 DGM 与 HyperAgents 用的同一 50 任务子集以保可比性）；SWE-bench Pro（731 个 public instance 中固定种子均匀随机采 50）；ARC-AGI-1（400 题训练集采 50）、ARC-AGI-2（1000 题中采 50），官方 exact grid match；Terminal-Bench 2（89 个真实终端容器任务，**全量使用**，因为要与 leaderboard 上的 harness 工程框架对比）。

**底座模型。** Haiku 4.5（Anthropic Claude Agent SDK）与 GPT-5.4-mini（OpenAI Agents SDK，medium reasoning）。forum 与 distillation 阶段用同样的 LLM，但走**不带 agent tooling 的直接 API 循环**。

**预算与超参（Appendix I）。** 10 代 × 50 任务池，本方法 3 seeds；每代 1 轮 per-task forum + 2 轮 cross-task forum；所有直接 LLM 调用 temperature 0.0；per-task 运行超时 1800s（冻结基线 sweep 放宽到 3600s，即本方法上限的两倍）；Terminal-Bench 2 以其原生 `task.toml` 超时为唯一时间界；forum/cross-task 作业各 900s；最多 25 并发容器；每任务最多 3 次**基础设施性**重试（超时/容器崩溃），已完成的尝试不论成败都不重跑，失败尝试的 token 计入成本。Polyglot session 内 `tries=2`（失败可见自己 test runner 最后 50 行输出，再试一次，对齐 Aider 惯例）；ARC 每 test input 两次盲提交。

**成本口径（Appendix G）。** 覆盖一次 run 的全部 LLM 调用：任务执行、per-task reflection、两类 forum、distillation；DGM/HyperAgents 的重跑同口径，**含其 meta-loop 自修改 token**。用各模型公开 API 费率折成美元，含 prompt cache 写/读费率，以便跨 cache 画像的方法可比。

**基线公平性处理（Appendix H）。** 所有重跑基线从 fork 执行，「No fork alters the baseline's core optimization algorithm」，偏差归为五类：新增 benchmark adapter、LLM 替换（统一模型）、information-parity gate（默认开，切断对 hidden test / gold answer 的旁路访问）、网络出口隔离、预算对齐与成本口径。具体做了：把上游 DGM/HyperAgents 硬编码的 600s per-task 上限与 120s Polyglot 测试超时改为读 sweep 级超时（3600s）并统一 Polyglot 测试执行为 180s；温度钉在 0.0；容器接入仅允许 provider API（与 PyPI）的 allowlist HTTP CONNECT 代理，防止 agent 用 shell 去网上抓 hidden test；DGM 的自改进 LLM 只看到 solved/unsolved 标量而非上游给的 gold patch 与 hidden test；Polyglot workspace 的 git history 被清洗，防止从 `git log` 恢复答案；零测试执行的评估算失败而非空过。这一套 parity gate 是这篇实验部分最扎实的地方，也意味着**其 DGM/HyperAgents 数字与两篇原论文公布的数字不可比**（原文明确声明）。

**benchmark 选择的自洽性与偏置。** 作者给出的选择理由本身透露了适用边界。ARC 被认为「particularly well-suited to studying knowledge curation: the underlying transformation rules are discrete and verifiable, and many rules recur across tasks in varied forms」；Polyglot 被认为适合是因为「recurring failure modes and language-specific idioms surface consistently across tasks」。两条理由的共同点是**任务间存在强复发结构**。这既是诚实的说明，也是一个未被讨论的选择偏置：知识策展的收益上限直接取决于任务分布中可复用命题的密度，而作者选的三类任务恰好都是高密度的。原文在迁移实验里侧面承认了这个依赖——「We observed that the amount of generalizable knowledge varies across benchmarks」（4.4 节），并因此才引入了动态决定迁移量的 adapter。在低复发、强异质的任务流上这套协议还剩多少收益，本文没有测（原文未给出）。

**结果 1：对 agent-centric 基线（Table 1a，Haiku 4.5，10 代）。**

| 方法 | ARC-AGI-1 | ARC-AGI-2 | Polyglot | SWE-bench Pro |
|---|---|---|---|---|
| OURS | 86.7%±4.2 / `$76`±16 | 82.7%±6.1 / `$80`±1 | 68.0%±2.0 / `$126`±6 | 64.0%±2.0 / `$208`±19 |
| HyperAgents [43] | 70% / `$234` | 60% / `$188` | 52% / `$190` | 42% / `$431` |
| DGM [42] | n/a | n/a | 58% / `$281` | 54% / `$713` |

OURS 为 3 seed 的 mean±std，**基线是单次 run**。DGM 在原文只评 coding 且自修改的是「coding capabilities」，故 ARC 两列标 n/a。SWE-bench Pro 上的成本差距最惊人：`$208` vs DGM 的 `$713`，解率还高 10 个点。

**结果 2：Terminal-Bench 2（Table 1b）。** OpenHands 13.9%、Terminus 2 28.3%、Mini-SWE-Agent 29.8%、Terminus-KIRA 33.7%、Goose 35.5%、Meta-Harness 37.6%、OURS 43.8%±3.4。但表注写得很清楚：这些对比分数取自 Meta-Harness 论文 [16] Table 7 汇编的 Haiku 4.5 条目，**是各系统在自己 harness 下的 reported score，不是重跑**（Appendix H）；且 Meta-Harness 那一行是 Claude Opus 4.6 做 proposer + Haiku 4.5 做 base agent。原文在正文里对这组数字的措辞也降了调：「achieves competitive performance against multiple strong agentic coding systems」——比 Table 1a 的表述保守。

**结果 3：对 prompt optimization（Table 2，预算对齐到 Table 1 的实际花费）。** GEPA [1] 在 ARC-AGI-1 跑 15 轮得 44%、Polyglot 跑 7 轮得 36%；OpenEvolve [23] 在 ARC-AGI-1 跑 81 轮得 54%、Polyglot 跑 46 轮得 46%；OURS 86.7%±2.0（原表为 86.7%±4.2）/ 68.0%±2.0。作者承认因为这两个基线收益有限，没有把它们扩展到更重的 benchmark。注意 Appendix H 的说明：OpenEvolve 在此被当作**system prompt 演化器**驱动（不像 AlphaEvolve 那样演化代码），这是 Table 2 把它标为 prompt optimizer 的原因——即这不是对 OpenEvolve 全部能力的评测。

**结果 4：跨 LLM（Table 3）。** GPT-5.4-mini 在四个 benchmark 上全面更好且更便宜：Polyglot 72.7%±2.3 / `$56`±1，SWE-bench Pro 70.7%±2.3 / `$157`±11，ARC-AGI-1 93.3%±7.0 / `$16`±3，ARC-AGI-2 90.0%±5.3 / `$20`±1。ARC 上的成本差异接近 5 倍（`$16` vs `$76`），原文未拆解原因（原文未给出）。结论措辞谨慎：「the curated knowledge protocol is not tied to a single LLM family, although the margins depend on the LLM.」

**结果 5：跨 agent / 跨模型的知识迁移（Table 4）——这是核心卖点。** 设置很讲究：donor 是产出知识的 LLM（在 50 任务自改进 split 上跑满 10 代，其 forum 与 distillation 产出被**冻结**）；recipient 是在 held-out 任务上消费这个冻结资产的 LLM。评测集构造：从与自改进 split 不交的候选池（arc1 是 400 题公开 evaluation split 中随机采 80，注意与自改进池所用 training set 是不同 split；polyglot 是 50 任务外的全部 175 题）里，先用 seed-0 无知识 solo baseline 跑两个 recipient（Haiku 4.5 与 GPT-5.4-mini），**取二者失败集的交集**，从交集随机采 20 题。recipient 的 run 是零样本、纯任务执行：无新 forum、无 recipient 侧 distillation；只有一个 task-conditioned adapter（单次 LLM 调用，temperature 0.0，明确禁止解题）把共享 donor 资产转成一份定制备忘。三 seed，报 mean±std。

Polyglot（20 题）：

| recipient \ donor | N/A | GPT | Haiku |
|---|---|---|---|
| GPT | 8.3%±2.9 | 20.0%±5.0 | 11.7%±2.9 |
| Haiku | 3.3%±2.9 | 11.7%±2.9 | 11.7%±2.9 |

ARC-AGI-1（20 题）：

| recipient \ donor | N/A | GPT | Haiku |
|---|---|---|---|
| GPT | 23.3%±2.9 | 43.3%±2.9 | 38.3%±12.6 |
| Haiku | 13.3%±2.9 | 28.3%±2.9 | 23.3%±2.9 |

八个 donor→recipient 组合全部为正增益，GPT 侧知识是更强的 donor，跨家族双向都为正。作者自己给出的解读边界很克制：因为 recipient 不跑 forum 也不 distill，增益只能来自推理时的冻结 bundle，说明它「carries donor-agnostic structure rather than donor-specific habits」；并主动点出 Haiku→GPT 在 ARC-AGI-1 的 seed 方差最大（±12.6），「so we read cross-family magnitudes as indicative rather than precise」。

**这组证据够强吗？我的判断：方向可信，量级不可信，且存在一个被作者自己披露但影响不小的污染。** 逐条说：

- **样本量太小。** 每格 20 题 × 3 seed。ARC 上 Haiku→Haiku 从 13.3% 到 23.3%，绝对值是 20 题里多解 2 题；Polyglot Haiku recipient 从 3.3% 到 11.7%，是从 0.67 题到 2.3 题。这个尺度上 ±2.9 的 std 恰好等于 1/20 = 5% 的量化步长的一半，说明三个 seed 基本落在相邻的整数解题数上。八格全正确实降低了「纯噪声」的可能性，但任何具体倍数（例如「Polyglot GPT recipient 翻了 2.4 倍」）都不该被当结论。
- **baseline 被构造成地板。** 评测题是「两个 recipient 都失败」的交集，原文自己说「because every selected task is unsolved by both recipients at selection time, the no-knowledge baseline solve rates are low by construction」。这个设计对「有没有 headroom」是正确的，但它让相对提升倍数失去意义，同时选择过程本身有回归到均值的成分（seed-0 选题、三个独立 seed 评测——作者明确说选择 run 与评测 seed 分离以避免偏置，这个处理是对的，但选题条件仍然筛出了「恰好那次失败」的题）。
- **Polyglot 迁移集有 same-exercise 泄漏。** Appendix J 主动披露：20 道评测题中有 7 道是 donor 题的**同一 Exercism 练习的另一语言实现**（例如 `go__ledger` vs `java__ledger`），「the split is therefore disjoint at the task-identifier level but not fully exercise-disjoint, so same-exercise recall may contribute to the polyglot transfer numbers」。7/20 = 35%，而 Polyglot 上的绝对增益只有 1–2 题量级——这意味着**Polyglot 的迁移结论几乎不能排除同题召回解释**。ARC 侧无此结构，所以 ARC 那半张表才是真正的迁移证据。
- **adapter 是一个未被消融的额外部件。** 迁移时的 task-conditioned adapter 会读当前任务与共享 prior，输出 0–3 项每字段的定制备忘（Appendix L）。原文说这是为了「dynamically determine how much knowledge to carry over per task and prevents the recipient memory from becoming noisy」，并承认这是在观察到「the amount of generalizable knowledge varies across benchmarks」后**放松约束**加进来的。问题是：no-knowledge baseline 不过 adapter，transfer 条件过 adapter，而 adapter 是一次带任务描述的额外 LLM 调用。它被禁止解题、被要求只做选择、`candidate_plan` 只能描述 approach 且第一步必须是读 starter 文件——这些约束设计得很谨慎，但**没有「空 prior 走 adapter」的对照组**，所以无法把「知识的贡献」与「多一次任务分析调用的贡献」分开。这是迁移实验最大的方法论漏洞。

## 5. 局限与证据强度的坦率评估

**作者承认的限制。** 结论节讲得比较克制：(1) 「Our experiments deliberately held agent architectures simple to isolate the effects of knowledge curation」——刻意简化 agent 是为了隔离变量，代价是没有测过与强 agent 架构叠加的效果，作者把「integrating the curation protocol with recursive search or complex planning modules」列为 promising frontier；(2) 长时程、需要子任务分解的场景未测，只说 benchmark 上的成功「provides a roadmap」；(3) 人类专家贡献知识未研究；(4) 第 3 节明确不宣称协议最优：「We do not claim that this protocol is optimal; rather, it provides a controlled way to test whether curated knowledge alone can drive self-improvement when agent design is held fixed.」；(5) Table 4 的跨家族量级只作 indicative；(6) Table 5 的 stance 关键词统计只适用于 Haiku run。

**我判断证据不足以支撑的部分。**

1. **对整条 agent-centric 路线的质疑，其经验基础只有两个重跑基线。** Abstract 的批评覆盖 prompt / workflow / harness / agent 代码四类，但实测的 agent-centric 系统只有 DGM 与 HyperAgents（重跑），加上 Meta-Harness（引用分数），prompt 侧有 GEPA 与 OpenEvolve（后者被降格为 prompt 演化器使用）。关键是：**「expensive to maintain and difficult to transfer」这个论点本身根本没被直接测量。** 论文测的是 solve rate 与 dollar cost，而维护成本、可迁移性衰减、「each new adaptation might degrade performance on the previous tasks」的降级现象——一个都没有量化。没有做「把 DGM 演化出的 agent 搬到另一个 benchmark 或另一个 LLM 上，看收益剩多少」这个实验，而这才是 transferability 主张的对称验证。所以整个第 1 节的批评在本文里的地位是**有说服力的机制性论证 + 间接的性能证据，不是被验证的实证结论**。
2. **「solve rate」的口径需要警惕。** 已解任务从池中移除、10 代累积，所以 Table 1a 的 86.7% 实质是「10 代内任意一代解出」的累积通过率，接近 pass@（最多 10 次尝试）。DGM/HyperAgents 的重跑同样是 50 任务 10 代预算，这部分可比；但 Table 1b 的 Terminal-Bench 2 leaderboard 分数是各系统自己 harness 下的 reported score，**是否同样享有 10 次尝试预算，原文未说明（此处原文表述模糊）**。43.8% vs Meta-Harness 37.6% 这个 6.2 点的差距，在缺少尝试次数对齐信息的情况下不能当作方法优越性的证据。
3. **缺少与 memory / experience-reuse 路线的实证对比。** 第 2 节花了大段篇幅论证本方法优于 ExpeL [47]、Agent Workflow Memory [29]、AgentKB [24]、Voyager [25]、A-MEM [34]、Mem0 [6]、MemEvolve [41] 这类「存自己的成功与失败」的系统——「Those systems accumulate the agents' own successes and failures, whereas our knowledge curation protocol converts experience into deeper, more scoped, evidence-grounded guidance」。**但实验里没有一个这类基线。** 这是我看来最重要的缺口：最自然的对照组不是 DGM，而是「同样冻结 agent、同样注入 MEMORY.md，但只做朴素经验回放/单 agent 自我总结、不做 forum 论辩」。没有这个消融，我们无法区分收益来自「知识外置」还是来自「多 agent 论辩式策展」。整篇论文最独特的机制（forum + 立场 + 否证收窄）恰恰是唯一没被消融的部分。
4. **协议内部零消融。** 1 轮 per-task forum / 2 轮 cross-task 是怎么定的、去掉 cross-task forum 会掉多少、去掉 `rejected_hypotheses` 字段会掉多少、去掉服务端检索门禁会掉多少——全部未给出。Appendix C 的三个 worked example 是**存在性证明**（这个机制确实发生过、确实促成了后续解题），不是**贡献度证明**。
5. **只是断言、目前没有证据的主张。** (a) 「inspectable」——只有定性展示与 stance 计数，无人工审查实验、无「人类能否据此删除/修正错误知识」的验证；(b) 结论节的 plug-and-play 生态愿景「different LLMs and agent variants can contribute to a unified body of reusable understanding」——Table 4 只做了单向冻结转移，**从未测过两个不同家族的 agent 向同一个知识库并发写入**，这个愿景完全未验证；(c) 「improvements are not merely LLM-specific behaviors prone to overfitting, but are instead generalized principles」——这句话的强度远超 Table 4 那 8 个 20 题格子能支撑的程度；(d) 「cheaper to maintain」——成本表衡量的是 run 时的美元开销，不是维护开销，两者被措辞混用了。
6. **规模。** 每 benchmark 50 任务（TB2 为 89）、10 代、3 seed，Terminal-Bench 2 的种子数与 Table 1b 是否为 3 seed 可从 ±3.4 推断为多 seed，但**基线全是单次 run**，两者的可比性天然不对称。这是一篇「controlled case studies」——作者自己在标题式表述里就用了这个词（Abstract：「We conduct controlled case studies」），措辞是诚实的。

7. **一个方向相反的隐忧：这套协议本身也是一个 harness。** 服务端门禁、schema 校验、两类 forum 的轮数、distiller 的取舍规则、迁移用的 adapter prompt、prompt cache 的 prefix/suffix 切分（Appendix E.4）——这些都是被人工设计并针对 benchmark 调过的工程结构。论文说 agent 是通用且一次性的，这在**任务执行体**的意义上成立；但整个策展流水线是一套相当复杂、不可丢弃的持久基础设施。也就是说，agent-centric 的维护成本没有消失，而是从「agent」搬到了「策展协议」。原文没有讨论这个转移是否真的更划算（原文未给出），而这恰恰是「cheaper to maintain」这个主张最需要论证的地方。

**总评。** 这篇论文的机制设计质量明显高于其实证强度。协议本身（typed schema、服务端检索门禁、立场强制、否证作用域化、per-task 与 cross-task 输入隔离）是我在这条线上看到过的最细致的知识策展工程；Appendix C 的三个案例足以说服我「forum 论辩确实能产出 skill 文件形态表达不出的知识」。但它对 agent-centric 路线的判决，在证据上是**欠款状态**：核心指控（维护成本、迁移衰减、单调性缺失）一条都没被测量，最独特的机制没有消融，最直接的竞争路线（memory/experience reuse）没有基线。我会把它当作一份很强的设计提案与一组有启发性的存在性证据，而不是一次范式判决。

**能被这篇说服的部分（避免只挑刺）。** 三件事我认为它确实立住了：(1) 在 agent 完全冻结、只有外部知识变化的前提下，多代解率能显著爬升，这本身就否定了「必须改 agent 才能自改进」这个隐含前提；(2) 带 parity gate 的 DGM/HyperAgents 重跑在成本上被拉开的幅度太大（SWE-bench Pro `$208` vs `$713`）——即使解率差距有口径争议，成本差距不太可能是口径造成的，因为成本口径明确含 meta-loop token；(3) 冻结资产的跨家族正迁移在 ARC 上八格全正、且 recipient 侧不跑任何策展，这在小样本的限制下仍然是一个方向明确的信号。

## 6. 与 skill 演化路线的正面对比

**两条路线的失效速度也不同。** skill 库的失效是**突变式**的：底层工具升级、API 改名、harness 换掉，一整批 skill 同时失效且往往静默失效（还能执行，只是行为错了）。知识条目的失效是**渐变式**的：某条命题在新任务上不再成立时，硬验证器会给出反证，条目最多是被降权或被后续 forum 打成 FALSIFIED，不会让 agent 执行错误动作。这一点对生产系统的取舍很实际：把关键路径的可执行逻辑放在 skill 里，你需要配版本钉死与回归测试；把它表达成知识条目，你换来的是安全性，代价是 agent 每次都要重新推导执行细节（更贵、更慢、方差更大）。本文的成本表看起来推翻了这个代价，但它的对照组是 DGM/HyperAgents 这类会跑 meta-loop 的重系统，不是「一个手写好 skill 的精简 agent」——后者才是工程上真正的竞争者，而论文没有这个基线。

| 维度 | 知识库（本文） | skill 文件演化 |
|---|---|---|
| 存储形态 | 结构化条目，SQLite 表 + typed bundle；字段含 applies_when / does_not_apply_when / evidence / confidence | 自然语言 Markdown（有时含脚本），本质是可执行指令文本 |
| 表达力 | 声明式、可带作用域与反例、可存否证与未试项 | 命令式；「不适用条件」与「已否证假设」无自然位置 |
| 检索方式 | 每代 distillation 主动为「当前任务」选择（per_task_bundle 精确匹配 + cross_task_bundle 共享），迁移时再过 task-conditioned adapter | 靠描述触发或语义检索；命中即整份注入，粒度粗 |
| 可迁移性 | 冻结资产可跨 LLM 家族搬运（Table 4 八格全正） | 与 harness、工具名、上下文格式耦合；换 agent 常需改写 |
| 可审查性 | 每条 claim 挂 {task_id, post_id, quote} 的证据链，可溯源到具体尝试 | 只能看到最终文本，产生依据在演化过程中丢失 |
| 冲突处理 | 保留为条件化 claim 或 FALSIFIED/UNTRIED 对照；未解分歧显式留存（go\_\_connect 案例） | 覆盖或追加；矛盾指令共存会互相抵消 |
| 典型失效模式 | 条目膨胀致噪声、distiller 误判、insight 过度具体只对原任务成立、上下文预算被 bundle 吃掉 | 稀释与自相矛盾、灾难性遗忘、越改越长没人敢删、绑定单一 harness |
| 谁承担正确性 | 证据流程（多 agent 交叉验证 + 硬验证器） | agent 载体本身 |

**互斥还是可叠加？可叠加，而且论文自己就是这么说的**——结论节把「investigating the synergy between knowledge-centric and agent-centric techniques」列为后续方向，正文也把这个范式称为 complementary paradigm（Abstract 与第 1 节两处都用了 complementary 而非 alternative）。两者改进的是不同的量：skill 演化改的是**程序**（怎么做），知识策展改的是**关于世界的命题**（什么成立、什么不成立、在什么条件下）。真正的争点不是二选一，而是**默认把新学到的东西写到哪一层**。我的判断：可执行、可测试、稳定复用的部分（脚本、命令序列、工具封装）应该沉淀为 skill；关于任务域的经验性命题（哪类失败复发、哪个假设已被否证、哪个不变量成立）应该沉淀为带作用域和证据的知识条目。现在多数 skill 自进化系统的问题是把第二类东西硬塞进第一类载体，然后被载体的表达力上限惩罚。

**一个更锋利的分层判断。** 把两条路线放在同一个坐标下看：skill 演化优化的是**动作空间**（agent 能做什么、以什么顺序做），知识策展优化的是**信念状态**（关于任务域什么为真）。这两者的更新频率和失效方式完全不同——动作空间的更新应该少而慎（每次都改变行为，风险高，需要回归测试），信念状态的更新可以多而细（单条错误的影响可被其它条目和硬验证器冲抵）。现在很多 skill 自进化系统的病根就是把高频、细粒度、带条件的信念更新压进低频、粗粒度、无条件的动作载体，于是必须在「不更新」和「污染 skill」之间选。正确的做法是给两层各自的更新通道：skill 保持稳定且经过回归验证，知识条目高频写入并允许被否证。

**如果我在做 skill 自进化，这篇迫使我回答的问题：**

1. 我的 skill 文件能不能表达「这条只在 X 条件下成立」和「这个假设已经被否证，但只在这一个参数化下」？如果不能，我每一次演化都在丢弃否证信息，后续 agent 会反复踩同一个坑。
2. 我 skill 里的每一条指令，能否溯源到一次具体的、有验证器结果的尝试？如果不能，我没有删除的依据，skill 库只能单向膨胀。
3. 我的改进有没有回归门禁？「each new adaptation might degrade performance on the previous tasks」这个失败模式在我的系统里是否可观测？本文用「已解任务出池」规避了这个问题（也因此绕过而非解决了它），我没有这层保护。
4. 我的 skill 换一个 base model / 换一个 harness 还剩多少收益？如果没测过，我不知道自己是在积累资产还是在积累负债。
5. 我的知识提炼是单 agent 自我总结，还是有第二方带证据的挑战？前者的错误率没有任何上界——本文最强的三个案例（帖 240 引用已解任务打掉过度泛化、帖 213 作者自我推翻、go\_\_connect 保留双方）全部依赖第二方证据，单 agent 自省结构上产生不出这些。
6. 我有没有硬验证信号？本文所有 insight 的可信度最终锚在 exact-match / test suite / 容器验证上。没有硬信号的自改进循环，forum 论辩会退化成互相点赞——Table 5 里 SYNTHESIZE 占 861/1354、DISAGREE 只占 73，说明即使有硬信号，趋同压力仍然是主导的。

## 7. 可复用的工程要点

1. **给 insight 定 typed schema，强制作用域与证据字段。** 直接照抄 `Insight`：`text`（"when X, do Y"）、`applies_when`、`does_not_apply_when`、`evidence: [{task_id, post_id, quote}]`、`confidence`。最关键的是 `does_not_apply_when` 与独立的 `rejected_hypotheses` 桶，并用 `FALSIFIED: <被否证的具体参数化> -- UNTRIED: <保留的替代项>` 格式记录——它把「否掉一个假设」和「否掉一整族假设」区分开，这是 Appendix C.2 里第 2 代能解出 b548a754 的直接原因。
2. **把入库门禁做到服务端，别只写在 prompt 里。** 本文的 `ForumProtocolState` 在 agent 未先 `knowledge(task_id)` + `query(task_id, ...)` 之前拒绝 `forum_post`；round-1 帖缺 `evidence_task_ids` 或引用未知 task id 一律 reject。任何写入知识库的调用都应有「先检索后写入」的硬前置和引用有效性校验，否则知识库会被无根据的散文填满。
3. **用「具名 primitive + 反元测试」压掉鸡汤。** 要求每条 claim 点出具体 API / 文件路径 / 错误类型 / 测试标志 / 数值不变量，并显式列黑名单措辞（"separation of concerns"、"two-phase pipeline"、"pattern"、"approach"、"strategy"、"architecture"）；再加一个 `anti_meta_self_check` 字段，让作者论证这条不是教科书搬来的，答不上就在蒸馏时丢弃。另外给「搜索空间已穷尽」留一个字面量信号（本文用 `EXHAUSTED`），避免后续 agent 无限重试。
4. **把每条 insight 附一个可否证预测。** `predicted_outcome` 要求形如「test X、Y 会过，Z 仍会失败因为……」。这让下一代的执行结果自动成为对该条知识的检验，知识库因此有了自动降权/淘汰的信号来源，而不必靠人工审查。
5. **隔离蒸馏输入流。** per-task bundle 只吃该任务的 per-task 帖，cross-task bundle 只吃 cross-task 帖（`distillation/distiller.py`）。这样跨任务的泛化猜测污染不了单任务的具体约束，反之亦然。跨层知识混在一个 prompt 里蒸馏是常见错误。
6. **迁移时用受限 adapter 做任务条件化选择，而不是整包注入。** 单次 temperature 0.0 的 LLM 调用，明确禁止解题，每个字段 0–3 项，prior 弱相关时允许返回空列表，冲突时以当前任务为准（Appendix L）。同时——这是本文没做而你应该做的——加一个「空 prior 走同一 adapter」的对照组，否则你分不清收益来自知识还是来自多出来的这次任务分析。
7. **成本口径必须覆盖 meta 循环。** Appendix G 的做法值得照搬：把执行、反思、论辩、蒸馏的全部 token 都算进去，用含 prompt cache 读写费率的美元计价而非裸 token 数，否则重度依赖缓存的方法与不依赖缓存的方法根本没法比。
8. **给 forum 的 prompt 做 cache 稳定性切分。** Appendix E.4 的做法直接可搬：把 forum prompt 拆成 `cacheable_prefix`（agent 与代次无关的内容：task 标识、描述、MCP 工具列表、轮次指令、输出 schema，`cache_control` 只挂在这一块）与 `variable_suffix`（本 agent 的历史尝试、原生 session 记忆、本轮 peer 帖）。因为 Anthropic 的 prompt cache 按到 `cache_control` 标记为止的内容哈希做键，前缀里改一个字节就会让每次调用的缓存全部失效。任何多轮、多 agent 的策展流水线都会反复重发同一段长指令，这个切分是成本表能好看的一个直接原因。
9. **让「已完成的尝试永不重跑，但基础设施故障可重试」成为默认。** Appendix I：每任务最多 3 次重试，仅针对超时或容器崩溃；一次完成的尝试无论成败都不重跑，且失败尝试的 token 计入成本。这条规则同时保证了成本口径的诚实性与解率统计的可解释性——否则「10 代累积解率」会被静默重试污染成一个无法解释的数字。
