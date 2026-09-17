# 04 Agent Harness 与验证

三组材料，共同主题是「harness 工程」与「把验证信号当作一条独立的能力轴」。

## Agent Harness Engineering: A Survey

- `agent_harness_analysis.html` — 深度解读
- `agent_harness_engineering-a-survey.pdf` — 综述原文（PDF 未入库，仅本地保留）

现有材料中没有记录该综述的 arXiv 编号，因此这里不给出链接，避免误引。

## LLM-as-a-Verifier（[arXiv:2607.05391](https://arxiv.org/abs/2607.05391)）

把「验证」变成预训练、后训练、推理时计算之外的**第四条 scaling 轴**。同一篇论文的三个版本：

- `LLMasaVerifier_academic.html` — 学术深度解读
- `LLMasaVerifier_concise.html` — 精炼解读
- `LLMasaVerifier_storytelling.html` — 故事解读（「它把 27% 的『不知道』变成了 0%」）

项目页 <https://llm-as-a-verifier.com> · 代码 <https://github.com/llm-as-a-verifier/llm-as-a-verifier>

## RewardHarness: Self-Evolving Agentic Post-Training（[arXiv:2605.08703](https://arxiv.org/abs/2605.08703)）

把 reward model 从「训权重」改成「长上下文」：少量标注即可超过大规模训练数据的效果。三个版本：

- `RewardHarness_academic.html` — 学术深度解读
- `RewardHarness_concise.html` — 精炼解读
- `RewardHarness_storytelling.html` — 故事解读（「100 条标注干翻 20 万条」）

项目页 <https://rewardharness.com> · 代码 <https://github.com/TIGER-AI-Lab/RewardHarness>

## 与其他专题的关系

- 本目录的 harness 演化主题与 [`../03_递归自进化/`](../03_递归自进化/) 的「冻结权重、演化 harness」一族（DarwinX / HSI / AutoDesign / HarnessDev）直接交汇。
- 验证信号的可信度是 03 的主轴，LLM-as-a-Verifier 与 RewardHarness 提供了两条工程化路径。
