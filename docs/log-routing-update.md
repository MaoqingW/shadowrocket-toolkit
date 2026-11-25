# 连接日志分流调整（2026-11-24）

依据用户提供的 Shadowrocket SQLite 日志及分析，将确定的分流建议合并至 `modules/my-rules.sgmodule`，继续使用同一模块地址。

本地核对日志共 30,974 条：22,424 条 DIRECT、8,550 条 PROXY，其中 5,938 条命中 FINAL。日志没有传输字节数，连接次数不能换算为流量节省比例；这些统计也不证明相关服务可稳定直连。

## 已加入主模块

- Microsoft / VS Code：CDN、实验配置、设置同步、Office 和扩展资源使用 DIRECT。
- JetBrains：`jetbrains.com` 使用 DIRECT；`jetbrains.ai`、`jetbrains.cloud` 使用 PROXY。
- B站：保留 `bilivideo.com` 的 DIRECT，补充 `bilivideo.cn`。
- AI、Notion、Figma 和 GitHub 静态资源：显式指定 PROXY，使用主配置已有的同名策略。
- 指定遥测端点、Google Analytics、Cloudflare 统计脚本和 Carbon Ads：使用 REJECT。Copilot 遥测精确规则置于服务级 PROXY 之前。

新增共 30 条规则。直连可用性、同步及插件下载，以及拒绝遥测后的应用表现仍需使用验证。出现问题时，按具体域名停用对应条目。未对通用云域名 `azurewebsites.net`、`trafficmanager.net` 做整域分流。

## 暂不启用的开发资源直连候选

以下为原分析中需先测试的候选，不是有效模块条目：

```ini
DOMAIN,updates.fournova.com,DIRECT
DOMAIN-SUFFIX,schemastore.org,DIRECT
DOMAIN-SUFFIX,npmjs.org,DIRECT
DOMAIN,ocsp.digicert.com,DIRECT
DOMAIN-SUFFIX,base-ui.com,DIRECT
```

其余候选需验证后再启用；`npmjs.org` 规则也覆盖 `registry.npmjs.org`。Tower、Schema 和包资源的具体用途来自用户提供的分析，本次没有重新核实服务文档。

`fangpi.net`、`fangpiw.com`、`yywl.org` 保持原有分流。未新增 `sentry.io`、`launchdarkly.com`、`sprig.com`、`track.customer.io` 或 `plausible.io` 的整域拒绝规则。

## 较早日志的补充

核对 11 月 20–22 日日志：共 48,420 条，其中 DIRECT 37,954 条、PROXY 10,466 条、FINAL 代理 6,596 条。友盟两个域名体系均存在直连和代理混用。

在前述 30 条规则基础上新增 5 条：`umeng.com`、`umengcloud.com` 直连，以及 `fc00::/7`、`fe80::/10`、`::1/128` 直连。IP 规则放在 `[Rule]`，不是 `[General]`。若主配置把 ULA 用作合成地址池，需核对地址池用途后判断效果。

以下仅为待验证候选，未加入有效规则：

```ini
# Development & CDN
DOMAIN-SUFFIX,developer.mozilla.org,DIRECT
DOMAIN,formulae.brew.sh,DIRECT
DOMAIN-SUFFIX,dockerstatic.com,DIRECT
DOMAIN-SUFFIX,shields.io,DIRECT
DOMAIN-SUFFIX,jsdelivr.net,DIRECT
DOMAIN-SUFFIX,proxyman.com,DIRECT
DOMAIN,image.tmdb.org,DIRECT
DOMAIN,cdn.shopify.com,DIRECT
DOMAIN-SUFFIX,shopifycdn.com,DIRECT

# OCSP（digicert 与上一批候选重复）
DOMAIN,ocsp.digicert.com,DIRECT
DOMAIN,ocsp.comodoca.com,DIRECT

# Advertising & Telemetry
DOMAIN-SUFFIX,adnxs.com,REJECT
DOMAIN-SUFFIX,demdex.net,REJECT
DOMAIN-SUFFIX,rubiconproject.com,REJECT
DOMAIN-SUFFIX,6sc.co,REJECT
DOMAIN-SUFFIX,trkn.us,REJECT
DOMAIN,munchkin.marketo.net,REJECT
DOMAIN,incoming.telemetry.mozilla.org,REJECT
DOMAIN,analytics.tiktok.com,REJECT
DOMAIN,monorail-edge.shopifysvc.com,REJECT
DOMAIN,otlp-http-production.shopifysvc.com,REJECT
```

尚未取得主配置，无法确认已有 IPv4 局域网规则。本次没有扩大为所有 IPv6 直连，也没有将分析中列出的公网地址当作局域网处理。

未保存原始日志、UA、账号、节点信息或设备标识至仓库。模块提供域名及指定 IPv6 地址段的覆盖规则，不包含 GEOIP 或 FINAL；默认分流继续由主配置管理。

## iPhone 日志补充

核对 iPhone 日志共 43,822 条：DIRECT 41,868 条、PROXY 1,873 条、REJECT 81 条，其中 FINAL 代理 424 条。按用户授权采用分析末尾的三组建议，去重后新增 18 条有效规则：

- 6 条 DIRECT：`itunes.com`、`ingest.apple-studies.com`、`ocsp.digicert.com`、`cacerts.digicert.com`、`pool.ntp.org` 及 `100.64.0.0/10`。
- 12 条 REJECT：Google 广告的七个域名后缀、AppsFlyer 后缀及 Adjust、Amplitude、X 的四个精确端点。

`google-analytics.com`、B站和友盟已有规则，不重复添加。上文 `ocsp.digicert.com` 已从候选转为有效规则。Apple 中继、私密访问令牌、认证及会员验证服务保持原策略；普通内容 CDN 和正文中其他实验建议暂不启用。

这些规则尚未实机验证。更新后检查 Google、YouTube、App 启动和证书验证是否正常；共享地址空间直连仍取决于本地网络及虚拟组网路由。模块与主配置合并后的实际优先级需从命中日志确认，尤其是 Google 广告拒绝规则应先于宽泛 Google 代理规则。

## 11 月 25 日 Mac 日志补充

- `easylist-downloads.adblockplus.org` 已加入精确直连规则。HTTPS 下载返回 200，实际模块命中待验证。
- `http-inputs-notion.splunkcloud.com` 从 REJECT 改为精确 PROXY。刷新模块后观察该域名的连接频率。
