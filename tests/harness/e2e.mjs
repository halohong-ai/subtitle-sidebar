// 端到端测试：用本机 Chrome（无头、临时配置目录）打开 harness.html，检查浮窗行为。
// 用法：npm run build && node tests/harness/e2e.mjs [截图目录]
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const shotDir = process.argv[2] ?? tmpdir();
const base = pathToFileURL(resolve('tests/harness/harness.html')).href;
const biliBase = pathToFileURL(resolve('tests/harness/harness-bili.html')).href;

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
await inPanel((root) => root.querySelector('header > .icon').click());
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

await page.evaluate(() => document.documentElement.removeAttribute('dark'));

// ---------- 场景 5：单句循环与快捷键 ----------
const rowsInfo = () =>
  inPanel((root) => ({
    active: [...root.querySelectorAll('.row')].findIndex((r) => r.classList.contains('active')),
    looping: [...root.querySelectorAll('.row')].findIndex((r) => r.classList.contains('looping')),
  }));
await page.evaluate(() => {
  document.querySelector('video').currentTime = 120;
});
await sleep(500);
const before = await rowsInfo();
await page.keyboard.press(']');
await sleep(400);
const afterNext = await rowsInfo();
check('快捷键 ] 跳到下一句', afterNext.active === before.active + 1, `${before.active} → ${afterNext.active}`);
await page.keyboard.press('[');
await sleep(400);
check('快捷键 [ 回到上一句', (await rowsInfo()).active === before.active);

// 开循环并播放，等它播过句尾，应该被拉回句首
await page.keyboard.press('Backslash');
await sleep(300);
const loopRow = await inPanel((root) => {
  const rows = [...root.querySelectorAll('.row')];
  const i = rows.findIndex((r) => r.classList.contains('looping'));
  return { i, pressed: root.querySelector('.player-controls button[aria-pressed]')?.getAttribute('aria-pressed') };
});
check('快捷键 \\ 打开单句循环并标记当前句', loopRow.i === before.active && loopRow.pressed === 'true', JSON.stringify(loopRow));
const cueRange = await page.evaluate(async () => {
  const v = document.querySelector('video');
  await v.play();
  return null;
});
const samples = [];
for (let k = 0; k < 16; k++) {
  await sleep(1000);
  samples.push(await page.$eval('video', (v) => +v.currentTime.toFixed(1)));
}
const info = await rowsInfo();
const wentBack = samples.some((t, k) => k > 0 && t < samples[k - 1]);
check('循环中播放到句尾会跳回句首', wentBack && info.looping === before.active, samples.join(','));
await page.$eval('video', (v) => v.pause());

// 循环中点击另一句，循环目标跟着换
const clicked = before.active + 5;
await inPanel((root, [i]) => root.querySelectorAll('.row')[i].click(), clicked);
await sleep(500);
check('循环中点击另一句，改为循环那一句', (await rowsInfo()).looping === clicked);
await page.keyboard.press('Backslash');
await sleep(300);
check('再按 \\ 关闭循环', (await rowsInfo()).looping === -1);
await page.screenshot({ path: join(shotDir, 'e2e-6-loop.png') });

// ---------- 场景 6：B站 ----------
await page.goto(`${biliBase}?site=bili&bv=BV1TEST00001&p=1`);
await waitPanel((root) => root.querySelectorAll('.row').length > 0);
const b1 = await inPanel((root) => ({
  rows: root.querySelectorAll('.row').length,
  source: root.querySelector('.source')?.textContent,
  first: [...root.querySelectorAll('.row')[0].querySelectorAll('p')].map((p) => p.textContent),
  modes: [...root.querySelectorAll('.segmented button')].map((b) => b.textContent),
}));
check('B站：读到字幕', b1.rows > 100, `${b1.rows} 句`);
check('B站：AI 英文为原文、AI 中文为译文', b1.source === '英语（自动生成） + 中文（自动翻译）', b1.source);
check('B站：首句中英配对', b1.first.length === 2 && /[\u4e00-\u9fff]/.test(b1.first[1]), JSON.stringify(b1.first));
check('B站：用的是拦截到的播放器数据，没有自己再请求', (await page.evaluate(() => window.__requests__.filter((u) => u.includes('player/wbi/v2')).length)) === 1);
await page.screenshot({ path: join(shotDir, 'e2e-7-bili.png') });

