# 上架清单

这个目录放上架 Chrome 应用商店和 Edge 加载项商店需要的全部材料。

| 文件 | 用途 |
| --- | --- |
| `subtitle-sidebar-<版本>.zip` | 上传的扩展包，`npm run pack` 生成（不进 git） |
| `listing.md` | 商店里填的说明文字（中文、英文） |
| `privacy-practices.md` | Chrome 后台「隐私权规范」表单的答案 |
| `privacy-policy.html` | 隐私政策页面，需要发布到一个公开网址 |
| `screenshots/*.png` | 1280×800 截图：`0-real-*` 是真实 YouTube 页面截图（建议排在最前），`1`–`5` 是宣传图，`npm run shots` 重新生成 |
| `../static/icons/icon128.png` | 商店图标，`npm run icons` 重新生成 |

## 上架前要你来做的事

1. **联系邮箱**：halohong@gmail.com（已写进 `privacy-policy.html`）。商店后台的联系邮箱也填它，审核结果和用户反馈都会发到这里。
2. **隐私政策网址（可选）**：扩展不收集任何用户数据，两个商店都只在收集数据时才强制要求隐私政策网址，所以首次提交可以留空。若审核要求补充，再把 `privacy-policy.html` 发布成公开网页（GitHub Pages、Gitee Pages、Notion 或飞书公开文档都行），把网址填进后台。
3. **注册开发者账号**：
   - Chrome：<https://chrome.google.com/webstore/devconsole>，一次性 5 美元注册费，需要用外币卡支付
   - Edge：<https://partner.microsoft.com/dashboard/microsoftedge>，免费

## Chrome 应用商店提交步骤

1. 开发者后台 →「新增内容」→ 上传 `subtitle-sidebar-1.0.0.zip`
2. **商品详情**：
   - 说明：贴 `listing.md` 的中文详细说明；再点「添加语言」→ English，贴英文说明
   - 类别：教育（Education）
   - 语言：中文（简体）
   - 图标：`static/icons/icon128.png`
   - 屏幕截图：`screenshots/` 下 7 张，按文件名顺序上传（两张 `0-real-*` 真实截图在前）
   - 小型宣传图块（440×280）可不传
3. **隐私权规范**：按 `privacy-practices.md` 填写，隐私政策网址可留空（见上文第 2 步）
4. **分发**：公开；地区选所有地区
5. 提交审核。一般几天内有结果，被拒时邮件会写明原因，发给我看即可

## Edge 加载项商店提交步骤

1. 合作伙伴中心 →「创建新扩展」→ 上传同一个 zip
2. 可用性：公开，所有市场
3. 属性：类别选「教育」，隐私政策网址可留空
4. 商店详情：中文（简体）和英语分别填 `listing.md` 的内容、上传图标和截图
5. 提交

## 以后发新版本

1. 改 `static/manifest.json` 和 `package.json` 里的版本号（两处要一致，比如 1.0.1）
2. `npm run pack`
3. 在两个商店后台上传新 zip，提交审核
