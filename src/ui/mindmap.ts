// 手绘风思维导图（roughjs）。两种布局：
// - drawTree：竖排树，适合 300～600px 宽的侧栏
// - drawRadial：中心在中间、分支左右展开（与 bilingual-srt-translator skill 的 PNG 一致：
//   右侧从上到下，再到左侧从下到上，按时间顺时针阅读），用于放大查看和导出 PNG
// 每个有时间点的分支是 <g data-time="毫秒">，由调用方处理点击跳转。

import rough from 'roughjs';
import { formatClock } from '../core/time';
import type { Mindmap, MindmapBranch } from '../core/types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FONT = '"Kaiti SC", "STKaiti", "KaiTi", "Xingkai SC", "Comic Sans MS", cursive';
const PALETTE = [
  '#e76f51', '#2a9d8f', '#d4a017', '#457b9d', '#9b5de5', '#f4a261',
  '#06a77d', '#ef476f', '#118ab2', '#6a994e', '#ff7f51', '#6a4c93',
];
const ICONS: Record<string, string> = {
  bulb: '💡', book: '📖', robot: '🤖', chat: '💬', mountain: '⛰️', fish: '🐟', car: '🚗',
  trophy: '🏆', warning: '⚠️', people: '👥', chalkboard: '🧑‍🏫', magnifier: '🔍', rocket: '🚀',
  heart: '❤️', clock: '⏰', star: '⭐', pencil: '✏️', calendar: '📅', scale: '⚖️', fox: '🦊',
  globe: '🌍', gear: '⚙️', chart: '📈', lock: '🔒', brain: '🧠', coffee: '☕',
};

interface Theme {
  text: string;
  muted: string;
  centerFill: string;
  background: string | null;
}

const LIGHT: Theme = { text: '#222222', muted: '#777777', centerFill: '#ffe066', background: null };
const DARK: Theme = { text: '#eeeeee', muted: '#aaaaaa', centerFill: '#8a6d00', background: null };
const EXPORT: Theme = { ...LIGHT, background: '#fffdf7' };

const icon = (name?: string) => (name && ICONS[name] ? `${ICONS[name]} ` : '');

/** 估算文字宽度：中文和全角字符按 1 个字宽，其余按 0.55 个字宽。 */
function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    w += cp > 0x2e80 ? (cp > 0x1f000 ? 1.2 : 1) : 0.55;
  }
  return w * size;
}

