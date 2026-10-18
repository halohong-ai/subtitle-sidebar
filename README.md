# 字幕侧栏 Subtitle Sidebar

Chrome / Edge 扩展：在 YouTube 视频右侧显示字幕浮窗，随播放自动滚动、点哪句跳哪句、可全文搜索，支持双语对照。

当前进度：**M1（YouTube 免费版）**。B站、导入导出、摘要/导图、AI 一键生成见后续里程碑。

## 安装（开发版）

```bash
npm install
npm run build
```

然后在 Chrome 打开 `chrome://extensions`（Edge 为 `edge://extensions`），打开右上角「开发者模式」，点「加载已解压的扩展程序」，选择 `dist/` 目录。改代码后重新 `npm run build`，再在扩展页点刷新按钮即可。

## 功能（M1）

- 自动读取视频自带字幕：人工字幕优先，没有就用自动字幕
- 双语：有人工中文轨道就用；没有就尝试 YouTube 机翻中文（可能被限流，失败时只显示原文）
- 合句：带标点的按句子合并；无标点的自动字幕按停顿断句，单句约 22 词以内
- 随播放高亮并滚动；手动滚动后暂停跟随，点「回到当前」恢复
- 点击任意一句，视频跳到该处
- 搜索：高亮所有结果，Enter / Shift+Enter 切换
- 双语 / 仅原文 / 仅译文切换，字号调节，拖动左边缘调宽度，可收起
- 跟随 YouTube 深色模式，全屏时自动隐藏

## 字幕是怎么拿到的

YouTube 现在要求字幕请求带 PO Token，轨道列表里的 `baseUrl` 直接请求会返回空内容。扩展按顺序尝试：

1. 直接请求 `baseUrl`
2. **拦截播放器自己发出的 `/api/timedtext` 请求**，把其中的 PO Token 等参数补到目标轨道地址上（主力；用户没开字幕时会临时点开一次 CC 再恢复）
3. 打开「内容转文字」面板，从页面读取

详见 `src/sites/youtube.ts`。网站改版时只需要改 `src/sites/` 下的文件。

## 目录

```text
src/
  sites/        站点适配器（youtube.ts、轨道选择 youtube-tracks.ts）
  inject/       主世界脚本：拦截字幕请求、读取播放器数据
  content/      内容脚本入口、与主世界通信、播放同步
  core/         与网站无关的纯逻辑：json3 解析、合句、中英配对、时间格式
  ui/           浮窗（Preact，渲染在 Shadow DOM 里）
static/         manifest.json
tests/          单元测试；harness/ 是端到端测试
```

## 测试

```bash
npm test            # 单元测试
npm run typecheck   # 类型检查
npm run e2e         # 端到端测试（需要本机安装 Chrome）
```

端到端测试用 `tests/harness/harness.html` 模拟 YouTube 播放器和字幕接口（包括「无 PO Token 返回空」「机翻 429」），用无头 Chrome 打开并检查浮窗行为。首次运行前准备测试数据：

```bash
python3 tests/harness/prepare-data.py 某个_bilingual.srt
```

## 真实 YouTube 实测（2026-10-18，全部正常）

模拟页覆盖了逻辑，以下几点已在真实页面验证：

- [x] 拦截到的 PO Token 能否用于请求其他语言轨道和机翻轨道
- [x] CC 按钮的选择器 `.ytp-subtitles-button` 和临时开关是否正常
- [ ] 「内容转文字」面板兜底是否能读到（主力路径已成功，尚未实际触发过兜底）
- [x] 在搜索框打字时，空格、F、K 等不会触发 YouTube 快捷键
- [x] 浮窗与 YouTube 顶栏、右侧推荐栏的遮挡关系是否可以接受
- [x] 站内连续切换多个视频，字幕都能正确更新
