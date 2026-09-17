# KnowAct-GUIClaw：GUI 助手的记忆与 skill 自演化

> 冻结底座模型，只演化经验记忆与状态校验型可执行 skill，在跨平台 GUI 助手上做工程闭环。

## 速览

- arXiv 2607.12625v2，[cs.CL]，2026-07-15。Lychee Team，哈尔滨工业大学（深圳）+ 深圳河套学院 AI Training Platform。核心作者 Yunxin Li、Jinchao Li、Baotian Hu、Min Zhang（第 7 节 Contributors）。代码与实验日志公开：`https://github.com/HITsz-TMG/KnowAct/releases/tag/Result`（5.7 节）。
- 是否冻结参数：**是，全程无权重更新**。全文没有任何训练、微调、RL 环节的描述；底座只以推理身份出现（5.1 节 Setup：「KNOWACT-GUICLAW pairs a Qwen3.5-397B-A17B host with a Qwen3.5-35B-A3B GUI executor」）。相关工作一节自己就把这条路线定位为「Agent memory and skill reuse let agents improve without weight updates」（2.3 节）。跨模型迁移实验（Kimi 轨迹蒸馏出的记忆 + skill 喂给 Qwen 35B executor）只换外部存储、不换权重，进一步印证。
- 演化对象：两类持久存储。
  - **经验记忆（experience memory）**：纯文本策略条目，格式固定为 `Title / Description / Content`（附录 C(e) 的诱导 prompt），来自成功与失败两套 prompt，每条轨迹最多 3 条，按 app 粒度去重。检索按语义相似度，作为 advisory 注入 Know 阶段；policy memory 则直接注入而不参与排序（4.2 节）。
  - **skill 库 + shortcut 库**：可执行的参数化过程，以 Python DSL 形式存储（`@skill(app=..., platform=..., skill_id=..., description=...)` + 一串 `await action(...)`，附录 D）。每条 skill 含 identifier、app/platform scope、description、parameters、reliability counters（如 `success_count`）、有序步骤；每步带 `valid_state`（自然语言期望状态）和可选 `state_contract`（结构化选择器 + sha256 fingerprint）。Android deeplink / intent 作为「一步 skill」放进 `A_shortcut`。
- 验证信号来自：MobileWorld 的原生确定性 evaluator（117 个 GUI-Only 任务，50 步上限，pass@1）；AndroidDaily 无原生 evaluator，GUI-only 任务用 qwen3.5-flash 当 LLM judge，需要返回答案的任务用两位人类专家按 1.0/0.5/0 计分（5.1 节）；HarmonyOS/Windows 跨平台检查用 qwen3.5-flash 判定或人工设计任务集（5.6 节）。skill/shortcut 层面还有独立的**在设备上的校验信号**：shortcut 候选必须真机拉起、记录前台 app/ADB 输出/UI tree/截图，再由 verifier 判 `page_validated`（4.5 节）。
- 一句话贡献：把 host–executor 两层编排、typed blackboard 跨 app 传值、经验记忆诱导、带状态契约的 skill 抽取/修复、shortcut 真机校验这五件事拼成一个可跑的 OpenClaw 式个人助手，并在 MobileWorld GUI-Only 上把 Kimi-K2.6 从 55.6 抬到 64.1（Table 1）。

## 1. 问题：它在补什么洞

作者的批评对象是 OpenClaw / Nanobot / Hermes 这类 local-first 个人助手框架，指出两个「核心瓶颈」：跨平台 GUI 交互支持不足、没有内建自演化机制（Abstract、第 6 节）。Introduction 把「直接塞一个独立 GUI agent 进 OpenClaw」的朴素做法拆成四条具体缺陷：

