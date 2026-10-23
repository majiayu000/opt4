# 设计

目标：一份可复现的公开数据集，加一个静态站。回答两个问题：

1. 这个 App 从主界面出发，要点几下才能到达“数据用于训练 / 改进”的关闭选项？
2. 照着怎么点？

标准依据见 [research.md](research.md) 第 1 节。

## 1. 计数口径

| 项 | 规则 |
|---|---|
| 起点 | 已登录的个人账号，杀掉进程后冷启动，关闭所有启动弹窗（关弹窗不计数），停在 App 默认落地的那一屏。这一屏就是“主界面” |
| 终点 | 关闭选项（开关、复选框或“退出 / 撤回”按钮）**出现在屏幕上**。拨动开关这一下不计，因为国标原文是“到达该选项所需操作” |
| 计入 | 每一次单击或长按，计 1 次。包括点头像、点图标、点菜单项、点返回 |
| 不计 | 滚动、滑动、系统权限弹窗、登录、输入文字 |
| 只能靠手势 | 如果某一步只能滑动打开（比如侧边栏），没有可点的入口，记为 `swipe` 步骤，不计数，并在备注里写明 |
| 最短路径 | 记录测试人找到的最短点击路径。不使用 App 内搜索框 |
| 平台 | `ios`、`android`、`harmonyos` 分开记录。只测手机，不测平板。网页端另列 `web`，不进主榜 |
| 版本 | 每条记录都带 App 版本号和系统版本。同一 App 同一平台以测试日期最新的一条为准，旧记录保留为历史 |
| 灰度 | 同一版本不同人测出不同路径时，两条都展示，标“结果不一致，待复核” |
| 复核 | 同一 App、同一平台、同一版本，另一位测试人得到相同点击数，标“已复核” |
| 多个开关 | `scope` 区分：`main`（对话内容）、`voice`（语音 / 音视频）、`other`。榜单只用 `main` |

点击数与路径步骤必须一致：`clicks` 等于 `steps` 里 `tap` 的个数，校验脚本会检查。

## 2. 数据结构

```
data/apps.yaml                      App 名单
data/records/<app>/<file>.yaml      每次观察一条记录
evidence/<app>/<file>.(png|jpg|webp)  实测截图（已打码）
```

### apps.yaml

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 小写短名，如 `deepseek` |
| `name` | 是 | 显示名 |
| `vendor` | 是 | 运营主体（照隐私政策写） |
| `policy_url` | 是 | 官方隐私政策 |
| `privacy_contact` | 否 | 政策里公布的个人信息联系渠道，显示在 App 页的更正区 |

### 记录：公共字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `app` | 是 | 对应 `apps.yaml` 的 `id` |
| `source` | 是 | `measured`（实测）、`documented`（文档声称）、`example`（示例假数据） |
| `scope` | 是 | `main` / `voice` / `other` |
| `option_label` | 是 | 开关名称原文；没有开关时写 `无` |
| `outcome` | 是 | 实测：`in_app_toggle`、`contact_only`、`none_found`。文档：`in_app_toggle`、`contact_only`、`not_stated` |
| `note` | 否 | 备注 |

### 实测记录（`source: measured`）额外字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `platform` | 是 | `ios` / `android` / `harmonyos` / `web` |
| `app_version` | 是 | App 内“关于”页的版本号 |
| `os_version` | 是 | 如 `iOS 18.6`、`HarmonyOS 5.1` |
| `device` | 是 | 机型 |
| `tested_on` | 是 | 测试日期 `YYYY-MM-DD` |
| `tester` | 是 | GitHub 用户名 |
| `default_state` | 是 | `on` / `off` / `unknown`。只有在新注册账号上看到的才填 `on` / `off` |
| `steps` | `in_app_toggle` 时必填 | 列表，每项 `{ action: tap\|swipe, target: 屏幕上的原文 }` |
| `clicks` | `in_app_toggle` 时必填 | 整数，等于 `tap` 步骤数 |
| `screenshots` | 是 | 列表，每项 `{ file, sha256 }`，至少 1 张，最后一张要能看到开关 |
| `contact` | `contact_only` 时必填 | App 内看到的联系渠道 |

不得出现：`doc_url`、`doc_quote`、`doc_path`、`retrieved_on`。

### 文档声称记录（`source: documented`）额外字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `doc_url` | 是 | 官方隐私政策或帮助文档 |
| `doc_quote` | 是 | 原文一句，不改字 |
| `doc_updated` | 是 | 文档自己写的更新日期 |
| `retrieved_on` | 是 | 我们打开这份文档的日期 |
| `doc_path` | `in_app_toggle` 时必填 | 文档里写出的路径，按原文拆成列表 |
| `contact` | `contact_only` 时必填 | 文档给出的联系渠道 |

