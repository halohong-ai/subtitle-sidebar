// 生成商店截图（1280×800）：在模拟页里操作真实的浮窗，截下浮窗，再和说明文字拼成宣传图。
// 用法：npm run build && node scripts/store-shots.mjs
// 需要 tests/harness/data（见 README「测试」）和陶哲轩访谈的摘要文件。
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SUMMARY = '/Volumes/TU820/Claude/Terence_Tao_No_More_Heroes_summary.json';
const OUT = 'store/screenshots';
const harness = pathToFileURL(resolve('tests/harness/harness.html')).href;
const icon = `data:image/png;base64,${readFileSync('static/icons/icon128.png').toString('base64')}`;

const SCENES = [
  {
    file: '1-bilingual',
    title: '字幕变成一份可点的文稿',
    points: ['中英对照，随播放高亮、自动滚动', '点任意一句，视频跳到那里', '人工字幕优先，没有就用自动字幕并重新断句'],
  },
  {
    file: '2-search',
    title: '想找哪句，搜一下就到',
    points: ['全文搜索，所有结果高亮', '回车逐个跳转', '往回翻时不打断播放，一键回到当前句'],
  },
  {
    file: '3-loop',
    title: '学英语：一句听到懂',
    points: ['单句循环，反复听同一句', '[ 上一句　] 下一句　\\ 开关循环', '双语 / 仅英文 / 仅中文一键切换'],
  },
  {
    file: '4-summary',
    title: 'AI 摘要，按话题跳转',
    points: ['一键复制提示词，粘贴到任意 AI', '导入摘要：按话题分段，点击跳到开头', '导入 AI 中文字幕，自动与英文合成双语'],
  },
  {
    file: '5-notes',
    title: '收藏好句，导出笔记',
    points: ['收藏字幕或摘要话题，写下批注', '导出 Markdown，时间戳链接回到视频那一刻', '数据只存在你的浏览器里'],
  },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: mkdtempSync(join(tmpdir(), 'ssb-shots-')),
  args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inPanel = (fn, ...args) =>
  page.evaluate(
    (src, args) => {
      const host = [...document.documentElement.children].find((e) => e.shadowRoot);
      return new Function('root', 'args', `return (${src})(root, args)`)(host?.shadowRoot, args);
    },
    fn.toString(),
    args,
  );
const waitPanel = (fn) =>
  page.waitForFunction(
    (src) => {
      const host = [...document.documentElement.children].find((e) => e.shadowRoot);
      return host && new Function('root', `return (${src})(root)`)(host.shadowRoot);
    },
    { timeout: 20000 },
    fn.toString(),
  );
const seek = async (sec) => {
  await page.evaluate((s) => {
    const v = document.querySelector('video');
    v.currentTime = s;
    v.pause();
  }, sec);
  // 等浮窗平滑滚动到当前句
  await sleep(2000);
};
const panelShots = {};
const shootPanel = async (name) => {
  await sleep(400);
  const el = await page.evaluateHandle(() =>
    [...document.documentElement.children].find((e) => e.shadowRoot).shadowRoot.querySelector('.panel'),
  );
  panelShots[name] = (await el.screenshot({ encoding: 'base64' })).toString();
};

await page.goto(`${harness}?v=MANUAL00001`);
await waitPanel((root) => root.querySelectorAll('.row').length > 0);

// 1 双语
await seek(589);
await shootPanel('1-bilingual');

// 2 搜索
const search = await page.evaluateHandle(() =>
  [...document.documentElement.children].find((e) => e.shadowRoot).shadowRoot.querySelector('.search input'),
);
await search.type('hedgehog');
await page.keyboard.press('Enter');
await shootPanel('2-search');
await search.click({ clickCount: 3 });
await page.keyboard.press('Backspace');
await sleep(300);

// 3 单句循环（先回到跟随播放的状态）
await inPanel((root) => [...root.querySelectorAll('button')].find((b) => b.textContent.includes('回到当前'))?.click());
await seek(705);
await inPanel((root) => root.querySelector('.player-controls [aria-label="单句循环"]').click());
await shootPanel('3-loop');
await inPanel((root) => root.querySelector('.player-controls [aria-label="单句循环"]').click());

// 4 摘要（粘贴导入）
const summary = readFileSync(SUMMARY, 'utf8');
await inPanel((root) => root.querySelector('.menu > .icon').click());
await inPanel((root) => [...root.querySelectorAll('.menu-list button')].find((b) => b.textContent.includes('导入')).click());
await inPanel((root, [text]) => {
  const ta = root.querySelector('.dialog textarea');
  ta.value = text;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}, '```json\n' + summary + '\n```');
await inPanel((root) => root.querySelector('.dialog .primary').click());
await waitPanel((root) => root.querySelectorAll('.summary-item').length > 0);
await inPanel((root) => root.querySelectorAll('.summary-item')[2].click());
await sleep(600);
await page.evaluate(() => document.querySelector('video').pause());
await inPanel((root) => root.querySelectorAll('.summary-item .star')[2].click());
await shootPanel('4-summary');

// 5 笔记
await inPanel((root) => [...root.querySelectorAll('.tabs button')].find((b) => b.textContent === '字幕').click());
await waitPanel((root) => root.querySelectorAll('.row').length > 0);
await seek(120);
await inPanel((root) => {
  const rows = root.querySelectorAll('.row');
  rows[3].querySelector('.star').click();
  rows[6].querySelector('.star').click();
});
await inPanel((root) => [...root.querySelectorAll('.tabs button')].find((b) => b.textContent.startsWith('笔记')).click());
await waitPanel((root) => root.querySelectorAll('.note').length === 3);
await inPanel((root) => root.querySelectorAll('.note .chip')[1].click());
const ta = await page.evaluateHandle(() =>
  [...document.documentElement.children].find((e) => e.shadowRoot).shadowRoot.querySelector('.note textarea'),
);
await ta.type('数学家像狐狸还是刺猬？我更像狐狸。');
await inPanel((root) => root.querySelector('.note textarea').blur());
await shootPanel('5-notes');

// 拼成宣传图
mkdirSync(OUT, { recursive: true });
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
for (const s of SCENES) {
  await page.setContent(`<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; width: 1280px; height: 800px; overflow: hidden;
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: radial-gradient(circle at 15% 20%, #dbeafe, #eff6ff 45%, #f8fafc); color: #0f172a;
    display: flex; align-items: center; }
  .text { flex: 1; padding: 0 56px 0 80px; }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 600; color: #1e3a8a; margin-bottom: 40px; }
  .brand img { width: 44px; height: 44px; }
  h1 { font-size: 46px; line-height: 1.3; margin: 0 0 32px; letter-spacing: 0.5px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { font-size: 22px; line-height: 1.5; margin: 14px 0; padding-left: 30px; position: relative; color: #334155; }
  li::before { content: ""; position: absolute; left: 0; top: 11px; width: 12px; height: 12px; border-radius: 50%; background: #3b82f6; }
  .shot { flex: none; width: 460px; height: 760px; margin-right: 40px; display: flex; align-items: center; justify-content: center; }
  .shot img { max-width: 100%; max-height: 100%; border-radius: 14px; box-shadow: 0 24px 60px rgba(30,58,138,.25), 0 2px 8px rgba(0,0,0,.08); }
</style>
<body>
  <div class="text">
    <div class="brand"><img src="${icon}">字幕侧栏</div>
    <h1>${s.title}</h1>
    <ul>${s.points.map((p) => `<li>${p}</li>`).join('')}</ul>
  </div>
  <div class="shot"><img src="data:image/png;base64,${panelShots[s.file]}"></div>
</body>`);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  await page.screenshot({ path: `${OUT}/${s.file}.png` });
}
await browser.close();
console.log(`已生成 ${SCENES.length} 张截图：${OUT}/`);
