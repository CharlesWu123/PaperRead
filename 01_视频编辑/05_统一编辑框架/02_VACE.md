# VACE：统一视频生成与编辑的条件接口

## 元信息
- 题目：VACE: All-in-One Video Creation and Editing
- 作者：Zeyinzi Jiang、Zhen Han、Chaojie Mao、Jingfeng Zhang、Yulin Pan、Yu Liu；arXiv:2503.07598v2，2025-03-11
- 基础模型：LTX-Video-2B、Wan-T2V-14B
- 任务：T2V、R2V、V2V、MV2V及其组合

## 一句话
VACE像给所有视频任务设计统一插头：参考图、源视频、控制图和掩码先转换为同一种输入，再由一个模型生成或编辑。

## 问题、输入与输出
传统视频模型一个任务一个模型，参考主体、姿态、深度、光流、重绘和扩展各自部署，难组合。更麻烦的是参考图表示“保留主体概念”，源视频未编辑区表示“尽量不动”，控制图表示“遵守结构”，直接拼接会让模型混淆。VACE 输入统一为 $V=[T;F;M]$：文本、时空对齐的上下文帧/图像、二值掩码；输出对应的视频生成或局部编辑结果。

## 方法流程
```mermaid
flowchart LR
 A[文本/图片/视频/掩码]-->B[Video Condition Unit]
 B-->C[Concept Decoupling]
 C-->D[Reactive与Inactive帧]
 D-->E[视频VAE与时空对齐]
 E-->F[Context Embedder]
 F-->G[分布式Context Blocks]
 G-->H[残差注入Video DiT]
 H-->I[生成/编辑/任务组合]
```

## 核心机制
第3.2节和 Table 1 形式化不同任务：T2V 用空帧和全1掩码；R2V 把参考图放在上下文序列前，以全0掩码表示参考内容保持；V2V 使用源视频和全1掩码；MV2V 额外输入时空 ROI 掩码。任务组合只是继续拼接条件，例如参考主体加局部重绘无需另建模型。

第3.3.1节提出 Concept Decoupling：$F_c=F \times M$ 是 reactive frames，表示要改变的区域；$F_k=F \times (1-M)$ 是 inactive frames，保存参考和未编辑内容。两者经视频 VAE 编码，并和噪声视频 latent 对齐后由 Context Embedder token 化。Context Adapter 复制少量 Transformer blocks，冻结主 DiT，仅训练上下文分支，以残差方式注入主分支（Fig.3），比全量微调更快、更可插拔。

## 保留与一致性策略
帧和掩码在空间、时间上对齐；inactive frames 显式承担保留信息；视频 VAE 传递时空相关性；上下文残差注入尽量保护预训练 T2V 的画质和运动。训练数据经镜头切分、RAM/Grounding DINO 检测和 SAM2 分割，再构造深度、姿态、草图、光流、参考和掩码样本。

## 关键实验
VACE-Benchmark 覆盖12类任务，正文描述240个高质量视频，使用 VBench 的美学、背景一致性、动态程度、成像质量、运动平滑、整体/主体一致性和闪烁指标，并加入用户评分。Table 2中，VACE 的 I2V normalized average 为 **74.38%**，高于 LTX-Video 的72.89%；depth、pose、flow 分别为 **74.99% / 76.13% / 75.90%**。R2V仍落后于部分商业模型。Fig.4展示 Reference、Move、Animate、Swap、Expand Anything；Fig.5表明分布式 Context Blocks 和 Concept Decoupling 有效降低训练损失。

## 成本
主要成本在训练：需要大规模多模态数据、自动检测分割和多阶段任务扩展。LTX-Video-2B用于快速生成，Wan-T2V-14B用于高质量720p。论文未披露完整 GPU 小时，因此不能精确给出总训练费用；统一部署减少了模型数量，却没有消除大模型训练和显存成本。

## 局限
1. 多任务统一存在容量竞争，R2V仍有商业模型差距。
2. 检测、分割和控制伪标签错误会污染多个任务。
3. 多参考主体、多个掩码和多控制同时输入时仍可能冲突。
4. 与分辨率、开放程度不同的模型比较，公平性有限。
5. 训练数据治理和模型维护仍很复杂。

## 路线关系
VACE吸收 ControlNet、VideoComposer、ControlVideo 的条件控制，也扩展 ACE、OmniGen 的图像统一生成思想。它不同于 Align-A-Video 的逐样本奖励调优，也不同于 SketchVideo 的专用草图模块；它的主要贡献是“统一条件协议 + 上下文适配器”，为视频生成和编辑提供可组合接口。
