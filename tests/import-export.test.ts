import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importTexts, splitPasted } from '../src/core/importer';
import { notesToMarkdown } from '../src/core/markdown';
import { buildPrompt, hasChinese } from '../src/core/prompt';
import { parseSrt, toSrt, toTxt } from '../src/core/srt';
import { FormatError, parseSummary } from '../src/core/summary';
import { formatSrtTime, parseTimestamp } from '../src/core/time';
import type { Note } from '../src/core/types';

const BILINGUAL_SRT = `1
00:00:00,160 --> 00:00:02,480
What are we calling this big event that
我们该怎么称呼这件大事——

2
00:00:02,480 --> 00:00:04,160
happened at the start of October?
十月初发生的那件事？
`;

const SUMMARY = {
  items: [
    { start: '00:00:00,160', title: '开场', summary: '主持人提问。' },
    { start: '00:01:15,439', title: '英雄时代的终结', summary: '陶哲轩的观点。' },
  ],
};


describe('时间戳', () => {
  it('解析多种格式', () => {
    expect(parseTimestamp('00:01:15,439')).toBe(75439);
    expect(parseTimestamp('00:01:15.4')).toBe(75400);
    expect(parseTimestamp('01:15')).toBe(75000);
    expect(parseTimestamp('1:02:03')).toBe(3723000);
    expect(parseTimestamp('75:30')).toBe(4530000);
    expect(parseTimestamp('00:61:00')).toBeNull();
    expect(parseTimestamp('abc')).toBeNull();
  });

  it('格式化为 SRT 时间', () => {
    expect(formatSrtTime(3723456)).toBe('01:02:03,456');
    expect(formatSrtTime(0)).toBe('00:00:00,000');
  });
});

describe('SRT', () => {
  it('解析双语 SRT：英文为原文，中文为译文', () => {
    const { cues, origIsCjk, hasTrans } = parseSrt(BILINGUAL_SRT);
    expect(origIsCjk).toBe(false);
    expect(hasTrans).toBe(true);
    expect(cues[0]).toEqual({
      id: 1, start: 160, end: 2480,
      text: 'What are we calling this big event that',
      trans: '我们该怎么称呼这件大事——',
    });
  });

  it('解析纯中文 SRT：中文为原文', () => {
    const { cues, origIsCjk, hasTrans } = parseSrt('1\n00:00:01,000 --> 00:00:02,000\n大家好\n');
    expect(origIsCjk).toBe(true);
    expect(hasTrans).toBe(false);
    expect(cues[0].text).toBe('大家好');
  });

  it('兼容 BOM、Windows 换行和缺序号', () => {
    const { cues } = parseSrt('﻿00:00:01,000 --> 00:00:02,000\r\nHello\r\n\r\n');
    expect(cues).toHaveLength(1);
  });

  it('导出 SRT 后再解析，内容不变', () => {
    const { cues } = parseSrt(BILINGUAL_SRT);
    expect(parseSrt(toSrt(cues)).cues).toEqual(cues);
  });

  it('导出 TXT 带时间', () => {
    const { cues } = parseSrt(BILINGUAL_SRT);
    expect(toTxt(cues)).toContain('[0:00] What are we calling');
  });
});

describe('摘要', () => {
  it('解析 summary.json', () => {
    const items = parseSummary(SUMMARY);
    expect(items[1]).toEqual({ start: 75439, title: '英雄时代的终结', summary: '陶哲轩的观点。' });
  });

  it('时间不递增时报错', () => {
    const bad = { items: [SUMMARY.items[1], SUMMARY.items[0]] };
    expect(() => parseSummary(bad)).toThrow(FormatError);
  });

  it('超出视频时长时报错', () => {
    expect(() => parseSummary(SUMMARY, 60_000)).toThrow(/超出/);
  });



  const skillSummary = '/Volumes/TU820/Claude/Terence_Tao_No_More_Heroes_summary.json';
  it.skipIf(!existsSync(skillSummary))('能读 skill 生成的真实 summary.json', () => {
    const items = parseSummary(JSON.parse(readFileSync(skillSummary, 'utf8')));
    expect(items.length).toBeGreaterThan(3);
  });
});

