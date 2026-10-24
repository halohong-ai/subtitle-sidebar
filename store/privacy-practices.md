# 「隐私权规范」表单怎么填

Chrome 开发者后台 → 扩展 → 隐私权规范（Privacy practices）。Edge 合作伙伴中心有类似的几项，照抄即可。英文后台填英文那一句。

## 单一用途说明（Single purpose）

> 在 YouTube 和 B站视频旁显示可滚动、可点击跳转的双语字幕列表，并支持收藏字幕和导出笔记。
>
> Shows a scrollable, clickable bilingual transcript of the current YouTube or Bilibili video next to the player.

## 权限理由（Permission justification）

| 权限 | 理由 |
| --- | --- |
| `storage` | 保存用户的设置（字号、浮窗宽度、语言模式），以及用户导入的字幕、摘要和收藏的笔记。<br>Saves settings and the user's imported captions, summaries and notes locally. |
| `unlimitedStorage` | 长视频的字幕和笔记较大，按视频保存时可能超过默认的 10MB 本地存储上限。<br>Transcripts and notes for long videos can exceed the default 10 MB local storage quota. |
| 主机权限（内容脚本匹配 `www.youtube.com`、`www.bilibili.com/video/`） | 在这两个网站的视频页显示字幕浮窗，并读取播放器已经加载的字幕。<br>Displays the sidebar on video pages and reads the captions the player has already loaded. |

## 是否使用远程代码（Remote code）

**否。** 所有代码都打包在扩展里，不加载、不执行任何外部脚本。

No. All code is bundled in the package.

## 数据使用（Data usage）

收集的数据类型：**全部不勾选。**

扩展只在用户自己的浏览器里读写数据，不发送到任何服务器（扩展没有服务器）。字幕请求是向 YouTube / B站本身发出的，和播放器自己加载字幕相同。

三项声明全部勾选：

- [x] 不会出于已获批准的用途之外的用途向第三方出售或传输用户数据
- [x] 不会为实现与产品单一用途无关的目的而使用或转移用户数据
- [x] 不会为确定信用度或实现贷款而使用或转移用户数据

## 隐私权政策网址（Privacy policy URL）

扩展不收集用户数据，此项可留空。若审核要求，再发布 `store/privacy-policy.html` 并填入网址，见 `store/README.md`。