1. **跨 app 中间值丢失**。高层指令常跨多个互不相干的 app，自由文本摘要留不住上一个 app 抽出的中间数据；反过来，对模糊任务硬性要求显式指定目标 app，又会产生 app 分配幻觉。
2. **GUI 观测天生不完整**。截图、accessibility tree、前台 app ID、历史动作、模型自身推理日志，每一种模态都只暴露隐藏设备状态的一个投影（3.1 节把它形式化为 POMDP）。因此需要 host 记录历史轨迹并给轻量 GUI agent 可操作的指引。
3. **轨迹用完即弃**。成功与失败轨迹在任务终止时被丢掉，重跑相似任务要重新拉起 app、重做冗余导航、重新踩已知的失败模式。
4. **缺少非视觉快路径**，且快路径不能不经校验就当长期 skill 用。web search、Android deeplink、system intent、预设动作序列都能绕开视觉导航，但「such shortcuts cannot be safely repurposed as persistent long-term skills without validation against the real-time interface page」（Introduction）。

这四条洞对应四个机制：two-tier host–executor 协作、memory-grounded routing 与信息传递、knowledge/skill 增强执行、轨迹派生的记忆与 skill 演化。

## 2. Know-Route-Act-Reflect 框架详解

4.1 节把长时任务执行组织成四阶段循环，两个持久存储（memory & history store；skill & shortcut store）为每一阶段供给 advisory 上下文。GUI task 是 host 与 GUI subagent 之间的**形式边界**：每个 GUI task 返回三元结构化输出——完成状态、简明执行摘要、终止时的最终屏幕状态。

### Know：上下文收集与 host 控制

- **主动检索 + 策略注入**：动作发生前，按语义相似度检索历史 GUI memory 与候选 skill，二者**始终是 advisory，不覆盖当前指令**；policy memory 则直接注入，不参与排序（4.2 节）。Figure 3 的 Mastodon 邀请链接案例展示了这种 advisory 作用：检索到的教训把任务从不支持的移动端设置页改道到 web 管理面板，而不是回放旧轨迹。
- **host 持有上下文 + 主动回忆**：host 保留会话上下文，只在下发 GUI task 时转发该任务需要的部分；session history、agent memory、user profile 只在 host 自己判断相关时才召回。指令模糊时，host 用这些记忆提出**显式、可被覆盖的默认假设**。
- **host-centric 选择性委派**：当会话上下文、召回记忆或非 GUI 工具已足够、且无需观测/改变设备本地 GUI 状态时，host 直接自己回答子任务；只有需要活跃 app 会话、视觉 grounding、跨 app 操作、文本录入或端上验证时才下发 GUI task。

### Route：任务分解与信息契约

路由策略输出「单个 GUI task」或「有序多 app workflow」。多 app 情形下每个子任务是目标级四元组 $(g_i, h_i, I_i, O_i)$：$g_i$ 是 app 域内目标，$h_i$ 可选地收窄 app，$I_i$ 声明所需输入，$O_i$ 声明应返回的值。**router 不预测屏幕序列**；由于每个子任务绑定了 app，记忆与 skill 是为该子任务重新检索的，而不是从顶层路由继承。

信息传递靠短生命周期 blackboard，公式 (2)：

$$G(g_i, h_i, B_{i-1}[I_i]) \to \tau_i, \qquad E(\tau_i, O_i) \to B_i[O_i]$$

其中 $G$ 是 GUIClaw（在 POMDP 上执行子任务），$E$ 是 evidence-to-value 映射，$B_i$ 是第 $i$ 个子任务后的 blackboard。子任务只能看到 $B_{i-1}$ 上已声明的输入，只有声明的输出会从轨迹证据写回。关键设计：**缺输入或缺声明输出时 workflow fail closed**，不允许在不完整状态上跑子任务，也不允许后续子任务推断或编造该值。

### Act：GUI–快路径混合执行

混合动作空间，公式 (3)：

$$A = A_{gui} \cup A_{skill} \cup A_{shortcut} \cup A_{ask}$$

