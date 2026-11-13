# EasyList / EasyList China 转换

转换器使用官方完整订阅文件：

- EasyList：<https://easylist.to/easylist/easylist.txt>
- EasyList China：<https://easylist-downloads.adblockplus.org/easylistchina.txt>

通过 `npm run rules:fetch` 获取和缓存上游。`npm run rules:build` 构建两个来源和合并集；使用 `npm run rules:build -- --source=easylistchina` 可构建单个来源。成功下载后，`node tools/abp-rules.js build --offline` 从本地缓存构建。网络失败不会替换已有缓存；缓存内容需要先通过 ABP 头和大小校验。若需固定报告时间以复现构建，可设置 `SOURCE_DATE_EPOCH=1794528000`（Unix 时间戳秒数）。

首版只输出严格符合 `||host.example^` 且没有选项的纯域名网络阻断规则，映射为 Shadowrocket `[Rule]` 可用的 `DOMAIN-SUFFIX,host.example,REJECT`。这匹配主机本身及其子域名。输出是独立规则列表，不会写入或启用 `modules/my-rules.sgmodule`，用户需自行在测试配置中导入并验证。

## 安全边界

URL 路径、通配符、ABP 正则、IP、端口、IDN、资源类型限制、third-party 限制、domain 作用域、未知选项、元素隐藏和例外规则均不直接转换。特别是 `@@` 例外不能映射为 `DIRECT`：路由直连不等价于放行广告请求。能定位目标主机的例外会排除与其相交的域名；无法定位的网络例外计入风险，其余纯域名候选仅进入 experimental，不计为 exact。safe 只接收无已知冲突且无未解决例外风险的规则，因此可能为空。转换器不实现完整 ABP 规则引擎。

合并结果见 `dist/abp/safe/domains.list`、`dist/abp/experimental/domains.list` 和 `dist/abp/report.json`；原有按来源目录仍保留，但含风险的来源列表也仅用于实验。experimental 目录另有完整的 `domains.sgmodule` 和只含一条上游命中规则的 `smoke-test.sgmodule`。各目录还包含来源追踪和压缩跳过明细。URL 规则文件目前为空并注明未启用。报告记录候选数、明确冲突、未知作用域例外和输出数；重复域名在合并输出中只保留一条。

## 手机验证

当前仓库没有可供 Shadowrocket 下载的真实 HTTPS 规则 URL。最短本地验证：打开 `dist/abp/experimental/smoke-test.sgmodule`，复制全文，在 Shadowrocket「配置 → 模块 → 新建模块」粘贴、保存并启用；确保主页全局路由为「配置」。该文件只测试生成列表中的 `ads.linkedin.com` 一条规则。用 Safari 打开 `https://ads.linkedin.com/`，在 Shadowrocket 请求日志中核对该域名命中 `REJECT`。完成后禁用并删除此测试模块。完整实验集可用 `domains.sgmodule` 作为独立测试模块，但规则较多，建议先用单规则模块验证。

若日后将 `experimental/domains.list` 托管为可直接返回文本的 HTTPS 地址，可在当前配置的规则页添加 `RULE-SET`，填入真实 URL，策略选 `REJECT`。该 `.list` 包含 `DOMAIN-SUFFIX` 规则类型，适用于 `RULE-SET`；无需转换为 `DOMAIN-SET`。先检查规则顺序和命中日志，再扩大使用范围。

## 测试、误拦截和扩展

`npm run rules:test` 使用仓库内小型样本，不访问网络；`npm test` 运行全部测试。每次测试前先查看 `report.json` 和 `trace.json`。出现误拦截时，按 `trace.json` 找到上游原始行，禁用测试模块并复测；不要直接把上游例外转成 `DIRECT`。

EasyList 的 `##` 元素隐藏能力无法转换成 Shadowrocket 对原生 iOS App 的广告隐藏能力。网络规则只适用于可在网络层识别的请求；API 返回的 JSON 内嵌广告需要其他处理机制。

增加来源时，在 `tools/abp-rules.js` 的 `SOURCES` 增加唯一 ID、官方完整订阅 URL 和署名，再补充本地 fixture、来源元信息校验与测试。只采用上游正式订阅，不能拼接仓库 TXT 文件。使用者须遵守 [EasyList 许可条款](https://easylist.to/pages/licence.html)、上游署名要求和再分发条件；生成文件保留来源、订阅地址、构建时间、转换器版本及 SHA-256。
