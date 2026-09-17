# 论文阅读合集（PaperRead）

按主题整理的论文阅读资料：每篇论文的**解读**（Markdown / HTML）入库，**PDF 原文不入库**，
统一以 arXiv 链接给出，便于在线检索与引用。

## 目录

| 专题 | 内容 | 篇数 | 入口 |
| --- | --- | --- | --- |
| 01 视频编辑 | 六大主题分组 + 阅读路线与方法选型 | 30 | [`01_视频编辑/00_开始阅读.html`](./01_视频编辑/00_开始阅读.html) |
| 02 Agent 自进化 | Skill / harness 自进化论文解读 | 25 | [`02_Agent自进化/reading_report.md`](./02_Agent自进化/reading_report.md) |
| 03 递归自进化 | RSI 时间线综述 + 深度版 / 通俗版双版本解读 | 13 份解读 | [`03_递归自进化/时间线综述.md`](./03_递归自进化/时间线综述.md) |
| 04 Agent Harness 与验证 | Harness 工程综述、LLM-as-a-Verifier、RewardHarness | 7 份解读 | [`04_Agent_Harness与验证/`](./04_Agent_Harness与验证/) |
| 05 图像生成（MACRO） | 多参考图生成，两份独立解读 | 2 份解读 | [`05_图像生成_MACRO/`](./05_图像生成_MACRO/) |

## 本地阅读器

- 统一阅读器（全库检索 + 侧边导航）：`cd reader && node server.js`（默认 8912 端口）
- 视频编辑专用阅读器（含 Mermaid 渲染）：`python3 01_视频编辑/reader_server.py`（默认 8000 端口）
- 02 / 03 各自带独立阅读器：`02_Agent自进化/server.js`、`03_递归自进化/server.js`

> PDF 原文不在仓库内。如需本地离线阅读，按下方 arXiv 链接下载后放入各专题的 `论文原文/`（01）
> 或 `pdfs/`（03）目录即可，两个阅读器会自动识别。

---

## 01 视频编辑（30 篇）

六个主题分组，每组含论文解读 Markdown；编号与 `论文原文/` 中的 PDF 一一对应。

### 01_基础范式（6 篇）

把图像扩散模型改造成视频编辑器的早期范式

