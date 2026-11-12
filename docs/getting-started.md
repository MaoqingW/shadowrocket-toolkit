# 开始使用

## 安装与验收

1. 在 Mac 打开 `modules/my-rules.sgmodule`，复制内容到 iPhone 上 Shadowrocket 的「配置 → 模块 → 新建模块」，保存。菜单文字可能随版本调整。
2. 确认列表显示模块名称和描述。分别在禁用与启用模块时打开常用 App，对比网络访问和请求日志。初始版本只含注释和元数据，无需额外开启 HTTPS 解密。
3. 未来发布可访问的版本后，在「配置 → 模块」点「+」，输入能直接返回模块文本的 URL，再启用对应条目。确认返回的是模块文件，而非 GitHub 页面。

本地静态校验覆盖仓库约定。仅含元数据的初始文件是否被你的 Shadowrocket 版本接受，以及模块优先级、脚本 API 和 MITM 行为，均需真机验证。

参考 [Shadowrocket 社区配置手册](https://github.com/LOWERTOP/Shadowrocket/wiki/)。

## 更新与回滚

更新前记录 Git 提交 SHA，并保存当前可用模块副本。远程来源可在模块条目菜单手动更新，本地来源重新粘贴文件。更新后复测受影响的 App。出现回归时先禁用新版，再用 `git show <commit>:modules/my-rules.sgmodule` 提取旧文件并导入。若包含远程脚本，也要恢复与模块配套的脚本版本。公开分发时可以用同一提交 SHA 固定模块与脚本 URL。

## 建立私有远程

登录后先确认目标账户和同名仓库。确认仓库不存在后，在当前项目目录执行以下命令。

```bash
gh auth login
gh repo view "$(gh api user --jq .login)/shadowrocket-toolkit"
# 仅在确认当前账户没有该仓库时执行
gh repo create shadowrocket-toolkit --private --source=. --remote=origin --push
```

如果同名仓库已存在，先核对仓库归属和历史。私有 Raw 文件需要授权访问，Shadowrocket 直接订阅能否通过授权需单独验证。日常维护可先通过 GitHub 登录态或本地 Git 取文件，再手动导入 iPhone。避免在订阅链接或模块内保存凭据。
