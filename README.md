# shadowrocket-toolkit

个人维护的 Shadowrocket App 优化模块与脚本仓库。继续使用现有 `.conf` 管理节点、分流、DNS、Skip Proxy 和 Always Real IP。这里集中维护一份 `modules/my-rules.sgmodule`，按需加入经过抓包和回归验证的优化。

主模块包含知乎 `commercial_api/` 路径拦截、推荐流及回答流广告过滤，其他 App 暂保留分组注释。推荐流脚本处理 `data` 和 `dataV1` 中的品牌广告及推广回答；回答流脚本仅移除 `/next-render` 的 `data` 中 `type=ad` 的条目。模块已配置 `main` 分支的公开 HTTPS 脚本地址，日常开发和更新统一使用 `main`。详见[知乎广告过滤](docs/zhihu-ad-filter.md)。示范脚本仅处理模拟 JSON，独立于模块。

## 本地开发

使用 `.nvmrc` 中的 Node.js 22 LTS。安装依赖后可运行整套检查。

```bash
npm ci
npm run check
```

| 命令                                            | 用途                                  |
| ----------------------------------------------- | ------------------------------------- |
| `npm test`                                      | 运行 Vitest，覆盖模拟响应与模块检查   |
| `npm run lint`                                  | 检查 JavaScript                       |
| `npm run format`                                | 写入 Prettier 格式                    |
| `npm run validate`                              | 检查模块的仓库约定和明显问题          |
| `npm run rules:fetch`                           | 下载并缓存 EasyList 与 EasyList China |
| `npm run rules:build`                           | 拉取上游并生成独立 ABP 转换规则       |
| `npm run rules:build -- --source=easylistchina` | 仅构建 EasyList China                 |
| `node tools/abp-rules.js build --offline`       | 使用成功下载的本地缓存离线构建        |

ABP 转换器只发布语义明确的纯域名阻断规则；输出位于 `dist/abp/`，不会自动合并或激活到个人模块。例外、路径、资源类型限制、正则及其他高级选项会保守跳过并记录在 JSON 报告中。详见[ABP 规则转换](docs/abp-rule-conversion.md)。

网易云音乐「领福利」入口和默认选中配置改写已接入主模块，手机效果待验证。支持二进制 EAPI 解密与重新加密，构建、导入与回滚见[测试说明](docs/netease-home-filter.md)。本地改动尚未推送时，远程脚本地址不会更新。

豆瓣 App 域名实验见[独立测试模块](modules/douban-easylistchina-test.sgmodule)和[测试说明](docs/douban-easylistchina-test.md)；模块需手动启用。

- `modules/` 保存可独立安装的模块。
- `scripts/zhihu/` 和 `fixtures/zhihu/` 保存知乎响应脚本与脱敏样本；`example/` 子目录保存独立模拟示例。
- `tests/` 和 `tools/` 保存测试与静态验证工具。
- `docs/` 保存安装、调试、规则开发和故障排查步骤。

## 新增规则

先用抓包和单变量实验确认请求用途，再选择 Rule、URL Rewrite 或 Script。将已确认的条目放进模块对应配置段，用 App 注释标记归属。涉及 HTTPS 解密时，使用 `hostname = %APPEND% …` 追加必要的精确域名。新增响应脚本时同时提交脱敏样本和回归测试。详见[规则开发](docs/rule-development.md)和[知乎开屏调试指南](docs/debugging-guide.md)。

## 安装、更新与回滚

在 iPhone 上进入 Shadowrocket 的「配置 → 模块」，新建本地模块后粘贴文件内容。可公开下载的版本可通过同一页面的「+」输入 Raw URL 导入。更新前保留可用版本，出现异常先关闭模块，再用旧提交的文件覆盖或重新导入。私有仓库优先走本地导入。详见[开始使用](docs/getting-started.md)。

排查冲突时，从同一个请求的命中规则入手，单次停用一个可疑模块并复测。详见[故障排查](docs/troubleshooting.md)。

## 隐私

抓包原件放在仓库外或被忽略的 `captures/`。提交前检查暂存区，剔除 Cookie、Authorization、Token、密码、账户和设备标识、代理订阅及凭据、证书和私钥、完整 HAR 与私人 `.conf`。样本只保留能复现行为的脱敏字段。静态校验只能识别部分明显凭据，人工检查仍然必要。
