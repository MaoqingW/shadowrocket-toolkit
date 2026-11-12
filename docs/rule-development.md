# 规则与脚本开发

## 选择配置段

| 配置段          | 使用条件                           |
| --------------- | ---------------------------------- |
| `[Rule]`        | 可用域名等规则条件精确隔离目标     |
| `[URL Rewrite]` | 需要按 URL 路径匹配、拒绝或重定向  |
| `[Script]`      | 必须读写响应正文，同时保留正常内容 |
| `[MITM]`        | 上述处理确实需要解密 HTTPS         |

首次使用某个段时再添加段头。段内用 App 名称做分组注释，每个段只声明一次。MITM 用一行 `hostname = %APPEND% …` 汇总必要的精确域名。以下是不可启用的语法示例，使用保留域名。

```ini
# [Rule]
# DOMAIN,example.com,REJECT

# [URL Rewrite]
# ^https://example\.com/demo$ - reject

# [Script]
# demo = type=http-response,pattern=^https://example\.com/demo$,requires-body=1,script-path=demo.js

# [MITM]
# hostname = %APPEND% example.com
```

脚本示例中的 `demo.js` 仅演示字段。实际配置需选择设备上的脚本，或使用设备可访问的 HTTPS 脚本 URL。相对路径检查采用仓库约定，从 `modules/` 解析，部署时需单独核实设备端脚本名称或 URL。语法参考 [Shadowrocket 社区配置手册](https://github.com/LOWERTOP/Shadowrocket/wiki/) 和 [公开脚本配置实例](https://github.com/Jianyuann/Shadowrocket-Rules/blob/main/Script.conf)。

## 响应脚本

`scripts/example/response.js` 是一个可直接读取的 JS 文件。纯函数只检查模拟 JSON 的形状和标记，返回新对象或原对象。入口从 `$response.body` 取文本，按需通过 `$done({ body })` 提交新正文，解析失败、结构变化或无改动时调用 `$done({})` 原样放行。若未来需要请求上下文，可从 `$request` 读取所需字段。

- 在同一个文件里分离纯转换与运行时入口，保持脚本可独立运行。Node API、ESM 导入和测试工具留在开发侧。
- 改动限定在有证据的字段。先检查值类型和结构，再做浅拷贝或逐层复制被修改的分支。
- 日志只记录固定状态或非敏感计数。避免输出请求、正文和凭据。
- 测试直接运行同一个脚本文件，覆盖正常结果、缺字段、非法或空正文、结构变化和输入不可变。VM 模拟只覆盖传入的 API，设备行为以真机为准。

## 静态校验范围

`npm run validate` 检查模块文件是否可读、名称和描述、仓库允许的四类段、重复条目、相同匹配条件的简单冲突、MITM 精确域名、仓库内本地脚本和明显凭据。检查器不模拟规则优先级、正则语义重叠、客户端解析、远程脚本下载或 HTTPS 解密。复杂匹配与多模块合并仍需人工检查和真机回归。
