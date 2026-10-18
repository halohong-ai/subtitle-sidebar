import { describe, expect, it } from 'vitest';
import { parseJson3 } from '../src/core/json3';
import { buildCues, joinText, lastAtOrBefore, mergeCues, mergeSentences } from '../src/core/normalize';
import { cleanText } from '../src/core/text';
import { formatClock, parseClock } from '../src/core/time';

// 自动字幕：逐词、无标点，中间有一次 1.5 秒的停顿。
const asrJson3 = {
  events: [
    { tStartMs: 0, dDurationMs: 9000 },
    {
      tStartMs: 160,
      dDurationMs: 4000,
      wWinId: 1,
      segs: [
        { utf8: 'so', acAsrConf: 0 },
        { utf8: ' today', tOffsetMs: 240 },
        { utf8: ' we', tOffsetMs: 480 },
        { utf8: ' talk', tOffsetMs: 720 },
        { utf8: ' about', tOffsetMs: 960 },
        { utf8: ' scaling', tOffsetMs: 1200 },
      ],
    },
    { tStartMs: 2000, dDurationMs: 100, aAppend: 1, segs: [{ utf8: '\n' }] },
    {
      tStartMs: 2900,
      dDurationMs: 3000,
      wWinId: 1,
      segs: [
        { utf8: 'and', acAsrConf: 0 },
        { utf8: ' why', tOffsetMs: 200 },
        { utf8: ' it', tOffsetMs: 400 },
        { utf8: ' works', tOffsetMs: 600 },
        { utf8: ' so', tOffsetMs: 800 },
        { utf8: ' well', tOffsetMs: 1000 },
      ],
    },
  ],
};

// 人工字幕：一行一个事件，带标点，一句话跨两行。
const manualJson3 = {
  events: [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'Welcome back to the show.' }] },
    { tStartMs: 2000, dDurationMs: 2000, segs: [{ utf8: 'Today we have a guest who' }] },
    { tStartMs: 4000, dDurationMs: 2000, segs: [{ utf8: 'built\nthe whole thing.' }] },
  ],
};

// YouTube 机翻中文：时间切分和英文不一致。
const zhJson3 = {
  events: [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: '欢迎回到节目。' }] },
    { tStartMs: 2100, dDurationMs: 1800, segs: [{ utf8: '今天我们请到的嘉宾' }] },
    { tStartMs: 3900, dDurationMs: 2100, segs: [{ utf8: '搭建了整个系统。' }] },
  ],
};

describe('parseJson3', () => {
  it('把自动字幕拆成逐词片段，跳过换行事件', () => {
    const frags = parseJson3(asrJson3);
    expect(frags.map((f) => f.text)).toEqual([
      'so', 'today', 'we', 'talk', 'about', 'scaling',
      'and', 'why', 'it', 'works', 'so', 'well',
    ]);
    expect(frags[1].start).toBe(400);
    // 词的结束时间不超过下一个词的开始
    expect(frags[1].end).toBe(640);
    // 停顿前最后一个词最多持续 500ms
    expect(frags[5].end).toBe(1360 + 500);
  });

  it('人工字幕一行一个片段，行内换行变空格', () => {
    const frags = parseJson3(manualJson3);
    expect(frags).toHaveLength(3);
    expect(frags[2].text).toBe('built the whole thing.');
  });

  it('空数据返回空数组', () => {
    expect(parseJson3({})).toEqual([]);
  });
});