- $A_{gui}$：tap / swipe / scroll / 文本输入 / 导航 / app 开关 / wait 等类人原语（附录 B Table 7 给了跨平台统一动作表：共享 Click、DoubleTap、LongPress、Drag、Scroll、Type、Back、Home、Wait、Finished、CallUser；桌面额外有 Hotkey、Swipe、OpenApp、CloseApp；移动端额外有 PressEnter）。
- $A_{skill}$：从可复用 GUI 行为蒸馏出的 skill。
- $A_{shortcut}$：Android deeplink 与 intent，仅在目标设备上验证有效后使用；带历史校准交互参数的预设动作序列也可以放进来，但作者自己承认「such rigid shortcut schemes suffer from limited generalization capability」。
- $A_{ask}$：需要用户输入或授权时的介入动作。

观察–推理–动作回路，公式 (4)：$p_t \to o_t \to a_t \to e_t \to o_{t+1}$。prompt 携带子任务、任务 blackboard、policy memory、界面 hints 与可用 skill；一个归一化步骤把不同模型的输出映射到统一动作格式。附录 C(a) 的执行 prompt 里，skill 以 `Compact skills` 目录形式列出，模型用 `use_skill` 动作调用；决策流程第 0 步明确要求「动手做 GUI 动作之前先看 compact skill 列表」。

**skill 的运行时选择与守卫**（4.4 节 Skills 段）：

```
每个子任务开始前：
  candidates = retrieve_app_scoped(skill_store, 词法信号 + embedding 信号)   # Top-5
  choice    = applicability_prompt(candidates)   # 选一个可用前缀，或全部拒绝
  # 检索结果是 advisory：可以用一个，也可以退回普通动作

执行 skill 的每一步之前：
  if 存在确定性 state_contract:  按契约校验期望状态
  else:                          做视觉 valid-state 检查
  if 不匹配:
      运行有界的 recovery subgoal
      或 跳过 optional 的阻碍步骤
      或 交还控制权给普通 GUI 执行
```

稳定字段（app 包名、坐标、component、intent payload）事先固定，任务相关值以 placeholder 表示、运行时 grounding。deeplink/intent 在执行时被当作 `open_deeplink` / `open_intent` 的一步 skill，且只有目标页面、必需参数、app 状态都校验通过后才使用——作者特别点出这条是为了防止 `SEARCH`、`SEND`、`GET_CONTENT` 这类宽泛 Android 常量「仅因为 manifest 暴露了它就被执行」。

**跨平台抽象的实质**：靠的是附录 B 那张共享动作表 + 统一的 GUI task 接口，而不是某种平台无关的表示学习。原文说法是「This largely shared action surface is what lets a single host drive both platforms through the same GUI task interface」。skill 记录本身带 `platform` 字段，是平台绑定的；$A_{shortcut}$ 明确只覆盖 Android。所以「跨平台」在这篇里指的是宿主接口与动作面统一，skill 资产并不跨平台迁移（此处原文未明确讨论 skill 是否可跨平台复用）。

## 3. 自演化机制的具体实现

这是全文与「冻结参数、只演化记忆/skill」这条线最相关的部分，集中在 4.5 节 + 附录 C。

### 写入的准入门槛

后处理器先做摘要，并在启用时**先评估结果再学习**。以下运行**不写入长期存储**：空轨迹、被取消、在产生进展前超时、以及「completed entirely by an already reused skill」（完全由已复用 skill 完成，因为没有新信号）。这条最后一款其实很实用：它避免了 skill 库对自己成功案例的自我强化循环。

### skill 抽取：不是回放，是重写

对选中的轨迹，reflection 抽取可复用过程而非存原始动作。流程是：把 GUI 事件重写为结构化证据（任务、平台、观测到的 app、动作序列、动作参数、截图、目标控件 hints、推断出的 state contracts）→ 一个 vision LLM 在**受限 prompt** 下只允许输出声明式动作序列 → 候选 skill 归一化，并检查五项：支持的动作类型、声明的参数、可执行的固定字段、可复用的 app scope、valid-state 覆盖。被接受的步骤继承从轨迹推断的 state contract，「so later execution validates screen state instead of replaying an ungrounded script」。

附录 C(b) 的抽取 prompt 把限制写得很硬，这些约束本身是可借鉴的工程资产：