describe('导入识别', () => {
  it('从 AI 回复里拆出两个代码块并识别', () => {
    const reply = [
      '好的，以下是结果：',
      '```srt', BILINGUAL_SRT, '```',
      '```json', JSON.stringify(SUMMARY), '```',
    ].join('\n');
    const r = importTexts(splitPasted(reply));
    expect(r.errors).toEqual([]);
    expect(r.srt?.cues).toHaveLength(2);
    expect(r.summary).toHaveLength(2);
  });

  it('AI 分几次回复的 SRT 拼成一份', () => {
    const part2 = '3\n00:00:05,000 --> 00:00:06,000\nAnd then.\n然后。\n';
    const r = importTexts(splitPasted(`\`\`\`srt\n${BILINGUAL_SRT}\`\`\`\n继续：\n\`\`\`srt\n${part2}\`\`\``));
    expect(r.srt?.cues).toHaveLength(3);
  });

  it('没有代码块时把整段当成一份内容', () => {
    expect(importTexts(splitPasted(JSON.stringify(SUMMARY))).summary).toHaveLength(2);
    expect(importTexts(splitPasted(BILINGUAL_SRT)).srt?.cues).toHaveLength(2);
  });

  it('包了一层的 {summary: …} 也能识别', () => {
    expect(importTexts([JSON.stringify({ summary: SUMMARY })]).summary).toHaveLength(2);
  });

  it('无法识别的内容给出说明，不影响其他部分', () => {
    const r = importTexts(['随便写的一段话', JSON.stringify(SUMMARY), '{"foo": 1}']);
    expect(r.summary).toHaveLength(2);
    expect(r.errors).toHaveLength(2);
  });
});

describe('提示词', () => {
  const { cues } = parseSrt(BILINGUAL_SRT);
  const englishOnly = cues.map((c) => ({ ...c, trans: undefined }));

  it('没有中文：生成中英双语 SRT + 摘要，只给原文', () => {
    const p = buildPrompt({ title: '陶哲轩访谈', url: 'https://x', cues: englishOnly, lang: 'en' });
    expect(p).toContain('中英双语字幕');
    expect(p).toContain('```srt');
    expect(p).toContain('{"items"');
    expect(p).toContain('00:00:00,160 --> 00:00:02,480\nWhat are we calling this big event that');
  });

  it('已有中文译文：只生成摘要，不翻译', () => {
    const p = buildPrompt({ title: 't', url: 'u', cues, lang: 'en', transLang: 'zh-Hans' });
    expect(p).toContain('不需要翻译');
    expect(p).not.toContain('```srt');
    expect(p).toContain('{"items"');
    expect(p).toContain('我们该怎么称呼这件大事');
  });

  it('原文是中文：只生成摘要', () => {
    const zh = parseSrt('1\n00:00:01,000 --> 00:00:02,000\n大家好\n').cues;
    const p = buildPrompt({ title: 't', url: 'u', cues: zh, lang: 'zh-CN' });
    expect(p).toContain('不需要翻译');
    expect(p).not.toContain('```srt');
  });

  it('判断是否已有中文', () => {
    expect(hasChinese({ cues, lang: 'en', transLang: 'zh' })).toBe(true);
    expect(hasChinese({ cues: englishOnly, lang: 'en', transLang: 'zh' })).toBe(false);
    expect(hasChinese({ cues: englishOnly, lang: 'ai-zh'.replace('ai-', '') })).toBe(true);
    expect(hasChinese({ cues: englishOnly, lang: 'ja' })).toBe(false);
  });
});

describe('笔记导出', () => {
  it('按类型分组，带时间戳链接和批注', () => {
    const notes: Note[] = [
      { id: 'b', start: 75000, text: 'Second', kind: 'phrase', comment: '', createdAt: 2 },
      { id: 'a', start: 3000, text: 'First', trans: '第一', kind: 'idea', comment: '很重要\n第二行', createdAt: 1 },
    ];
    const md = notesToMarkdown('标题', 'https://v', notes, (ms) => `https://v?t=${ms / 1000}`);
    expect(md).toBe(
      [
        '# 标题', '', 'https://v', '',
        '## 想法', '',
        '- [0:03](https://v?t=3) First', '  第一', '  > 很重要', '  > 第二行', '',
        '## 好句', '',
        '- [1:15](https://v?t=75) Second', '',
      ].join('\n'),
    );
  });
});
