# 04 FateZero：把原视频的注意力带进编辑过程

## 元信息
- **论文**：*FateZero: Fusing Attentions for Zero-shot Text-based Video Editing*
- **作者**：Chenyang Qi 等；**年份/venue**：2023，ICCV 2023 Oral，pp. 15932–15942
- **arXiv**：[2303.09535](https://arxiv.org/abs/2303.09535)；**定位**：零样本文本视频编辑、attention fusion、形状编辑

## 先记住一句话
FateZero 在还原原视频、再生成编辑视频的过程中保存 attention，让模型改目标对象时持续参考原视频的结构和运动。像先记下“每个词关注哪里、画面怎么关联”，再按新文字重画。

## 它要解决什么
逐帧图像编辑会闪烁，简单跨帧 attention 难以保持局部结构，视频 DDIM inversion 还会误差累积。早期方法对风格和颜色有效，对物体形状较弱。FateZero 不为每个目标 prompt 训练，也不要求用户手画 mask，尝试完成风格、属性和形状编辑。

## 输入输出
输入为源视频、source prompt 和目标 prompt；输出为编辑后视频，例如银色吉普车改成保时捷、风格改变或局部形状变化。

## 方法流程（Mermaid）
```mermaid
flowchart LR
 A[源视频+源prompt]-->B[DDIM inversion]
 B-->C[保存cross/self attention]
 C-->D[目标prompt去噪]-->E[cross-attention融合]
 E-->F[源attention生成编辑mask]
 F-->G[self-attention blending]
 G-->H[空间-时间attention]-->I[编辑视频]
```
1. DDIM inversion；2. 保存 source cross/self attention；3. 目标 prompt 去噪；4. 按词语差异融合 cross-attention；5. 由源 attention 得到编辑区域并融合 self-attention；6. 使用空间—时间 attention。详见 **Section 3.1–3.3、Algorithm 1/2、Figure 1、Figure 7**。

## 核心机制人话解释
cross-attention 近似回答“文本词语对应画面哪里”，self-attention 近似回答“画面哪些位置相互关联”。“吉普车”换成“保时捷”时，新词继续关注原车辆区域；背景 attention 尽量来自源视频。形状编辑再用 cross-attention 生成 mask，减少背景变化。

## 保留/编辑权衡
它不用为每个目标 prompt 训练，且能把编辑集中到语义相关区域；inversion 中间 attention 同时提供运动和结构线索。但 attention 是软关注，不是精确分割，目标变化很大时容易语义泄漏、背景改变或原结构残留。

## 关键实验
**Table 1** 中 FateZero 的 CLIP-F 为 **0.965**，时间一致性相关指标为 **0.903**，优于 SDEdit、NLA/Null-text/P2P 与 Tune-A-Video+DDIM 的比较结果。**Figures 4、7、9** 展示属性、风格和形状编辑。实现中通常使用 Stable Diffusion v1.4、50 个 DDIM steps，并在指定时间区间融合 attention。

## 成本
无需目标 prompt 的训练，但仍要对输入视频 inversion，并在多个时间步保存、融合 attention。空间—时间 attention 显存较高，适合短视频；成本低于逐视频微调，却高于简单逐帧处理。

## 局限
1. 难把游泳改成飞行等全新动作；2. 完全不同形状或新概念组合不稳定，附录展示“黑天鹅→黄色翼龙”失败；3. 长视频显存限制；4. inversion 误差影响质量；5. attention 不是精确 mask，可能泄漏。

## 读完后应建立的认识
视频编辑可以保存扩散过程的注意力关系，而不仅是 RGB 帧：cross-attention 负责“编辑哪里”，self-attention 负责“结构如何保持”。

## 下一篇
[05_Rerender-A-Video.md](./05_Rerender-A-Video.md)：转向关键帧、光流和视频传播。