- 函数体**只能**包含 `await action(...)`，不允许 if/for/while/try、赋值、计算、helper 调用、返回值。
- 不允许 f-string、字符串拼接、算术、比较、推导式、嵌套调用；只能用字面量或 `{{param}}` 占位符。
- `fixed_values` 只能放可执行动作字段（x、y、text、key、component、package、intent_action、extras 等），**绝不能**放 `resource_id`、`content_desc`、`class` 这类选择器。
- 每个必需交互步骤都必须有自然语言 target 和具体的现在时 `valid_state`；若某必需步骤没有可验证状态，就删除或重新生成该步骤，而不是留空 `valid_state`。
- `state_contract` 不允许凭空发明选择器，只能照抄 trajectory/codegen 提供的契约。
- 丢弃重复点击、探索性 tap、无意义滚动；瞬时弹窗（广告、权限、同意）保留为 `optional=True` 步骤，executor 在其不出现时跳过。
- **description 必须泛化**：只能提 app 名、能力、粗粒度功能路由，参数角色用 query / media item / contact / item 这类词，禁止嵌入字面值、具体标题、以及 "specific / official / first result / top result" 这类窄化限定词。
- **安全护栏**：省略 pay、delete、send、submit order、publish、不可逆同意这类破坏性或对外可见的确认动作，除非原始用户任务明确要求。
- 失败轨迹：保留可复用的成功前缀；若失败屏幕明确显示一个安全的纠正动作，最多追加一个非固定的纠正步骤，且不得为其编造坐标或 state_contract。

离线抽取用同一个 agent，先过滤过短或异常轨迹，保留有界的成功前缀，把结构上相同的 skill 聚类，并记录 success count 作为检索优先级。

### skill 演化：修复优先于新增

作者明确把 repair 与 new extraction 分开，且**repair 优先**：只有当不存在「失败的被复用 skill」时，系统才去挖新 skill。当轨迹显示某个被复用的 skill 失败时，reflection 记录失败步骤、屏幕证据、错误、原始 skill 与历史反馈，交给 evolution prompt **就地更新同一条 skill**。允许的修改是：收窄 description、加带守卫的 optional 阻碍处理、刷新过期的 target 与 state contract。禁止的是：用无关 workflow 替换该 skill、添加破坏性终止动作（附录 C(c) 复述了同一组规则，并要求 `skill_id` 由调用方保留）。

### 错误经验如何避免被固化

这篇没有引入新的置信度或效用估计机制，靠的是三层朴素但具体的守卫：

1. **写入前过滤**：无信号轨迹不入库；短/异常轨迹被记忆诱导器跳过；每任务保留条目数有上限；同 app 内近重复被丢弃（4.5 节 Experience memory）。
2. **使用时降级为建议**：记忆与 skill 都是 advisory，Top-5 检索后还要过一道轻量 applicability prompt，可以整体拒绝；执行每步前有 state contract 或视觉 valid-state 校验，不匹配就有界恢复 / 跳过 optional / 退回普通 GUI（4.4 节）。这实质上把「错误经验的代价」从「直接执行错动作」降到「多花一次校验」。
3. **shortcut 的真机校验闭环**：manifest 挖出的候选被当作发现证据而非可信动作；validation run 拉起候选变体，记录前台 app、ADB 输出、UI tree、截图，verifier 返回 usability、page status、payload 是否保留、参数、自然语言能力描述。只有 `page_validated` 的记录才被提升为一步 skill；仅「可拉起」的记录默认停留在候选状态。附录 C(d) 还额外规定：只在搜索历史或建议里出现的 query **不算** payload_preserved。

有没有独立验证环节？**skill 层面有**（每步状态契约 + shortcut 真机校验），**经验记忆层面没有**——文本教训只经过诱导 prompt 与去重，没有任何离线正确性验证，只靠「advisory、不覆盖指令」来限制其危害。这是这套设计里最松的一环。

## 4. 实验设置

