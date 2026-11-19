# 知乎广告过滤

主模块 `modules/my-rules.sgmodule` 包含两种处理：

- `[URL Rewrite]` 拒绝 `https://api.zhihu.com/commercial_api/` 下全部请求，与用户现有 Proxyman 拦截范围一致。未来该目录内其他商业功能也会被拒绝。
- `[Script]` 对 `https://api.zhihu.com/topstory/recommend`（包括查询参数）执行 `scripts/zhihu/recommend.js`，保留正常内容，过滤混入广告。

## 过滤依据

依据 2026-11-19 用户提供的 HAR，本地检查推荐流的 `data`、`dataV1`，分别移除符合任一条件的完整条目：

1. `type` 为 `feed_advert`。
2. `unify_content.tags` 含 `code=commercial_content_plugin_ad_tag` 且 `value=广告` 的标签。
3. `unify_content.rec.source_type` 为 `TS_SOURCE_EXTRA_PROMOTION`。
4. `extra.promotion` 或 `unify_content.biz_ext.promotion` 为有效推广对象：`is_card=true`，具有非空字符串或正有限数值 ID，且 `click_tracks`、`impression_tracks`、`view_tracks` 中至少一项为包含 HTTP(S) 地址字符串的数组。推广对象支持 JSON 字符串形式。

两套数组独立过滤，不依赖下标或内容 ID 对齐；不递归删除正文中的“广告”字样。正常条目及顺序、分页链接和游标、样式与其他根字段保留。正文为空、非法 JSON 或无匹配条目时 `$done({})` 原样放行，未知字段结构保守保留。脚本不打印正文、请求或标识。

## iPhone 接入

模块已配置本公开仓库分支的 HTTPS 脚本地址，可直接通过以下地址导入：

- [模块直链](https://raw.githubusercontent.com/MaoqingW/shadowrocket-toolkit/refs/heads/codex/easylist-abp-converter/modules/my-rules.sgmodule)。
- [响应脚本直链](https://raw.githubusercontent.com/MaoqingW/shadowrocket-toolkit/refs/heads/codex/easylist-abp-converter/scripts/zhihu/recommend.js)。

这些地址跟随 `codex/easylist-abp-converter` 分支更新。

1. 在 Shadowrocket 的模块列表中添加模块直链并启用，无需手工修改 `script-path`。
2. 模块和脚本均通过公开 GitHub Raw 地址加载，无需凭据；设备是否能访问、脚本是否下载成功仍须在设备上核实。
3. 导入修改过的模块。已有 MITM 配置继续使用；模块仅通过 `%APPEND%` 追加 `api.zhihu.com`，不携带证书或改变其他域名。
4. 脚本使用 `requires-body=1,max-size=-1`：样本正文约 571 KiB，取消正文大小限制以免大响应被跳过；仅绑定推荐流接口，内存占用随正文大小增加。
5. 在“配置”路由模式下测试 URL 拒绝。若使用其他路由模式，核对主配置的 `always-reject-url-rewrite` 设置，不默认修改全局行为。

不要同时启用另一个修改同一推荐流响应的脚本，排查时先单独启用本模块。

## 验证与回滚

- 本地：`npm run check`。VM 测试执行同一个脚本，脱敏样本保留两种响应表示和广告证据；原始 HAR 不进入仓库。
- 真机：确认脚本加载成功和请求命中；对比首页刷新、连续翻页、普通回答打开、返回列表。退出并重开知乎后复测，避免缓存干扰；观察空白卡片、重复内容、异常重试。
- 样本预期：两套数组分别从 7 条变为 5 条，各移除一条品牌广告及一条推广回答。两套表示不计作四个不同广告。
- 本地回放不能证明真机显示效果，也不能证明解决了回答页穿插广告；本次 HAR 中三个回答详情响应未发现明确广告证据。
- 出现回归先停用模块，恢复旧模块和对应脚本。不要直接拒绝整个推荐流接口。

2026-11-19 本地验证：`npm run check` 全部通过，包含 28 项知乎测试、全仓库共 62 项测试。原始 HAR 在内存回放命中 1 个推荐流响应，`data` 和 `dataV1` 均从 7 条变为 5 条，仅删除原下标 1、3；保留条目和其他根字段完全一致。模块 URL 匹配的正反例边界检查通过。尚未进行真机验收。随后用户授权提交并提供可用地址，模块已改用上述公开 HTTPS 脚本地址。
