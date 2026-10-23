## 这条 PR 新增 / 修改了什么

- App：
- 平台：iOS / Android / HarmonyOS
- 记录文件：`data/records/<app>/<platform>-measured-<日期>.yaml`

## 实测核对清单

- [ ] 按 [方法页](docs/design.md#1-计数口径) 的口径：已登录、冷启动、从默认落地的那一屏开始，每次点击计 1 次，拨动开关那一下不计
- [ ] 每一步的截图都放进了 `evidence/<app>/`，并在记录里填写了 sha256（`shasum -a 256 文件名`）
- [ ] 截图里的头像、昵称、手机号、对话内容都已打码
- [ ] 填写了 App 版本（“关于”页）、系统版本、机型、测试日期
- [ ] `default_state` 只有在新注册账号上看到时才填 on / off，否则填 unknown
- [ ] 没有修改别人的实测记录（有不同结果请新增一条）
- [ ] 本地跑过 `bun run validate` 和 `bun test`

## 文档声称记录（只在录入官方文档路径时填写）

- [ ] 链接是厂商官方的隐私政策或帮助文档，不是第三方教程
- [ ] `doc_quote` 是原文一句，没有改字
- [ ] 没有填写 clicks / steps / screenshots
