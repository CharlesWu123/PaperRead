# Align-A-Video：确定性奖励微调的视频编辑

## 元信息
- 题目：Align-A-Video: Deterministic Reward Tuning of Image Diffusion Models for Consistent Video Editing
- 作者：Shengzhi Wang、Yingkang Zhong、Jiangchuan Mu 等；CVPR 2025
- 基础组件：Stable Diffusion 1.5、DDIM inversion、PnP Diffusion、LoRA、HPSv2
- 任务：文本引导的视频到视频编辑

## 一句话
像先把视频中的一张代表性画面修到“既符合文字又好看”，再把这张图的新外观传给整段视频。

## 问题、输入与输出
输入源视频和编辑提示词，输出执行文本修改、同时保持原动作和结构的视频。旧方法用 TokenFlow、FLATTEN 的跨帧特征、光流或注意力注入来保一致性，却常因保留太多源信息而不听文本；逐帧奖励优化又会造成闪烁和运动断裂。论文要兼顾视觉质量、语义忠实度和时间一致性。

## 方法流程
```mermaid
flowchart LR
 A[源视频+文本]-->B[DDIM反演]
 B-->C[选Anchor和关键帧]
 C-->D[固定噪声奖励微调]
 D-->E[LoRA更新]
 E-->F[跨帧特征传播]
 F-->G[关键帧加权到全视频]
```

## 核心机制
第3.3节的 Deterministic Reward Tuning 固定 DDIM 初始噪声，使文本、噪声和去噪路径确定，把原本对噪声分布取期望的奖励优化简化为精修一个样本，损失为 $L_R=-R(x,P)$。再用梯度截断控制反传范围，LoRA 降低显存和灾难性遗忘风险。这样奖励模型可以稳定地推动 anchor 画面的形状、颜色、纹理和语义向提示词靠拢。

第3.4节只优化一个 anchor frame，然后用跨帧注意力传播。当前帧产生 query，anchor 产生 key/value；选择的关键帧再作为中间参考，普通帧按前后关键帧的距离加权融合（Eq.6–8）。它不是让每帧独立变成“高分图”，而是先得到一张标准照，再统一全片。

## 保留与一致性策略
DDIM inversion 与 PnP 特征保留源结构和动作；只优化 anchor，避免逐帧奖励破坏时间连续；跨帧注意力统一主体外观；相邻关键帧按距离融合，降低片段交界突变。Fig.8 显示去掉特征传播后会出现模糊和外观不一致。

## 关键实验
V2VBench 含50个视频、每个3个提示词，覆盖前景、风格、前景与背景联合编辑。Table 1 以 Aesthetic、PickScore、DOVER、CLIP、ViCLIP、CLIP/DINO Consistency 和光流 EPE 评价。本文 DOVER 为 **0.761**，高于第二名0.708；PickScore **21.847**，ViCLIP **0.265**，EPE **1.874**。Fig.5中“男人变超人”等案例显示本文比 TokenFlow、FLATTEN 更能执行语义编辑；Fig.6、8 的消融验证奖励微调和传播分别负责“改得对”和“传得稳”。

## 成本
确定性调优可在数分钟完成；Fig.9在单张 RTX 6000 Ada 上比较40帧视频。相比整段视频奖励训练更省，但每个视频和提示词仍要做 LoRA 优化与 DDIM inversion。

## 局限
1. HPSv2 等主要理解单帧美学和图文对齐，不能充分评价视频运动。
2. 单个 anchor 难覆盖严重遮挡、快速视角变化和拓扑改变。
3. 逐视频调优不适合大规模实时处理。
4. 仍会受到反演误差和关键帧传播错误影响。

## 路线关系
它承接 Tune-A-Video、TokenFlow、FLATTEN，却把重点从“锁住源视频”转为“用人类偏好推动正确修改”。与 InstructVideo、VADER 同属奖励对齐方向，但不训练通用视频模型；相较 VACE 的统一模型，它是逐样本适配；相较 VideoDirector，它更关心偏好质量而非精确重建轨迹。
