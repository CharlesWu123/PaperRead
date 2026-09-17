# 06 TokenFlow：沿扩散特征的跨帧对应传播编辑

## 元信息
- **论文**：*TokenFlow: Consistent Diffusion Features for Consistent Video Editing*
- **作者**：Michal Geyer、Omer Bar-Tal、Shai Bagon、Tali Dekel
- **年份/venue**：2024，ICLR 2024；**arXiv**：[2307.10373](https://arxiv.org/abs/2307.10373)
- **定位**：无训练视频编辑、扩散特征对应、token propagation

## 先记住一句话
它不直接复制像素，而是在扩散模型内部找到跨帧对应的 feature token，再让编辑结果沿对应关系传播。像先认出每帧里同一只狼的眼睛、鼻子和身体，再让这些对应部位一起变成机器人。

## 它要解决什么
跨帧 attention 只能隐式保持一致性；RGB 或光流传播又容易受光照、形变和遮挡影响。TokenFlow 发现 U-Net 中间扩散特征比像素更有语义稳定性，于是显式建立特征 token 对应，保持编辑后视频结构和运动。

## 输入输出
输入是真实视频、目标文本和现成图像编辑方法，如 PnP-Diffusion；输出是风格、材质或主体发生变化但布局、运动和跨帧语义稳定的视频。

## 方法流程（Mermaid）
```mermaid
flowchart LR
 A[输入视频]-->B[逐帧DDIM inversion]
 B-->C[提取U-Net diffusion tokens]
 C-->D[跨帧nearest-neighbor对应]
 D-->E[随机关键帧联合编辑]
 E-->F[目标文本图像编辑]
 F-->G[按对应传播特征]-->H[去噪重建视频]
```
1. 每帧 inversion；2. 提取 self-attention 模块的 diffusion tokens；3. 用 nearest-neighbor 建立帧间对应；4. 选择关键帧联合编辑；5. 按原始对应关系传播编辑特征；6. 随机改变关键帧集合避免固定分段。见 **Figure 3、Figure 4、Section 5.3**。

## 核心机制人话解释
直接把第一帧机器人像素贴到第十帧会错位。TokenFlow 先建立“第一帧这个 token 对应第十帧那个 token”的关系。扩散特征对颜色和光照变化通常比 RGB 稳定，所以传播的是语义特征而不是固定像素，能够跟随原视频运动。

## 保留/编辑权衡
显式对应关系对运动、布局和时间一致性很有帮助，也能接入现成图像编辑器；但它遵循原视频结构，若编辑需要改变物体位置、拓扑或动作，原有 correspondence 就会变成限制。底层编辑器若破坏结构，错误也会被传播。

## 关键实验
**Table 1** 中 TokenFlow warp-error 为 **3.0×10⁻³**，低于 Text2Video-Zero 的 12.5、Tune-A-Video 的 30.0 和 FateZero 的 6.9；用户偏好为 **90%**，CLIP 约 **0.33**。**Table 2** 显示其重建 PSNR/LPIPS 为 **25.74/0.13**，略优于 DDIM inversion 的 25.32/0.14。**Figure 7** 展示了结构变化编辑的失败。

## 成本
无需训练和逐视频微调，但要逐帧 inversion、提取多层特征、做跨帧匹配，并进行关键帧传播。因此省掉训练，却增加预处理和 token 传播成本。

## 局限
1. 不擅长改变原结构、位置和运动；2. 遮挡、出画和新出现物体会使匹配失效；3. 底层编辑破坏结构时错误会扩散；4. feature-level smoothing 可能使静态区域模糊；5. 特征匹配成本较高。

## 读完后应建立的认识
TokenFlow 将视频一致性从“让模型注意到前后帧相似”推进到“明确规定哪些 token 相互对应”。它适合保持原运动、改变外观，不适合重新设计动作和结构。

## 下一篇
本目录暂告一段落；后续可进入一致性机制目录，继续阅读 TokenFlow 的特征传播问题、RAVE 的噪声组织方法和更晚期的视频扩散编辑框架。