- **Benchmark**：MobileWorld（Kong et al., 2025）为主，全集 201 任务 / 20 应用，本文用其中 **117 任务的 GUI-Only 子集**，由 benchmark 原生确定性 evaluator 打分，50 步上限，主指标为单次成功率 SR（pass@1），pass@3 仅作为重复尝试上界单列（Table 5）。AndroidDaily（StepFun, 2025）为补充端到端 benchmark，按任务类型/复杂度/歧义度分组，很多任务要求返回显式答案；无原生 evaluator，GUI-only 任务用 qwen3.5-flash 判定，返回答案类任务由两位人类专家打分（正确 1.0、部分 0.5）。报告 `resolved`（194 个可用任务）与 `all`（把 41 个不可用条目记 0，共 235 任务）两种设定。
- **设备/平台**：MobileWorld 走 Android 栈；**AndroidDaily 的评测在 iOS 设备上进行**（5.1、5.4 节，作者重复强调了两次）。另有 HarmonyOS 63 个 MobileWorld 派生任务与 Windows 30 个手工设计桌面任务（5.6 节）。
- **底座模型**：默认 Qwen3.5-397B-A17B 做 host + Qwen3.5-35B-A3B 做 GUI executor；Kimi-K2.6 配置中 Kimi-K2.6 同时充当 host 与 executor；Kimi-to-Qwen 迁移配置保持 Qwen host–executor 对，只换成由 Kimi-K2.6 轨迹蒸馏的记忆 + skill 联合集。
- **baseline**：MobileWorld 公开榜三类——通用模型（Seed-2.0-Pro、GPT-5.5、Gemini-3.1-Pro-Preview、Claude-Opus-4.7、Kimi-K2.6/K2.5、Claude-Sonnet-4.5、Qwen3.5 三档、Qwen3-VL-235B）、agentic 系统（Gemini-3-Pro/GPT-5/Claude-4.5-Sonnet + UI-Ins-7B）、专用 GUI 模型（GUI-Owl-1.5-32B/8B、ForgeOwl-8B、MAI-UI-235B/32B、Doubao-1.5-UI-TARS、UI-Venus-72B、GUI-Owl-7B）。AndroidDaily 的 baseline 是 UI-TARS-1.5、Step-GUI-4B、Step-GUI-8B。
- **指标**：SR / pass@3，加执行成本四项——GUI steps、GUI task 调用次数、执行的 GUI-trace token 总量（`Total`）、host 自身生成 token（`Host Total`）。

## 5. 结果与消融

### MobileWorld 主结果（Table 1，pass@1）

| 配置 | SR (%) |
| --- | --- |
| Qwen3.5-35B-A3B 裸 executor | 24.8 |
| 35B + host & memory | 34.5 |
| 35B + host, memory & skills | 37.9 |
| 35B + host, **Kimi 蒸馏的** memory & skills | 41.0 |
| 397B host 直接执行 | 46.2 |
| Kimi-K2.6 + host & memory | 61.5 |
| Kimi-K2.6 + host, memory & skills | **64.1** |

对照：Seed-2.0-Pro 63.2、GPT-5.5 62.4、Gemini-3.1-Pro-Preview 58.1、Kimi-K2.6 裸模型 55.6、Qwen3.5-397B-A17B 榜上 42.7、最强专用 GUI 模型 GUI-Owl-1.5-32B 43.9。也就是说 64.1 只比 Seed-2.0-Pro 高 0.9 点，比 GPT-5.5 高 1.7 点——SOTA 成立但边际很薄，而 117 任务上 1 个任务约值 0.85 点，即优势相当于**一个任务**。

### 系统级消融（Table 2）

| Config | Setting | SR (%) | GUI steps | GUI tasks | Total | Host Total |
| --- | --- | --- | --- | --- | --- | --- |
| A | 35B exec. only | 24.8 | 26.7 | 1.0 | 281,266 | – |
| B | + host & mem | 34.5 | 26.8 | 2.3 | 279,211 | 65,224 |
| C | + skills | 37.9 | 25.1 | 2.5 | 278,289 | 63,792 |
| D | 397B exec. only | 40.7 | 26.1 | 1.0 | 254,459 | – |
| E | + host & mem | 43.3 | 26.8 | 1.4 | 273,352 | 10,096 |
| F | + skills | 46.2 | 23.7 | 1.7 | 260,516 | 10,982 |

