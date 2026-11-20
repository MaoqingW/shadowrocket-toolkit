# 豆瓣域名拦截实验

取样自 [EasyList China 完整订阅](https://easylist-downloads.adblockplus.org/easylistchina.txt)，版本 `202611170934`（2026-11-17 09:34 UTC），原文 SHA-256 为 `86e6bcae6e25951c767dc615740d882d6303179266e9a4918d052248436c3b7d`。本实验模块独立于 `my-rules.sgmodule`，包含一条域名规则和四条实验性 URL 规则，不会自动启用。

在该版本中搜索 `douban` 共命中 13 行。其中第 8014 行是无选项的纯域名阻断规则，转换为 `DOMAIN-SUFFIX,erebor.douban.com,REJECT`。第 7857–7860 行是带路径或查询参数的网络规则，本轮仅作为 `URL-REGEX` 实验规则加入，不扩大成 `douban.com` 或 `doubanio.com` 的整域拦截。URL 正则限定 HTTP(S)、主机边界和原始路径；对 ABP 大小写和分隔符的完整语义尚未在 Shadowrocket 真机上验证。

其余命中不做转换：

| 原始行号                          | 内容类别                                | 原因                                                              |
| --------------------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| 16641                             | `at*.doubanio.com` 域名通配规则         | 暂不假定 Shadowrocket 的通配匹配与 ABP 完全一致。                 |
| 15826                             | `douban.com/popup/login?` 登录 URL 例外 | 不能转换为整域放行；实验时尤其要观察登录。                        |
| 11727、12341、13656、15202、15508 | 5 条元素隐藏或隐藏例外                  | 对页面元素生效，不是域名阻断。                                    |
| 16426                             | 带 `$subdocument,domain=...` 的规则     | `m.douban.com` 只是网页来源作用域中的一项，并非要拦截的目标主机。 |

## 手机测试

1. 在 Shadowrocket「配置 → 模块 → ＋」导入[本模块的公开 Raw URL](https://raw.githubusercontent.com/MaoqingW/shadowrocket-toolkit/main/modules/douban-easylistchina-test.sgmodule)，保持原有个人模块不变。确认主页全局路由为「配置」。
2. 先禁用本模块，打开豆瓣 App，记录首页、搜索、条目详情、图片、登录和广告呈现情况。
3. 启用模块后重新打开 App，再执行相同操作。查看 Shadowrocket 请求日志，分别确认是否出现 `erebor.douban.com` 的 `REJECT` 和四条 `URL-REGEX` 的命中；记录未命中的请求实际 URL。
4. 也可用 Safari 请求 `https://erebor.douban.com/` 检查域名规则。Safari 命中只能验证域名拦截规则，不代表豆瓣 App 使用了这个主机。
5. 若功能异常，立即禁用该模块复测；实验结束后在模块列表中删除它即可恢复原配置。

本模块没有自动启用 URL 重写、脚本或 HTTPS 解密。HTTPS 请求的路径通常需要解密后才能用于匹配；若日志只有主机名而没有路径，URL 正则可能不会命中。先检查实际日志和 App 是否接受解密，再决定是否单独开启精确域名的 HTTPS 解密。由于四条规则同时启用，若出现异常，可在本地模块编辑器中逐条注释 URL 规则来定位。
