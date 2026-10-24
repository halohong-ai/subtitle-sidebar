// 用本机 Chrome 把 scripts/icon.svg 渲染成扩展和商店需要的各尺寸 PNG。
// 用法：node scripts/icons.mjs
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const svg = readFileSync('scripts/icon.svg', 'utf8');

// 商店要求 128 图标四周各留 16px 透明边，图案占中间 96px；小尺寸铺满。
const SIZES = [
  { size: 16, art: 16 },
  { size: 32, art: 32 },
  { size: 48, art: 48 },
  { size: 128, art: 96 },
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
for (const { size, art } of SIZES) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  const pad = (size - art) / 2;
  await page.setContent(
    `<body style="margin:0;background:transparent"><div style="padding:${pad}px;width:${art}px;height:${art}px">${svg.replace('<svg ', `<svg width="${art}" height="${art}" `)}</div></body>`,
  );
  await page.screenshot({ path: `static/icons/icon${size}.png`, omitBackground: true });
}
await browser.close();
console.log('已生成 static/icons/icon{16,32,48,128}.png');