拆解自演化组件的贡献：

- **host + router + 经验记忆**：A→B 是 +9.7 点（24.8→34.5），D→E 只有 +2.6 点（40.7→43.3）。token 总量在 35B 上基本不变（281k vs 279k），在 397B 上上升约 7%（254k→273k）。注意 A→B 这 9.7 点里混合了 host 编排、router、经验记忆三者，**原文没有把经验记忆单独拆出来**——这是消融设计上最大的缺口，读者无法知道记忆本身值几分。
- **skills**：B→C 是 +3.4 点（34.5→37.9），E→F 是 +2.9 点（43.3→46.2），且步数与 token 同时下降（397B 上步数 26.8→23.7，token 降约 5%）。这是「精度升、成本降」的少见组合，来源是更短的轨迹和更少的截图观测。
- **限定在真正调用了 skill 的任务上**（Table 3；35B 上 83 个任务，397B 上 87 个）：GUI steps 两档都是 −3.3（35B 29.0→25.7；397B 25.6→22.3），total tokens 分别 −6.2% 与 −5.9%，SR +4.9（35.7→40.6）与 +1.9（48.3→50.2），pass@3 只有 +1.2 与 **+0.0**（63.2→63.2）。pass@3 几乎不动这一点值得注意：skill 主要在压缩路径长度、提高单次命中率，**并没有扩展系统的能力边界**。
- 正文 5.3 节写「improves SR (+4.8 and +1.9 points)」，但 Table 3 中 40.6 − 35.7 = 4.9，与正文的 4.8 不一致（此处原文表述不一致，取表格为准）。
- Kimi→Qwen 迁移：41.0 vs 标准 35B 三件套 37.9（+3.1）vs 裸 executor 24.8（+16.2）。作者自己收敛了结论口径：「establishes transferability in the tested Kimi-to-Qwen direction without assuming universal model-independent transfer」。Abstract 里的「improving by 8.5% with Kimi-2.6 and 16.2% with Qwen3.5-35B-A3B」对应 55.6→64.1 与 24.8→41.0。
- host 不该把所有事都丢给 GUI（F 行）：397B host 直接解决合格的信息查询子任务后，GUI task 调用从 C 的 2.5 降到 1.7，total token 从 278,289 降到 260,516，host total 从 63,792 降到 10,982，同时 SR 最高（46.2）。
- Table 2 的 D 行 40.7 是作者自己跑的 397B plain-GUI 结果，与其公开榜分 42.7 不同，作者做了显式说明；Table 1 里「397B host acts directly 46.2」等于 Table 2 的 F 行。
- Table 5 的重复尝试上界：pass@3 any-of-3 从 A 的 34.2 升到 F 的 59.8，all-3 从 15.4 升到 32.5。all-3 只有 32.5 说明即便最好配置，三次全对的任务也只有三分之一，稳定性仍是主要短板（作者对此的表述是「without large random volatility」，偏乐观）。

### AndroidDaily（Table 4）

Ours (Resolved) 总分 78.61，Ours (All) 64.89；baseline UI-TARS-1.5 56.64、Step-GUI-8B 52.50、Step-GUI-4B 49.06。最大优势落在 Analyze（77.08 resolved vs UI-TARS 36.71）与 Comp. 复杂任务（62.50 vs 13.64）。作者把 resolved 与 all 的差距归因于 app 可用性与环境不匹配，并承认「these factors, rather than policy quality alone, account for a substantial fraction of end-to-end failure」。

### 跨平台（5.6 节）

HarmonyOS 48/63（76.2%），Windows 21/30（70.0%）。失败模式描述得相当具体：HarmonyOS 上惯性滚轮时间选择器无法停在 25 分而耗尽步数预算；淘宝「立即支付」按钮被误判为已到支付页；多个快捷设置任务反复打开左侧通知面板，而 HarmonyOS 需要从右侧下滑。Windows 上微信表情面板选错了「笑」的无标签图标（自然语言情感标签到视觉相似图标的映射失败）、Slack 短暂 toast 需要持续观察与即时点击（时间性 grounding 弱）、以及连续几何控制、深层应用特定控件、视口外目标。

