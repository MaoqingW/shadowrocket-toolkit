# 网易云音乐「领福利」页面过滤实验

目标是移除首页顶部的「领福利」入口，并取消首页默认选中福利页。规则已通过本地二进制响应测试，尚待 iPhone 验证。

## 抓包依据与改写范围

2026-11-20 抓包中，`interface3.music.163.com` 的两处配置为：

- `/eapi/link/home/framework/top/tab`：`data.commonResourceList` 含 `resCode=freeListen`、链接组件为 `rn-ad-free-music` 的「领福利」入口。
- `/eapi/link/home/framework/tab`：`data.selectedHomeTopTabCode` 为 `freeListen`。

脚本从顶部列表移除上述福利入口；只有默认栏目为 `freeListen` 时，删除 `selectedHomeTopTabCode`，让客户端自行选择剩余栏目。不硬编码新的默认栏目，不阻断整个首页配置接口，也不修改播放、会员、云贝资产或其他 App 接口。若顶部列表没有其他可识别栏目，则保留原响应。

移除默认字段能否触发客户端回退，以及客户端是否使用缓存，必须实机确认。它不是已验证的强制跳转规则。Proxyman 中此前添加的 `/eapi/ad/flow/get` 阻断规则与此功能独立。

## 二进制协议

模块必须使用 `requires-body=1,binary-body-mode=1`。单文件脚本支持明文 JSON、AES-128-ECB + PKCS#7 的 EAPI JSON，以及 AES 内部 gzip 压缩的 JSON。修改后保留原来的应用层压缩和加密形式，并去除失效的 HTTP 长度、编码及校验头。HTTP 层压缩由代理处理，与 AES 内部 gzip 是两层不同的编码。

脚本检查完整 AES 分块和填充；路径、JSON、解密或结构异常时执行 `$done({})`，保留原响应。脚本不记录响应内容及账号信息，不发送额外网络请求。

EAPI 常量与方式参考[公开实现](https://github.com/picone/CloudMusicUploader/blob/master/cloud_music.py)。二进制脚本输入输出形式参考 [Maasea 脚本实现](https://github.com/Maasea/sgmodule/blob/master/Script/Youtube/youtube.response.js)。

## 构建与测试

维护源文件 `src/netease/home.js`，不要直接编辑生成的 `scripts/netease/home.js`。依赖在构建时打入文件，手机不需要 npm，也不会运行时从 CDN 下载库。

```bash
npm ci
npm run build:netease
npm run check
```

测试使用 Node.js 原生 AES/gzip 独立生成和解码响应，覆盖中文栏目保留、两种加密响应、明文响应、默认选中取消、异常透传和严格路径范围。

## 手机导入与回滚

`modules/my-rules.sgmodule` 已绑定 `main` 分支的 `scripts/netease/home.js` HTTPS 地址，并追加精确 MITM 域名 `interface3.music.163.com`。**本地编辑不会更新该线上地址**，提交推送后才可从远程加载新版脚本。

本地先测时，将生成的 `scripts/netease/home.js` 导入 Shadowrocket 的脚本管理，在本地模块中把 `netease-home` 的 `script-path` 换为该脚本在手机上的实际路径；其余参数保持不变。不要直接把 Mac 文件路径填进手机模块。配置 HTTPS 解密并信任 Shadowrocket 证书后，更新模块并重新启动网易云音乐。

验证入口是否消失、首次打开是否进入正常栏目、推荐及音乐页面是否正常、播放与切歌是否正常。保留抓包或脚本命中记录，以区分未命中、旧缓存和客户端回退问题。关闭模块中的 `netease-home` 脚本即可停止改写；已缓存的页面配置可能需要刷新后才恢复。
