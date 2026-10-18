// 端到端测试：用本机 Chrome（无头、临时配置目录）打开 harness.html，检查浮窗行为。
// 用法：npm run build && node tests/harness/e2e.mjs [截图目录]
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const shotDir = process.argv[2] ?? tmpdir();
const base = pathToFileURL(resolve('tests/harness/harness.html')).href;

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failed++;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: mkdtempSync(join(tmpdir(), 'ssb-e2e-')),
  args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => check('页面无脚本错误', false, e.message));

// 在浮窗的 Shadow DOM 里执行
const inPanel = (fn, ...args) =>
  page.evaluate(
    (src, args) => {
      const host = [...document.documentElement.children].find((e) => e.shadowRoot);
      return new Function('root', 'args', `return (${src})(root, args)`)(host?.shadowRoot, args);
    },
    fn.toString(),
    args,
  );
const waitPanel = (fn, timeout = 15000) =>
  page.waitForFunction(
    (src) => {
      const host = [...document.documentElement.children].find((e) => e.shadowRoot);
      return host && new Function('root', `return (${src})(root)`)(host.shadowRoot);
    },
    { timeout, polling: 200 },
    fn.toString(),
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 场景 1：人工中英双轨 ----------
await page.goto(`${base}?v=MANUAL00001`);
await waitPanel((root) => root.querySelectorAll('.row').length > 0);

const s1 = await inPanel((root) => ({
  rows: root.querySelectorAll('.row').length,
  source: root.querySelector('.source')?.textContent,
  first: [...root.querySelectorAll('.row')[0].querySelectorAll('p')].map((p) => p.textContent),
  modes: [...root.querySelectorAll('.segmented button')].map((b) => b.textContent),
}));
check('人工字幕：读到句子', s1.rows > 100, `${s1.rows} 句`);
check('人工字幕：来源说明', s1.source === 'English + Chinese (Simplified)', s1.source);
check('人工字幕：首句中英配对', s1.first.length === 2 && /[一-鿿]/.test(s1.first[1]), JSON.stringify(s1.first));
check('语言切换按钮', s1.modes.join(',') === '双语,英,中', s1.modes.join(','));

const reqs = await page.evaluate(() => window.__requests__);
check('先直接请求（无 PO Token）', reqs[0]?.pot === false);
check('再用捕获的 PO Token 请求成功', reqs.some((r) => r.pot && r.lang === 'en' && !r.tlang));
check('CC 开关恢复原状', (await page.$eval('.ytp-subtitles-button', (b) => b.getAttribute('aria-pressed'))) === 'false');

// 播放进度跟随
await page.evaluate(() => {
  const v = document.querySelector('video');
  v.currentTime = 600;
});
await sleep(800);
const s2 = await inPanel((root) => {
  const list = root.querySelector('.list');
  const a = root.querySelector('.row.active');
  const lr = list.getBoundingClientRect();
  const ar = a?.getBoundingClientRect();
  const toSec = (t) => t.split(':').reduce((acc, n) => acc * 60 + Number(n), 0);
  const next = a?.nextElementSibling?.querySelector('.time').textContent;
  return {
    time: a?.querySelector('.time').textContent,
    ok: !!a && toSec(a.querySelector('.time').textContent) <= 600 && (!next || toSec(next) > 600),
    visible: !!ar && ar.top >= lr.top && ar.bottom <= lr.bottom,
  };
});
check('跳到 10:00 时高亮正在说的那句', s2.ok, s2.time);
check('高亮句子自动滚动到可见区域', s2.visible);
await page.screenshot({ path: join(shotDir, 'e2e-1-bilingual.png') });

// 点击句子跳转
const target = await inPanel((root) => {
  const row = root.querySelectorAll('.row')[40];
  row.click();
  return row.querySelector('.time').textContent;
});
await sleep(300);
const now = await page.$eval('video', (v) => v.currentTime);
const [m, sec] = target.split(':').map(Number);
check('点击句子视频跳转', Math.abs(now - (m * 60 + sec)) < 1, `${target} → ${now.toFixed(1)}s`);

// 搜索，并确认打字不会触发 YouTube 快捷键
await page.evaluate(() => {
  window.__docKeys__ = 0;
  document.addEventListener('keydown', () => window.__docKeys__++);
});
const input = await page.evaluateHandle(() =>
  [...document.documentElement.children].find((e) => e.shadowRoot).shadowRoot.querySelector('.search input'),
);
await input.type('math');
await sleep(300);
const s3 = await inPanel((root) => ({
  count: root.querySelector('.search-count')?.textContent,
  marks: root.querySelectorAll('mark').length,
  follow: !!root.querySelector('.follow'),
}));
check('搜索有结果并高亮', s3.marks > 0, `${s3.count}，${s3.marks} 处高亮`);
check('搜索时暂停跟随，出现「回到当前」', s3.follow);
check('搜索框打字不冒泡到页面快捷键', (await page.evaluate(() => window.__docKeys__)) === 0);
await input.press('Enter');
await sleep(200);
const s3b = await inPanel((root) => root.querySelector('.search-count')?.textContent);
check('回车跳到下一个结果', s3b?.startsWith('2/'), s3b);
await sleep(800);
const s3c = await inPanel((root) => {
  const row = root.querySelector('.row.current');
  const lr = root.querySelector('.list').getBoundingClientRect();
  const r = row?.getBoundingClientRect();
  return !!r && r.top >= lr.top && r.bottom <= lr.bottom && row.querySelectorAll('mark').length > 0;
});
check('当前搜索结果滚动到可见区域并高亮', s3c);
await page.screenshot({ path: join(shotDir, 'e2e-2-search.png') });

// 只看中文
await inPanel((root) => root.querySelectorAll('.segmented button')[2].click());
await sleep(200);
const s4 = await inPanel((root) => ({
  orig: root.querySelectorAll('.orig').length,
  trans: root.querySelectorAll('.trans').length,
}));
check('切到「中」只显示译文', s4.orig === 0 && s4.trans > 0, JSON.stringify(s4));
await inPanel((root) => root.querySelectorAll('.segmented button')[0].click());

// ---------- 场景 2：站内跳转到自动字幕视频（机翻 429） ----------
await page.click('a[href="?v=ASR00000001"]');
await waitPanel((root) => root.querySelector('.source')?.textContent?.startsWith('English (auto'));
await waitPanel((root) => root.querySelectorAll('.row').length > 1000);
const s5 = await inPanel((root) => ({
  rows: root.querySelectorAll('.row').length,
  source: root.querySelector('.source')?.textContent,
  segmented: !!root.querySelector('.segmented'),
  first: root.querySelector('.row .orig')?.textContent,
  trans: root.querySelectorAll('.trans').length,
}));
check('站内跳转后换成新视频的字幕', s5.rows > 3000, `${s5.rows} 句`);
check('机翻被限流时只显示原文，不报错', s5.trans === 0 && !s5.segmented, s5.source);
check('自动字幕合句后长度适中', (s5.first?.split(' ').length ?? 0) <= 22, s5.first);
await page.screenshot({ path: join(shotDir, 'e2e-3-asr.png') });

// ---------- 场景 3：无字幕 ----------
await page.click('a[href="?v=NOCAPTION01"]');
await waitPanel((root) => root.querySelector('.state')?.textContent.includes('没有字幕'));
check('无字幕视频给出提示', true);

// ---------- 场景 4：非视频页隐藏，收起 / 展开 ----------
await page.click('a[href="?"]');
await waitPanel((root) => !root.querySelector('.panel'));
check('非视频页隐藏浮窗', true);

await page.click('a[href="?v=MANUAL00001"]');
await waitPanel((root) => root.querySelectorAll('.row').length > 0);
check('回到看过的视频直接用缓存', true);
await inPanel((root) => root.querySelector('header .icon').click());
await waitPanel((root) => !!root.querySelector('.launcher'));
await page.screenshot({ path: join(shotDir, 'e2e-4-collapsed.png') });
await inPanel((root) => root.querySelector('.launcher').click());
await waitPanel((root) => !!root.querySelector('.panel'));
check('收起后可展开', true);

// 深色模式
await page.evaluate(() => document.documentElement.setAttribute('dark', ''));
await sleep(200);
check('跟随深色模式', (await inPanel((root) => root.querySelector('.panel').dataset.theme)) === 'dark');
await page.screenshot({ path: join(shotDir, 'e2e-5-dark.png') });

await browser.close();
console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