## 6. 局限与作者自述的边界

作者自述：

- shortcut 里的刚性预设动作序列「泛化能力有限」（4.4 节）。
- 迁移性只在 Kimi→Qwen 单方向验证，不假设普适的模型无关迁移（5.3 节）。
- 当前是刚性的顺序 pipeline handoff；未来工作要做统一联合 planner，在一个决策周期内同时权衡知识检索、非视觉工具调用与 GUI 动作，并削减 host–subagent 通信开销（第 6 节）。
- AndroidDaily 的 all/resolved 差距有相当比例来自环境问题而非策略质量（5.4 节）。

我另外发现、作者没说的问题：

1. **经验记忆的贡献从未被单独消融**。A→B 把 host、router、memory 三者捆在一起报 +9.7 点，而 host 编排（尤其 host 直接解决子任务）在 F 行被证明本身就很值钱。对只关心「记忆演化值多少」的读者，这篇给不出答案。
2. **没有演化曲线**。自演化的核心问题是「随运行次数增长，性能如何变化」，但全文没有任何 SR-vs-轮次曲线、skill 库规模随时间的统计、repair 触发频次、skill 命中率随时间的变化。呈现的是「有记忆/skill vs 无」的二值对比，本质更接近一次性离线蒸馏后的静态增强，而不是持续演化的证据。
3. **记忆/skill 的来源与测试集是否同分布，说得不清楚**。skill 与记忆由 MobileWorld 轨迹蒸馏，评测又在同一个 117 任务子集上——是否存在跨任务/跨轮次的泄漏（例如同一任务先跑一遍产生 skill 再重跑）原文未交代（此处原文表述模糊）。这直接影响 +3.4 / +2.9 点该怎么读。
4. **skill 库的规模、增长与淘汰缺失**。原文给了聚类去重与 success_count 排序，但**没有任何淘汰/遗忘规则**：失败的 skill 只被就地修复，不会被降权删除；记忆条目只有「每任务上限 + 同 app 近重复丢弃」，没有全局容量上限或老化机制。长期运行下的库膨胀与检索噪声没有讨论。
5. **依赖坐标固定**。`fixed_values` 里写死 x/y（附录 D 中拼多多搜索框 x=242, y=88），即使有 state_contract 校验，跨机型分辨率与 UI 版本变更下也只能靠 evolution prompt 刷新「stale targets」被动修复。原文没有报告 skill 失效率。
6. **评测口径混杂**。AndroidDaily 用 qwen3.5-flash 当 judge + 人工 0.5 部分分，HarmonyOS 也用 qwen3.5-flash 判定，只有 MobileWorld 是确定性 evaluator。跨平台的 76.2% / 70.0% 因此不具备与他人比较的意义（作者也只称之为 usability check）。
7. **SOTA 边际过薄**。64.1 vs 63.2，在 117 任务、pass@1、无多次运行方差报告的条件下，这个差距不足以支撑「beating all agential frameworks and closed-source agentical models」的强主张。

## 7. 学术贡献密度的坦率评估

直说：**这是工程集成，不是新机制**。