/** 按宽度折行，保留原有的 \n。英文尽量在空格处断开。 */
function wrap(text: string, maxWidth: number, size: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const token of para.match(/[A-Za-z0-9'’.,:;!?%$-]+\s*|\s+|./gu) ?? []) {
      if (line && textWidth(line + token, size) > maxWidth) {
        lines.push(line.trimEnd());
        line = token.trimStart();
      } else {
        line += token;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines.filter((l, i) => l || i === 0);
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

function text(
  parent: Element,
  x: number,
  y: number,
  lines: string[],
  opts: { size: number; lineHeight: number; color: string; weight?: number; anchor?: string },
): void {
  const t = el(
    'text',
    {
      x,
      y,
      'font-size': opts.size,
      'font-family': FONT,
      'font-weight': opts.weight ?? 400,
      fill: opts.color,
      'text-anchor': opts.anchor ?? 'start',
    },
    parent,
  );
  lines.forEach((line, i) => {
    const span = el('tspan', { x, dy: i === 0 ? 0 : opts.lineHeight }, t);
    span.textContent = line;
  });
}

function reset(svg: SVGSVGElement, width: number, height: number, theme: Theme): void {
  svg.replaceChildren();
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  if (theme.background) el('rect', { x: 0, y: 0, width, height, fill: theme.background }, svg);
}

function branchGroup(parent: Element, b: MindmapBranch): SVGGElement {
  const g = el('g', { class: 'branch' }, parent);
  if (b.time !== null) {
    g.setAttribute('data-time', String(b.time));
    g.setAttribute('style', 'cursor:pointer');
    el('title', {}, g).textContent = `跳到 ${formatClock(b.time)}`;
  }
  return g;
}

// ---------- 竖排树 ----------

export function drawTree(svg: SVGSVGElement, map: Mindmap, width: number, dark: boolean): void {
  const theme = dark ? DARK : LIGHT;
  const pad = 10;
  const trunkX = pad + 12;
  const boxX = pad + 30;
  const boxW = width - boxX - pad;

  // 先算高度
  const centerLines = wrap(icon(map.centerIcon) + map.center, width - 2 * pad - 24, 18);
  const centerH = centerLines.length * 24 + 22;
  const layout = map.branches.map((b) => {
    const titleLines = wrap(icon(b.icon) + b.title, boxW - (b.time !== null ? 64 : 20), 15);
    const pointLines = b.points.flatMap((p) => wrap(`· ${p}`, boxW - 20, 13));
    return { b, titleLines, pointLines, h: 12 + titleLines.length * 20 + 4 + pointLines.length * 19 + 10 };
  });
  const height = pad + centerH + 16 + layout.reduce((s, x) => s + x.h + 12, 0) + pad;

  reset(svg, width, height, theme);
  const rc = rough.svg(svg);

  svg.appendChild(
    rc.rectangle(pad, pad, width - 2 * pad, centerH, {
      seed: 1, stroke: theme.text, strokeWidth: 1.5, fill: theme.centerFill, fillStyle: 'hachure',
      hachureGap: 6, fillWeight: 1,
    }),
  );
  text(svg, width / 2, pad + 30, centerLines, {
    size: 18, lineHeight: 24, color: theme.text, weight: 700, anchor: 'middle',
  });

  let y = pad + centerH + 16;
  const trunkTop = y - 16;
  let lastJoin = y;
  layout.forEach(({ b, titleLines, pointLines, h }, i) => {
    const color = PALETTE[i % PALETTE.length];
    const g = branchGroup(svg, b);
    const joinY = y + 18;
    g.appendChild(rc.line(trunkX, joinY, boxX, joinY, { seed: i + 10, stroke: color, strokeWidth: 1.5 }));
    g.appendChild(
      rc.rectangle(boxX, y, boxW, h, {
        seed: i + 30, stroke: color, strokeWidth: 1.5, fill: `${color}22`, fillStyle: 'solid', roughness: 1.3,
      }),
    );
    text(g, boxX + 10, y + 26, titleLines, { size: 15, lineHeight: 20, color: theme.text, weight: 700 });
    if (b.time !== null) {
      text(g, boxX + boxW - 10, y + 24, [formatClock(b.time)], {
        size: 12, lineHeight: 16, color, weight: 700, anchor: 'end',
      });
    }
    if (pointLines.length) {
      text(g, boxX + 10, y + 12 + titleLines.length * 20 + 4 + 14, pointLines, {
        size: 13, lineHeight: 19, color: theme.text,
      });
    }
    lastJoin = joinY;
    y += h + 12;
  });
  svg.insertBefore(
    rc.line(trunkX, trunkTop, trunkX, lastJoin, { seed: 5, stroke: theme.muted, strokeWidth: 1.5 }),
    svg.children[1] ?? null,
  );
}

// ---------- 左右展开的大图 ----------

const R = {
  width: 1500,
  boxW: 430,
  centerW: 320,
  margin: 40,
  gap: 28,
  top: 140,
};

export function drawRadial(svg: SVGSVGElement, map: Mindmap, forExport = false): void {
  const theme = forExport ? EXPORT : { ...LIGHT, background: '#fffdf7' };
  const { width, boxW, centerW, margin, gap, top } = R;

  const boxes = map.branches.map((b, i) => {
    const titleLines = wrap(icon(b.icon) + b.title, boxW - (b.time !== null ? 90 : 30), 21);
    const pointLines = b.points.flatMap((p) => wrap(`· ${p}`, boxW - 30, 17));
    const h = 18 + titleLines.length * 28 + 6 + pointLines.length * 25 + 14;
    return { b, i, titleLines, pointLines, h };
  });

  // 顺时针：前一半放右侧从上到下，后一半放左侧从下到上
  const nRight = Math.ceil(boxes.length / 2);
  const right = boxes.slice(0, nRight);
  const left = boxes.slice(nRight).reverse();
  const colH = (col: typeof boxes) => col.reduce((s, x) => s + x.h, 0) + gap * Math.max(0, col.length - 1);
  const maxCol = Math.max(colH(right), colH(left), 200);
  const height = top + maxCol + 90;

  reset(svg, width, height, theme);
  const rc = rough.svg(svg);

  text(svg, width / 2, 62, [map.title], { size: 34, lineHeight: 40, color: theme.text, weight: 700, anchor: 'middle' });
  if (map.subtitle) {
    text(svg, width / 2, 98, [map.subtitle], { size: 18, lineHeight: 24, color: theme.muted, anchor: 'middle' });
  }

  const centerLines = wrap(icon(map.centerIcon) + map.center, centerW - 40, 28);
  const centerH = centerLines.length * 36 + 44;
  const cx = width / 2 - centerW / 2;
  const cy = top + maxCol / 2 - centerH / 2;

  const placeColumn = (col: typeof boxes, x: number, side: 'left' | 'right') => {
    let y = top + (maxCol - colH(col)) / 2;
    for (const { b, i, titleLines, pointLines, h } of col) {
      const color = PALETTE[i % PALETTE.length];
      const g = branchGroup(svg, b);
      const fromX = side === 'right' ? cx + centerW : cx;
      const toX = side === 'right' ? x : x + boxW;
      const fromY = cy + centerH / 2;
      const toY = y + h / 2;
      // 三次贝塞尔：从中心框水平出发，水平进入分支框
      const bend = (toX - fromX) / 2;
      g.appendChild(
        rc.path(`M ${fromX} ${fromY} C ${fromX + bend} ${fromY}, ${toX - bend} ${toY}, ${toX} ${toY}`, {
          seed: i + 10, stroke: color, strokeWidth: 2.2, roughness: 1,
        }),
      );
      g.appendChild(
        rc.rectangle(x, y, boxW, h, {
          seed: i + 30, stroke: color, strokeWidth: 2, fill: `${color}26`, fillStyle: 'hachure',
          hachureGap: 9, fillWeight: 0.8, roughness: 1.4,
        }),
      );
      text(g, x + 16, y + 34, titleLines, { size: 21, lineHeight: 28, color: theme.text, weight: 700 });
      if (b.time !== null) {
        text(g, x + boxW - 16, y + 32, [formatClock(b.time)], {
          size: 16, lineHeight: 20, color, weight: 700, anchor: 'end',
        });
      }
      text(g, x + 16, y + 18 + titleLines.length * 28 + 6 + 20, b.points.length ? pointLines : [], {
        size: 17, lineHeight: 25, color: theme.text,
      });
      y += h + gap;
    }
  };
  placeColumn(right, width - margin - boxW, 'right');
  placeColumn(left, margin, 'left');

  svg.appendChild(
    rc.rectangle(cx, cy, centerW, centerH, {
      seed: 2, stroke: theme.text, strokeWidth: 2.5, fill: theme.centerFill, fillStyle: 'hachure',
      hachureGap: 7, fillWeight: 1.2,
    }),
  );
  text(svg, width / 2, cy + 46, centerLines, {
    size: 28, lineHeight: 36, color: theme.text, weight: 700, anchor: 'middle',
  });

  text(svg, width / 2, height - 30, ['按时间顺时针阅读：右侧从上到下，再到左侧从下到上'], {
    size: 15, lineHeight: 20, color: theme.muted, anchor: 'middle',
  });
}

/** 把大图导出为 PNG（2 倍分辨率），返回 data URL。 */
export async function mindmapToPng(map: Mindmap): Promise<string> {
  const svg = document.createElementNS(SVG_NS, 'svg');
  drawRadial(svg, map, true);
  const width = Number(svg.getAttribute('width'));
  const height = Number(svg.getAttribute('height'));
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}
