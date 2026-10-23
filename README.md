# 四步关训练（opt4，暂名）

实测国产 AI App 从主界面出发，要点几下才能关掉“数据用于训练 / 改进”，对照 GB/T 45654—2025 中“不超过 4 次点击”的示例排榜，并给每个 App 一张照着点就能关的路径卡。

> 当前状态：方法、数据格式、校验和静态站已就绪；**还没有任何实测数据**。仓库里只有从官方隐私政策摘录的“文档声称路径”，它们不带点击数，也不进榜单。

## 依据

GB/T 45654—2025《网络安全技术 生成式人工智能服务安全基本要求》（推荐性国家标准，2025-11-01 实施）第 6.3 条 a)：

> 应为使用者提供关闭其输入信息用于训练的方式……关闭方式应便捷，例如采用选项方式时使用者从服务主界面开始到达该选项所需操作不超过 4 次点击。

条款原文、页码和来源见 [docs/research.md](docs/research.md)。

## 方法

- **起点**：已登录的个人账号，冷启动后 App 默认落地的那一屏。
- **计数**：每次单击或长按计 1 次；滚动、滑动、系统弹窗不计；拨动开关那一下不计（原文是“到达该选项”）。
- **终点**：关闭选项出现在屏幕上。
- **分平台、带版本**：iOS / Android / HarmonyOS 分开记录，每条带 App 版本、系统版本、机型、日期和截图哈希。
- **两类数据分开**：“实测”来自真机，带截图；“文档声称”摘自官方文档，不带点击数。榜单只用实测。
- **档位**：4 次以内可到达 / 超过 4 次 / App 内未找到开关、需联系厂商 / 未找到关闭方式 / 待实测。

完整口径和数据结构见 [docs/design.md](docs/design.md)。

## 本地运行

需要 [Bun](https://bun.sh)（1.3 以上，用到内置的 `Bun.YAML`），没有其他依赖。

```bash
bun run validate
```

```bash
bun test
```

```bash
bun run build && bun run serve
```

打开 <http://localhost:4173/>。想看实测卡片的样式，可以带上虚构示例数据构建：

```bash
OPT4_EXAMPLES=1 bun run build
```

站点地址和仓库地址在 `site.config.json` 里改。

## 贡献实测数据

1. 手机上登录自己的账号，杀掉 App 进程后重新打开，停在默认落地的那一屏。
2. 一边点一边截图，每一步一张，直到屏幕上出现关闭选项。记下 App 版本号（“关于”页）、系统版本和机型。
3. 给截图打码：头像、昵称、手机号、对话内容。
4. 截图放进 `evidence/<app>/`，用 `shasum -a 256 <文件>` 算哈希。
5. 新建 `data/records/<app>/<平台>-measured-<日期>.yaml`：

   ```yaml
   # 格式示意，下面的路径和点击数不是任何 App 的真实结果
   app: deepseek
   source: measured
   scope: main            # main=对话内容，voice=语音/音视频
   platform: ios
   app_version: "1.4.2"   # 加引号，避免被解析成数字
   os_version: iOS 18.6
   device: iPhone 15
   tested_on: 2026-10-26
   tester: your-github-name
   default_state: unknown # 只有在新注册账号上看到时才填 on / off
   option_label: 数据用于优化体验
   outcome: in_app_toggle # 或 contact_only / none_found
   steps:
     - { action: tap, target: 左上角菜单 }
     - { action: tap, target: 头像 }
     - { action: tap, target: 设置 }
     - { action: tap, target: 数据管理 }
   clicks: 4              # 必须等于 tap 的个数
   screenshots:
     - { file: evidence/deepseek/ios-2026-10-26-1.png, sha256: "<64 位哈希>" }
   ```

6. 跑 `bun run validate` 和 `bun test`，然后提 PR，按模板勾选核对清单。

不会提 PR 的话，用 issue 里的“新增实测”模板把步骤和截图贴上来就行。同一版本有不同结果时请新增一条，不要改别人的记录；两人结果一致会标“已复核”。

## 更正

记录有误、App 已改版，或你是厂商代表，请用“更正”issue 模板公开提交，附版本号和截图。每个 App 页底部都有直达链接。

## 免责声明

- 本项目只记录可复现的事实（路径、点击数、版本、日期、截图）及其与 GB/T 45654—2025 示例的对照，不作任何法律判断。GB/T 45654—2025 是推荐性国家标准，“4 次点击”是其中对“便捷”的举例。
- 不评价关闭选项后厂商是否真的停止使用数据训练，这无法从外部验证。
- App 会改版，灰度和账号差异也可能导致不同结果。每条记录只代表标注的版本、平台和日期。
- “文档声称”栏目原文摘录厂商公开文档，以厂商最新版本为准。
- 商标和产品名称归各自权利人所有。