- **记忆侧**几乎是 ReasoningBank 的直接搬运，作者自己写了「Inspired by ReasoningBank (Ouyang et al., 2026)」，成功/失败双 prompt、每轨迹最多 3 条、去重，这套流程与 ReasoningBank 同构，新增的只是「按 app 解析 outcome」「同 app 内去重」这种领域适配。
- **skill 侧**是 Voyager 式可执行 skill 库在 GUI 域的重述。真正有增量的是 `valid_state` + `state_contract`（带 sha256 fingerprint 的结构化屏幕契约）这一层——把「回放脚本」变成「每步校验状态的守卫过程」，以及 optional 步骤守卫瞬时弹窗、破坏性动作黑名单。这些是扎实的、别处不容易照抄到的工程知识，但它们是可靠性工程，不是学习机制：没有效用估计、没有置信度更新、没有 skill 之间的组合或抽象层级、没有淘汰。
- **repair 优先于新增**这条策略算是一个小而清晰的设计判断（避免同一失败模式反复派生近重复 skill），但它是一条启发式规则，不是一个可分析的机制。
- **blackboard 类型化契约 + fail closed** 是本文最像「机制」的部分，也是最有原创感的一点：把跨 app 信息传递从自由文本摘要改成声明式输入输出契约，缺值即失败而非编造。不过这属于多 agent 工作流工程，与自演化无关。
- 与 DIVE / MetaSkill-Evolve 一类「明确提出新演化机制」的工作相比，这篇缺的正是机制层的东西：没有演化算子的形式化、没有收敛或增益随时间的分析、没有对「什么样的经验值得保留」给出可度量的判据（用的是 LLM prompt 里的自然语言规则）。它的价值在于 **把一堆已知机制在真实多平台设备上跑通，并公开了 prompt 契约与实验日志**。

值得借鉴的部分：状态契约 + optional 守卫的 skill 执行协议；shortcut 的真机 page_validated 校验闭环；skill 抽取 prompt 里那套「不许发明选择器 / 不许写控制流 / description 必须泛化 / 破坏性动作黑名单」的硬约束；「已被复用 skill 完成的任务不写入存储」这条防自我强化规则；host 选择性接管信息查询子任务以省 GUI 调用。

只是特定场景适配的部分：Android deeplink/intent 挖掘与校验（强绑定 Android manifest 机制）；`click_then_type` / `click_multi` 这类复合动作（是 GUI token 成本优化，与自演化无关）；跨平台动作表统一（工程必需，无理论内容）；MobileWorld 风格的执行 prompt 模板。

## 8. 可复用的工程要点

1. **给每个可执行 skill 步骤配双层状态守卫**：优先用确定性契约（结构化选择器集合 + 屏幕指纹哈希），退化时用自然语言 `valid_state` 让 VLM 判断；不匹配时的三种出路要预先定义好——有界恢复子目标、跳过 optional 步骤、退回通用执行。不要让 skill 变成无守卫的回放脚本。
2. **抽取 prompt 用「白名单 + 禁止清单」而非自由生成**：限定动作类型集合、禁止控制流与表达式、`fixed_values` 只许放可执行字段而不许放选择器、必需步骤必须有可验证状态否则重新生成。这套约束把 LLM 抽取出的 skill 的可执行率与安全性抬上来，成本只是 prompt 长度。
3. **写入前设「无信号过滤器」，其中包含「完全由已复用 skill 完成」这一条**。这条比看起来重要：它切断了 skill 库对自身成功案例的正反馈，避免库里堆满同一模式的近重复条目。
4. **修复优先于新增，且修复必须就地**：失败时先判断「是不是某个被复用的 skill 导致的」，是则只允许收窄 description、加守卫的 optional 步骤、刷新过期 target/契约，禁止换成无关 workflow、禁止追加破坏性动作、保留原 skill_id。只有不存在失败的复用 skill 时才挖新 skill。
5. **破坏性动作黑名单写进抽取与演化两处 prompt**：pay / delete / send / submit order / publish / 不可逆同意一律不进 skill，除非原始用户任务显式要求。这是把「自演化」放到真实设备上的前提条件。
6. **跨子任务传值用类型化契约 + fail closed**，而不是自由文本摘要：每个子任务声明 $(g_i, h_i, I_i, O_i)$，只从 blackboard 读声明的输入、只写声明的输出，缺值直接失败。禁止下游子任务推断或补全缺失值——这是长时跨 app 任务里最容易被静默污染的地方。
7. **让 host 自己解决合格的信息查询子任务**。Table 2 的 C→F 显示这一条同时提高 SR 并降低两项成本（GUI 调用 2.5→1.7，total token 278k→261k，host token 63.8k→11.0k）。判据要写明确：无需观测/改变设备本地 GUI 状态时不下发 GUI task。