describe('mergeSentences', () => {
  it('无标点的自动字幕按停顿断句', () => {
    const s = mergeSentences(parseJson3(asrJson3), true);
    expect(s.map((x) => x.text)).toEqual([
      'so today we talk about scaling',
      'and why it works so well',
    ]);
    expect(s[0].start).toBe(160);
    expect(s[1].start).toBe(2900);
  });

  it('带标点的字幕按句末标点合并', () => {
    const s = mergeSentences(parseJson3(manualJson3), false);
    expect(s.map((x) => x.text)).toEqual([
      'Welcome back to the show.',
      'Today we have a guest who built the whole thing.',
    ]);
    expect(s[1]).toMatchObject({ start: 2000, end: 6000 });
  });

  it('每行一句、行尾不带句号的字幕（B站 AI 字幕常见）不合并', () => {
    const frags = [
      { start: 0, end: 1000, text: "Hello everyone, I'm Xiaojun" },
      { start: 1000, end: 2000, text: "Today's guest is Professor Zeng." },
      { start: 2000, end: 3000, text: 'He also helped found two schools' },
    ];
    expect(mergeSentences(frags, false)).toHaveLength(3);
  });

  it('无标点的人工字幕保持原行', () => {
    const frags = [
      { start: 0, end: 1000, text: 'first line' },
      { start: 1000, end: 2000, text: 'second line' },
    ];
    expect(mergeSentences(frags, false)).toHaveLength(2);
  });

  it('超长句子强制断开', () => {
    const words = Array.from({ length: 100 }, (_, i) => ({
      start: i * 100, end: i * 100 + 90, text: `w${i}`,
    }));
    const s = mergeSentences(words, true);
    expect(s.length).toBeGreaterThan(2);
    for (const x of s) expect(x.text.split(' ').length).toBeLessThanOrEqual(41);
  });

  it('去掉连续重复的行', () => {
    const frags = [
      { start: 0, end: 1000, text: 'Hello there.' },
      { start: 900, end: 1500, text: 'Hello there.' },
      { start: 1600, end: 2500, text: 'How are you?' },
    ];
    expect(mergeSentences(frags, false).map((x) => x.text)).toEqual(['Hello there.', 'How are you?']);
  });
});

describe('buildCues', () => {
  it('把译文按时间配到英文句子上', () => {
    const cues = buildCues(parseJson3(manualJson3), false, parseJson3(zhJson3));
    expect(cues).toEqual([
      { id: 1, start: 0, end: 2000, text: 'Welcome back to the show.', trans: '欢迎回到节目。' },
      {
        id: 2, start: 2000, end: 6000,
        text: 'Today we have a guest who built the whole thing.',
        trans: '今天我们请到的嘉宾搭建了整个系统。',
      },
    ]);
  });

  it('没有译文轨道时不带 trans 字段', () => {
    const cues = buildCues(parseJson3(manualJson3), false);
    expect(cues[0]).not.toHaveProperty('trans');
  });
});

describe('mergeCues', () => {
  it('合并跨行的双语句子，原文译文一起合并', () => {
    const cues = [
      { id: 1, start: 0, end: 2000, text: 'What are we calling this big event that', trans: '我们该怎么称呼这件大事——' },
      { id: 2, start: 2000, end: 4000, text: 'happened in October?', trans: '十月初发生的那件事？' },
      { id: 3, start: 4000, end: 5000, text: 'Nobody knows.', trans: '没人知道。' },
    ];
    expect(mergeCues(cues)).toEqual([
      { id: 1, start: 0, end: 4000, text: 'What are we calling this big event that happened in October?', trans: '我们该怎么称呼这件大事——十月初发生的那件事？' },
      { id: 2, start: 4000, end: 5000, text: 'Nobody knows.', trans: '没人知道。' },
    ]);
  });
});

describe('cleanText', () => {
  it('去掉 HTML 标签、还原转义字符', () => {
    expect(cleanText('<b>今天我们的嘉宾是游凯超</b>')).toBe('今天我们的嘉宾是游凯超');
    expect(cleanText('<font color="#ffff00">It&#39;s  <i>fine</i></font> &amp; ok')).toBe("It's fine & ok");
    expect(cleanText('a < b and c > d')).toBe('a < b and c > d');
  });

  it('json3 人工字幕里的标签被去掉', () => {
    const frags = parseJson3({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '<b>Today our guest.</b>' }] }] });
    expect(frags[0].text).toBe('Today our guest.');
  });
});

describe('工具函数', () => {
  it('joinText 中文之间不加空格', () => {
    expect(joinText('你好', '世界')).toBe('你好世界');
    expect(joinText('这件大事——', '十月初')).toBe('这件大事——十月初');
    expect(joinText('是什么？', '就是')).toBe('是什么？就是');
    expect(joinText('hello', 'world')).toBe('hello world');
    expect(joinText('', 'x')).toBe('x');
  });

  it('lastAtOrBefore 二分查找', () => {
    const a = [0, 1000, 2000, 3000];
    expect(lastAtOrBefore(a, -1)).toBe(-1);
    expect(lastAtOrBefore(a, 0)).toBe(0);
    expect(lastAtOrBefore(a, 2500)).toBe(2);
    expect(lastAtOrBefore(a, 9999)).toBe(3);
  });

  it('时间格式互转', () => {
    expect(formatClock(3723000)).toBe('1:02:03');
    expect(formatClock(65000)).toBe('1:05');
    expect(parseClock('1:02:03')).toBe(3723000);
    expect(parseClock('2:05')).toBe(125000);
    expect(parseClock('abc')).toBeNull();
  });
});