// 切分P
await page.click('a[href*="p=2"]');
await waitPanel((root) => root.querySelector('.row .orig')?.textContent.startsWith('What are we calling'));
check('B站：切分P后换成该P的字幕', true);

// 站内跳到另一个视频（页面状态已过期，需要查 view 接口）→ 未登录
await page.click('a[href*="BV1LOGIN0001"]');
await waitPanel((root) => root.querySelector('.state')?.textContent.includes('登录'));
check('B站：未登录时提示登录', true);
check('B站：页面状态过期时查 view 接口拿 cid', (await page.evaluate(() => window.__requests__.some((u) => u.includes('/x/web-interface/view?bvid=BV1LOGIN0001')))));

// 接口返回了别的视频的字幕 → 校验不通过，重新请求后正确
await page.goto(`${biliBase}?site=bili&bv=BV1WRONG0001`);
await waitPanel((root) => root.querySelectorAll('.row').length > 0 || !!root.querySelector('.state p'));
const b3 = await inPanel((root) => ({
  first: root.querySelector('.row .orig')?.textContent,
  error: root.querySelector('.state p')?.textContent,
}));
check('B站：识别出错的字幕并重新请求', !!b3.first && !b3.first.includes('别的视频'), b3.first ?? b3.error);

// ---------- 场景 7（M3）：提示词、导入、摘要、导图、笔记 ----------
const TAO_SRT = '/Volumes/TU820/Claude/Terence_Tao_No_More_Heroes_bilingual.srt';
const TAO_SUMMARY = '/Volumes/TU820/Claude/Terence_Tao_No_More_Heroes_summary.json';
const TAO_PNG = '/Volumes/TU820/Claude/Terence_Tao_No_More_Heroes_mindmap.png';
if (existsSync(TAO_SRT) && existsSync(TAO_SUMMARY)) {
  const summary = JSON.parse(readFileSync(TAO_SUMMARY, 'utf8'));
  const mm = (start) => start.slice(3, 8); // 00:01:15,439 → 01:15
  const mindmap = {
    title: '没有英雄的数学',
    subtitle: 'Terence Tao 访谈',
    center: '证明过剩\\n理解稀缺',
    center_icon: 'bulb',
    branches: summary.items.slice(0, 8).map((it, i) => ({
      title: it.title,
      icon: ['chat', 'trophy', 'robot', 'book', 'people', 'scale', 'rocket', 'brain'][i],
      time: mm(it.start),
      points: [it.summary.slice(0, 16), it.summary.slice(16, 32)].filter(Boolean),
    })),
  };
  const reply = [
    '好的，以下是三部分结果。',
    '```srt', readFileSync(TAO_SRT, 'utf8'), '```',
    '```json', JSON.stringify(summary), '```',
    '```json', JSON.stringify(mindmap), '```',
  ].join('\n');

  await page.goto(`${base}?v=MANUAL00001`);
  await waitPanel((root) => root.querySelectorAll('.row').length > 0);
  // 记录下载和剪贴板
  // file:// 页面不能 fetch blob 链接，所以直接记下 Blob 对象来读内容
  await page.evaluate(() => {
    window.__downloads__ = [];
    window.__blobs__ = new Map();
    const createUrl = URL.createObjectURL;
    URL.createObjectURL = (b) => {
      const u = createUrl(b);
      window.__blobs__.set(u, b);
      return u;
    };
    HTMLAnchorElement.prototype.click = function () {
      window.__downloads__.push({ name: this.download, href: this.href });
    };
    window.__clipboard__ = '';
    navigator.clipboard.writeText = async (t) => {
      window.__clipboard__ = t;
    };
  });
  const lastDownloadText = () =>
    page.evaluate(async () => {
      const d = window.__downloads__.at(-1);
      const blob = d && window.__blobs__.get(d.href);
      return { name: d?.name, text: blob ? await blob.text() : '' };
    });
  const menu = async (label) => {
    await inPanel((root) => root.querySelector('.menu > .icon').click());
    await inPanel((root, [label]) => [...root.querySelectorAll('.menu-list button')].find((b) => b.textContent.includes(label)).click(), label);
    await sleep(300);
  };

  await menu('复制 AI 提示词');
  const clip = await page.evaluate(() => window.__clipboard__);
  check('复制 AI 提示词', clip.includes('## 字幕') && clip.includes('-->') && clip.includes('```json'), `${clip.length} 字`);
  check('复制后给出下一步提示', !!(await inPanel((root) => root.querySelector('.toast')?.textContent.includes('导入'))));

  await menu('导出字幕');
  const srtFile = await lastDownloadText();
  check('导出 SRT', srtFile.name.endsWith('_bilingual.srt') && srtFile.text.includes('-->'), srtFile.name);
  await menu('导出文本');
  check('导出 TXT', (await lastDownloadText()).text.includes('[0:00]'));

  // 粘贴 AI 回复导入
  await menu('导入');
  await inPanel((root, [text]) => {
    const ta = root.querySelector('.dialog textarea');
    ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, reply);
  await inPanel((root) => root.querySelector('.dialog .primary').click());
  await waitPanel((root) => !root.querySelector('.dialog'));
  check('粘贴导入后对话框关闭，切到摘要页', !!(await inPanel((root) => root.querySelector('.tabs .on')?.textContent === '摘要')));
  const sum = await inPanel((root) => root.querySelectorAll('.summary-item').length);
  check('摘要显示全部话题', sum === summary.items.length, `${sum} 项`);

  await inPanel((root) => root.querySelectorAll('.summary-item')[2].click());
  await sleep(300);
  const t3 = await page.$eval('video', (v) => v.currentTime);
  const expect3 = (() => {
    const [h, m, rest] = summary.items[2].start.split(':');
    return Number(h) * 3600 + Number(m) * 60 + Number(rest.replace(',', '.'));
  })();
  check('点摘要跳到话题开头', Math.abs(t3 - expect3) < 0.5, `${t3.toFixed(1)}s`);
  await sleep(500);
  check('当前话题高亮', (await inPanel((root) => [...root.querySelectorAll('.summary-item')].findIndex((x) => x.classList.contains('active')))) === 2);
  await page.screenshot({ path: join(shotDir, 'e2e-8-summary.png') });

  // 导图
  await inPanel((root) => [...root.querySelectorAll('.tabs button')].find((b) => b.textContent === '导图').click());
  await waitPanel((root) => root.querySelectorAll('.mindmap-svg [data-time]').length > 0);
  const branches = await inPanel((root) => root.querySelectorAll('.mindmap-svg [data-time]').length);
  check('导图画出全部分支', branches === mindmap.branches.length, `${branches} 个`);
  await inPanel((root) => root.querySelectorAll('.mindmap-svg [data-time] rect, .mindmap-svg [data-time] path')[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await sleep(300);
  check('点导图分支跳转', Math.abs((await page.$eval('video', (v) => v.currentTime)) - 0) < 1);
  await page.screenshot({ path: join(shotDir, 'e2e-9-mindmap.png') });
  await inPanel((root) => [...root.querySelectorAll('.mindmap-bar button')].find((b) => b.textContent === '放大查看').click());
  await waitPanel((root) => root.querySelectorAll('.overlay [data-time]').length > 0);
  check('放大查看显示左右展开的大图', true);
  await page.screenshot({ path: join(shotDir, 'e2e-10-overlay.png') });
  await page.keyboard.press('Escape');
  await waitPanel((root) => !root.querySelector('.overlay'));
  await inPanel((root) => root.querySelector('.mindmap-bar .primary').click());
  await page.waitForFunction(() => window.__downloads__.at(-1)?.name.endsWith('_mindmap.png'), { timeout: 10000 });
  const png = await page.evaluate(() => window.__downloads__.at(-1));
  check('导出导图 PNG', png.href.startsWith('data:image/png') && png.href.length > 50_000, `${Math.round(png.href.length / 1024)} KB`);
  const pngSize = await page.evaluate(async (href) => {
    const img = new Image();
    img.src = href;
    await img.decode();
    return [img.width, img.height];
  }, png.href);
  check('PNG 为 2 倍分辨率', pngSize[0] === 3000, pngSize.join('×'));

  // 笔记
  await inPanel((root) => [...root.querySelectorAll('.tabs button')].find((b) => b.textContent === '字幕').click());
  await waitPanel((root) => root.querySelectorAll('.row').length > 0);
  check('字幕来源显示为导入的字幕', (await inPanel((root) => root.querySelector('.source')?.textContent)) === '导入的字幕');
  await inPanel((root) => {
    const rows = root.querySelectorAll('.row');
    rows[1].querySelector('.star').click();
    rows[4].querySelector('.star').click();
  });
  await sleep(200);
  check('收藏两句，笔记标签显示数量', (await inPanel((root) => root.querySelector('.badge')?.textContent)) === '2');
  check('点星标不会跳转视频', Math.abs((await page.$eval('video', (v) => v.currentTime)) - 0) < 1);
  await inPanel((root) => [...root.querySelectorAll('.tabs button')].find((b) => b.textContent.startsWith('笔记')).click());
  await waitPanel((root) => root.querySelectorAll('.note').length === 2);
  await inPanel((root) => root.querySelectorAll('.note .chip')[1].click());
  const ta = await page.evaluateHandle(() =>
    [...document.documentElement.children].find((e) => e.shadowRoot).shadowRoot.querySelector('.note textarea'),
  );
  await ta.type('这是我的批注');
  await sleep(500);
  await page.screenshot({ path: join(shotDir, 'e2e-11-notes.png') });
  await inPanel((root) => root.querySelector('.notes-bar .primary').click());
  const md = await lastDownloadText();
  check('导出 Markdown 含分组、时间戳链接和批注', md.name.endsWith('_notes.md') && md.text.includes('## 想法') && md.text.includes('## 好句') && md.text.includes('> 这是我的批注') && md.text.includes('&t='), md.name);

  // 刷新后数据仍在
  await page.reload();
  await waitPanel((root) => root.querySelector('.badge')?.textContent === '2');
  await inPanel((root) => [...root.querySelectorAll('.tabs button')].find((b) => b.textContent === '摘要').click());
  await waitPanel((root) => root.querySelectorAll('.summary-item').length > 0);
  check('刷新后导入的内容和笔记仍在', true);

  // 恢复网站字幕
  await page.evaluate(() => {
    window.__downloads__ = [];
    HTMLAnchorElement.prototype.click = function () {
      window.__downloads__.push({ name: this.download, href: this.href });
    };
  });
  await inPanel((root) => [...root.querySelectorAll('.tabs button')].find((b) => b.textContent === '字幕').click());
  await menu('恢复为网站字幕');
  await waitPanel((root) => root.querySelector('.source')?.textContent === 'English + Chinese (Simplified)');
  check('恢复为网站字幕', true);

  // 导入 skill 生成的导图 PNG
  if (existsSync(TAO_PNG)) {
    await menu('导入');
    const input = await page.evaluateHandle(() =>
      [...document.documentElement.children].find((e) => e.shadowRoot).shadowRoot.querySelector('.dialog input[type=file]'),
    );
    await input.uploadFile(TAO_PNG);
    await sleep(200);
    await inPanel((root) => root.querySelector('.dialog .primary').click());
    await waitPanel((root) => !!root.querySelector('.mindmap-img'));
    check('导入 skill 生成的导图 PNG', (await inPanel((root) => root.querySelector('.mindmap-img').naturalWidth)) > 500);
    await page.evaluate(() => document.documentElement.setAttribute('dark', ''));
    await sleep(200);
    await page.screenshot({ path: join(shotDir, 'e2e-12-png-dark.png') });
    await page.evaluate(() => document.documentElement.removeAttribute('dark'));
  }
} else {
  console.log('SKIP  M3 场景（缺少 Terence Tao 的 skill 产物）');
}

await browser.close();
console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