- [Tune-A-Video](./01_视频编辑/01_基础范式/01_Tune-A-Video.md) — [arXiv:2212.11565](https://arxiv.org/abs/2212.11565)
- [Text2Video-Zero](./01_视频编辑/01_基础范式/02_Text2Video-Zero.md) — [arXiv:2303.13439](https://arxiv.org/abs/2303.13439)
- [Video-P2P](./01_视频编辑/01_基础范式/03_Video-P2P.md) — [arXiv:2303.04761](https://arxiv.org/abs/2303.04761)
- [FateZero](./01_视频编辑/01_基础范式/04_FateZero.md) — [arXiv:2303.09535](https://arxiv.org/abs/2303.09535)
- [Rerender A Video](./01_视频编辑/01_基础范式/05_Rerender-A-Video.md) — [arXiv:2306.07954](https://arxiv.org/abs/2306.07954)
- [TokenFlow](./01_视频编辑/01_基础范式/06_TokenFlow.md) — [arXiv:2307.10373](https://arxiv.org/abs/2307.10373)

### 02_一致性机制（5 篇）

跨帧一致性：光流、token 合并、形变场、I2V 先验

- [FLATTEN](./01_视频编辑/02_一致性机制/01_FLATTEN.md) — [arXiv:2310.05922](https://arxiv.org/abs/2310.05922)
- [RAVE](./01_视频编辑/02_一致性机制/02_RAVE.md) — [arXiv:2312.04524](https://arxiv.org/abs/2312.04524)
- [VidToMe](./01_视频编辑/02_一致性机制/03_VidToMe.md) — [arXiv:2312.10656](https://arxiv.org/abs/2312.10656)
- [CoDeF](./01_视频编辑/02_一致性机制/04_CoDeF.md) — [arXiv:2308.07926](https://arxiv.org/abs/2308.07926)
- [AnyV2V](./01_视频编辑/02_一致性机制/05_AnyV2V.md) — [arXiv:2403.14468](https://arxiv.org/abs/2403.14468)

### 03_反演与传播（5 篇）

反演质量与首帧编辑的传播问题

- [Videoshop](./01_视频编辑/03_反演与传播/01_Videoshop.md) — [arXiv:2403.14617](https://arxiv.org/abs/2403.14617)
- [DNI](./01_视频编辑/03_反演与传播/02_DNI.md) — [arXiv:2409.13037](https://arxiv.org/abs/2409.13037)
- [DreamMotion](./01_视频编辑/03_反演与传播/03_DreamMotion.md) — [arXiv:2403.12002](https://arxiv.org/abs/2403.12002)
- [FastVideoEdit](./01_视频编辑/03_反演与传播/04_FastVideoEdit.md) — [arXiv:2403.06269](https://arxiv.org/abs/2403.06269)
- [GenProp](./01_视频编辑/03_反演与传播/05_GenProp.md) — [arXiv:2412.19761](https://arxiv.org/abs/2412.19761)

### 04_主体运动视角（5 篇）

主体身份、动作模式、轨迹与相机视角的解耦

- [MotionDirector](./01_视频编辑/04_主体运动视角/01_MotionDirector.md) — [arXiv:2310.08465](https://arxiv.org/abs/2310.08465)
- [DragAnything](./01_视频编辑/04_主体运动视角/02_DragAnything.md) — [arXiv:2403.07420](https://arxiv.org/abs/2403.07420)
- [DIVE](./01_视频编辑/04_主体运动视角/03_DIVE.md) — [arXiv:2412.03347](https://arxiv.org/abs/2412.03347)
- [VideoMage](./01_视频编辑/04_主体运动视角/04_VideoMage.md) — CVPR 2025
- [Reangle-A-Video](./01_视频编辑/04_主体运动视角/05_Reangle-A-Video.md) — [arXiv:2503.09151](https://arxiv.org/abs/2503.09151)

### 05_统一编辑框架（5 篇）

2025 年统一条件接口与视频基础模型

- [Align-A-Video](./01_视频编辑/05_统一编辑框架/01_Align-A-Video.md) — CVPR 2025
- [VACE](./01_视频编辑/05_统一编辑框架/02_VACE.md) — [arXiv:2503.07598](https://arxiv.org/abs/2503.07598)
- [VideoDirector](./01_视频编辑/05_统一编辑框架/03_VideoDirector.md) — CVPR 2025
- [SketchVideo](./01_视频编辑/05_统一编辑框架/04_SketchVideo.md) — [arXiv:2503.23284](https://arxiv.org/abs/2503.23284)
- [Visual Prompting OCVE](./01_视频编辑/05_统一编辑框架/05_Visual-Prompting-OCVE.md) — [arXiv:2504.14335](https://arxiv.org/abs/2504.14335)

### 06_数据底座规划（4 篇）

数据、语义规划与底座模型决定编辑上限

- [Wan](./01_视频编辑/06_数据底座规划/01_Wan.md) — [arXiv:2503.20314](https://arxiv.org/abs/2503.20314)
- [OpenVE-3M](./01_视频编辑/06_数据底座规划/02_OpenVE-3M.md) — [arXiv:2512.07826](https://arxiv.org/abs/2512.07826)
- [Bernini](./01_视频编辑/06_数据底座规划/03_Bernini.md) — [arXiv:2605.22344](https://arxiv.org/abs/2605.22344)
- [Video-As-Prompt](./01_视频编辑/06_数据底座规划/04_Video-As-Prompt.md) — [arXiv:2510.20888](https://arxiv.org/abs/2510.20888)

### 补充阅读（`01_视频编辑/补充阅读/`）

| 文件 | 说明 |
| --- | --- |
| `2407.07111v1.pdf` | Diffusion Model-Based Video Editing: A Survey（[arXiv:2407.07111](https://arxiv.org/abs/2407.07111)） |
| `techrxiv.177129952.23796356_v1.pdf` | Video Editing Meets Diffusion Models: A Comprehensive Survey（TechRxiv） |
| `2402.14780v3.pdf` | Customize-A-Video: One-Shot Motion Customization（[arXiv:2402.14780](https://arxiv.org/abs/2402.14780)）—— 已下载，尚未写解读 |
| `video_editing_papers_report.html` | 视频编辑论文综合报告（历史版） |
| `2510.20888v1_report.md` | Video-As-Prompt 单篇阅读报告 |

---

## 02 Agent 自进化（25 篇）

围绕 agent skill 自进化筛选：skill 库、记忆、prompt/harness 演化、RL 训练与评估陷阱。
完整索引与阅读顺序见 [`reading_report.md`](./02_Agent自进化/reading_report.md)。

| 论文 | 方向 | arXiv |
| --- | --- | --- |
| Self-Evolving Agents Survey | 综述 / 路线图 | [2507.21046](https://arxiv.org/abs/2507.21046) |
| SoK: Agentic Skills | 定义 / 治理 | [2602.20867](https://arxiv.org/abs/2602.20867) |
| Agent Skills for LLMs | 架构 / 标准 | [2602.12430](https://arxiv.org/abs/2602.12430) |
| SkillsBench | 评测基准 | [2602.12670](https://arxiv.org/abs/2602.12670) |
| Trace2Skill | 轨迹蒸馏为 Skill | [2603.25158](https://arxiv.org/abs/2603.25158) |
| SkillX | 层次 SkillKB | [2604.04804](https://arxiv.org/abs/2604.04804) |
| XSkill | 多模态经验 + Skill | [2603.12056](https://arxiv.org/abs/2603.12056) |
| SkillClaw | 集体 Skill 演化 | [2604.08377](https://arxiv.org/abs/2604.08377) |
| CoEvoSkills | Skill package 自演化 | [2604.01687](https://arxiv.org/abs/2604.01687) |
| SkillOpt | 文本空间 Skill 优化 | [2605.23904](https://arxiv.org/abs/2605.23904) |
| SkillOS | SkillRepo 管理 / Curation | [2605.06614](https://arxiv.org/abs/2605.06614) |
| Skill1 | 选择-使用-蒸馏统一 RL | [2605.06130](https://arxiv.org/abs/2605.06130) |
| SkillRL | 递归 Skill-Augmented RL | [2602.08234](https://arxiv.org/abs/2602.08234) |
| SAGE / Skill Library RL | RL + Skill library | [2512.17102](https://arxiv.org/abs/2512.17102) |
| Skill-Pro / ProcMEM | 程序性记忆 / Non-Parametric PPO | [2602.01869](https://arxiv.org/abs/2602.01869) |
| AutoRefine | 轨迹到可复用专家经验 | [2601.22758](https://arxiv.org/abs/2601.22758) |
| AutoSkill | 经验沉淀为 skill | [2603.01145](https://arxiv.org/abs/2603.01145) |
| Harness Updating vs Benefit | 评估 / Harness 自进化 | [2605.30621](https://arxiv.org/abs/2605.30621) |
| WebEvolver | Web Agent 自进化 | [2504.21024](https://arxiv.org/abs/2504.21024) |
| Agents of Change | 长程策略自进化 | [2506.04651](https://arxiv.org/abs/2506.04651) |
| GEPA | 反思式 Prompt/Skill 演化 | [2507.19457](https://arxiv.org/abs/2507.19457) |
| Voyager | Skill library 基础 | [2305.16291](https://arxiv.org/abs/2305.16291) |
| Reflexion | 语言反思记忆 | [2303.11366](https://arxiv.org/abs/2303.11366) |
| Promptbreeder | Prompt 自指演化 | [2309.16797](https://arxiv.org/abs/2309.16797) |
| WikiSkill | 持久知识库 + Skill 协同演化 | [2608.27454](https://arxiv.org/abs/2608.27454) |

---

## 03 递归自进化（13 份解读）

主线不是「能力增长」，而是**验证信号的可信度**。每篇提供深度版与通俗版两种解读。
下表是已撰写解读的 13 篇；`时间线综述.md` 的时间线覆盖 30 篇，本地 `pdfs/` 目录另有 34 个 PDF 原文（均未入库）。
完整时间线与脉络见 [`时间线综述.md`](./03_递归自进化/时间线综述.md)。

| 论文 | 分类 | arXiv |
| --- | --- | --- |
| DIVE | 冻结参数 · 演化 skill | [2608.12486](https://arxiv.org/abs/2608.12486) |
| MetaSkill-Evolve | 冻结参数 · 演化 skill | [2607.05297](https://arxiv.org/abs/2607.05297) |
| KnowAct-GUIClaw | 冻结参数 · 演化 skill | [2607.12625](https://arxiv.org/abs/2607.12625) |
| DarwinX | 冻结参数 · 演化 harness | [2608.07545](https://arxiv.org/abs/2608.07545) |
| HSI | 冻结参数 · 演化 harness | [2608.08466](https://arxiv.org/abs/2608.08466) |
| Mendel Gödel Machine | 冻结参数 · 演化 agent 代码 | [2608.07645](https://arxiv.org/abs/2608.07645) |
| AutoDesign | 冻结参数 · 演化 harness | [2608.13560](https://arxiv.org/abs/2608.13560) |
| Skill Misevolution | 安全与验证 | [2608.12851](https://arxiv.org/abs/2608.12851) |
| Knowledge-Centric | 对照组 · 质疑者 | [2607.19592](https://arxiv.org/abs/2607.19592) |
| Weights or Skills? | 综述 · 术语澄清 | [2608.01851](https://arxiv.org/abs/2608.01851) |
| Aspire | 基准 · 模糊目标自进化（三部曲 TARGET） | [2608.31111](https://arxiv.org/abs/2608.31111) |
| S3Gym | 基准 · 经验回路诊断（三部曲 EXPERIENCE） | [2608.31100](https://arxiv.org/abs/2608.31100) |
| HarnessDev | 基准 · harness 创建与演化（三部曲 SYSTEM） | [2609.01437](https://arxiv.org/abs/2609.01437) |

---

## 04 Agent Harness 与验证

| 文件 | 说明 | arXiv |
| --- | --- | --- |
| `agent_harness_engineering-a-survey.pdf` | Agent Harness Engineering: A Survey（PDF 未入库） | — |
| `agent_harness_analysis.html` | 上述综述的深度解读 | — |
| `LLMasaVerifier_{academic,concise,storytelling}.html` | LLM-as-a-Verifier 三档解读 | [2607.05391](https://arxiv.org/abs/2607.05391) |
| `RewardHarness_{academic,concise,storytelling}.html` | RewardHarness: Self-Evolving Agentic Post-Training 三档解读 | [2605.08703](https://arxiv.org/abs/2605.08703) |

## 05 图像生成（MACRO）

| 文件 | 说明 |
| --- | --- |
| `2603.25319v1_reading_report.html` | MACRO 完整阅读报告（含源码对应关系与结论） |
| `macro_analysis.html` | MACRO 方法分析（与上者内容互不重叠） |

论文：MACRO: Advancing Multi-Reference Image Generation with Structured Long-Context Data（[arXiv:2603.25319](https://arxiv.org/abs/2603.25319)）

---

## 说明

- 各篇解读中的实验数字来自对应论文自身；不同论文的测试集、分辨率和评价流程不同，**不能直接当作统一排行榜**。
- 部分解读基于标题与摘要撰写，未必逐节通读全文（各专题文档内有相应标注）。
- 仓库不含 PDF，仅含解读与元数据；`papers_metadata.json` / `reports/manifest.json` 保留结构化信息。