不得出现：`clicks`、`steps`、`screenshots`、`tester`、`tested_on`、`app_version`、`default_state`。文档里的路径通常从“设置”开始，看不出从主界面要点几下，所以文档声称记录**不带点击数**。

### 示例记录（`source: example`）

只能用于 `app` 以 `example-` 开头的虚构 App，字段同实测记录。正式构建会排除它们，只有 `OPT4_EXAMPLES=1` 时才渲染，页面上整卡标“示例（虚构数据）”。

### 文件名

`<platform 或 doc>-<source>-<日期>[-补充].yaml`，例如 `ios-measured-2026-10-26.yaml`、`doc-documented-2026-10-23.yaml`。校验脚本检查文件名里的 `source` 和内容一致，避免把文档路径放进实测文件。

## 3. “实测与文档声称不得混用”

这条规则由三处保证，都有测试覆盖：

1. **字段**：实测记录出现任何 `doc_*` 字段、文档记录出现 `clicks` / `steps` / `screenshots` 等实测字段，校验失败。
2. **文件名**：文件名里的 `measured` / `documented` / `example` 必须与 `source` 一致。
3. **展示**：榜单的档位只由实测记录计算。文档声称记录单独放在路径卡下方的“官方文档怎么说”一栏，灰色底，标“未实测”。没有实测记录的 App 在榜单上显示“待实测”。

## 4. 档位

按 App × 平台，取最新的 `scope: main` 实测记录：

| 档位 | 条件 | 显示文字 |
|---|---|---|
| A | `in_app_toggle` 且 `clicks ≤ 4` | 4 次以内可到达 |
| B | `in_app_toggle` 且 `clicks > 4` | 超过 4 次 |
| C | `contact_only` | App 内未找到开关，需联系厂商 |
| D | `none_found` | 未找到关闭方式 |
| — | 只有文档声称记录或没有记录 | 待实测 |

同档内按点击数升序，再按名称排序。

## 5. 校验与贡献流程

- `bun run validate`：读取全部 YAML，逐条校验字段、枚举、日期格式、`clicks` 与 `steps` 一致、截图文件存在且 sha256 匹配、文件名与 `source` 一致、`app` 在名单里。任何一条失败，退出码非 0，并打印文件路径和原因。
- CI（发布后再加）：PR 上跑 `bun test` 和 `bun run validate`。
- PR 模板（`.github/pull_request_template.md`）要求勾选：
  - 按方法页的口径从冷启动主界面开始计数；
  - 每一步截图都已提交，个人信息（头像、昵称、手机号、对话内容）已打码；
  - 填写了 App 版本、系统版本、机型；
  - 没有修改别人的实测记录。
- Issue 模板：`新增实测`（给不会提 PR 的人）、`更正`（厂商或用户指出错误）。
- 档位变化需要截图证据；厂商的更正申请走公开 issue，处理结果写进记录的 `note`。

## 6. 页面

全部由 `bun run build` 生成到 `dist/`，纯 HTML + 一个 CSS 文件，不需要 JS。

| 页面 | 内容 |
|---|---|
| `/` 榜单 | 一句话说明、国标原句、按档位排列的 App × 平台表格（档位、点击数、版本、测试日期、是否已复核），以及“待实测”名单 |
| `/app/<id>.html` 路径卡 | 每个平台一张卡：编号步骤、点击数、开关原文、默认状态、截图、版本和测试人；下面是“官方文档怎么说”（未实测）；最后是更正渠道 |
| `/method.html` 方法 | 计数口径、标准原文和页码、档位定义、我们不评价的事情、措辞规范 |
| `/changelog.html` 更新记录 | 由记录文件自动生成：日期、App、平台、来源类型 |
| `sitemap.xml`、`robots.txt` | 站点地图 |

每页都有 `<title>`、`meta description`、`og:title`、`og:description`、`og:type`、`og:url`、`og:site_name`、`og:locale`、`canonical`。站点地址和仓库地址放在 `site.config.json`，不写死在代码里。

## 7. 措辞规范

- 只写事实（路径、点击数、版本、日期、截图）和它与国标示例的对照。
- GB/T 45654—2025 是推荐性国家标准，**不写“违法”“违规”“不合规”“违反”“不符合”**。构建测试会扫描输出 HTML，出现这些词就失败。
- 用“4 次以内可到达”“超过 4 次”，不用“达标 / 不达标”。
- 不评价“关闭后是否真的停止训练”，这件事无法从外部验证。
- 不转述二手结论（如南都报告的数字），只用自己能复现的记录。
- 每个 App 页底部给更正渠道：本仓库的“更正”issue 链接（预填 App 名），以及厂商隐私政策里公布的个人信息联系渠道。

## 8. 不做的事

- 不抓取、不代登录任何账号。
- 不做浏览器扩展、不做自动化测试脚本去点 App。
- 首版不做分享图生成、个人勾选清单、政策页哈希监控。这些等数据跑起来再说。
