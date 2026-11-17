# 豆瓣域名拦截实验

取样自 [EasyList China 完整订阅](https://easylist-downloads.adblockplus.org/easylistchina.txt)，版本 `202611170934`（2026-11-17 09:34 UTC），原文 SHA-256 为 `86e6bcae6e25951c767dc615740d882d6303179266e9a4918d052248436c3b7d`。本实验模块独立于 `my-rules.sgmodule`，只含一条规则，不会自动启用。

在该版本中搜索 `douban` 共命中 13 行。其中只有第 8014 行 `||erebor.douban.com^` 是无选项的纯域名阻断规则，因此转换为 `DOMAIN-SUFFIX,erebor.douban.com,REJECT`。这会拦截该主机及其子域名的所有网络请求；不能由此推断豆瓣 App 的广告一定会消失。

其余命中不做整域转换：

| 原始行号                          | 内容类别                                     | 原因                                                              |
| --------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| 7857–7860                         | `douban.com`、`doubanio.com` 的 4 条网络规则 | 限定了路径、查询参数或文件名；整域拦截会扩大范围。                |
| 16641                             | `                                            |                                                                   | at*.doubanio.com^`       | 域名含通配符；暂不假定 Shadowrocket 的通配匹配与 ABP 完全一致。 |
| 15826                             | `@@                                          |                                                                   | douban.com/popup/login?` | 登录 URL 例外，不能转换为整域放行；实验时尤其要观察登录。       |
| 11727、12341、13656、15202、15508 | 5 条元素隐藏或隐藏例外                       | 对页面元素生效，不是域名阻断。                                    |
| 16426                             | 带 `$subdocument,domain=...` 的规则          | `m.douban.com` 只是网页来源作用域中的一项，并非要拦截的目标主机。 |

## 手机测试

1. 在 Shadowrocket「配置 → 模块 → ＋」导入[本模块的公开 Raw URL](https://raw.githubusercontent.com/MaoqingW/shadowrocket-toolkit/codex/easylist-abp-converter/modules/douban-easylistchina-test.sgmodule)，保持原有个人模块不变。确认主页全局路由为「配置」。
2. 先禁用本模块，打开豆瓣 App，记录首页、搜索、条目详情、图片、登录和广告呈现情况。
3. 启用模块后重新打开 App，再执行相同操作。查看 Shadowrocket 请求日志，确认是否出现 `erebor.douban.com` 且命中 `REJECT`。
4. 也可用 Safari 请求 `https://erebor.douban.com/` 检查规则是否命中。Safari 命中只能验证域名拦截规则，不代表豆瓣 App 使用了这个主机。
5. 若功能异常，立即禁用该模块复测；实验结束后在模块列表中删除它即可恢复原配置。

本模块没有使用 URL 重写、脚本或 HTTPS 解密。它只验证 EasyList China 中一条纯域名规则对实际 App 请求是否有效。
