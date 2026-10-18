import { describe, expect, it } from 'vitest';
import {
  chooseBiliTracks,
  normalizeSubtitleUrl,
  parseBiliSubtitle,
  subtitleMatchesDuration,
} from '../src/sites/bilibili-tracks';

const t = (lan: string, ai_type?: number) => ({
  lan,
  lan_doc: lan,
  subtitle_url: `//aisubtitle.hdslb.com/${lan}.json`,
  ...(ai_type === undefined ? {} : { ai_type }),
});

describe('chooseBiliTracks', () => {
  it('中文视频只有 AI 中文：只有原文', () => {
    const plan = chooseBiliTracks([t('ai-zh', 0)])!;
    expect(plan.primary.lan).toBe('ai-zh');
    expect(plan.secondary).toBeUndefined();
  });

  it('同语言人工字幕优先于 AI 字幕', () => {
    const plan = chooseBiliTracks([t('ai-zh', 0), t('zh-CN')])!;
    expect(plan.primary.lan).toBe('zh-CN');
  });

  it('英文搬运视频：AI 识别英文为原文，中文为译文', () => {
    const plan = chooseBiliTracks([t('ai-zh', 1), t('ai-en', 0)])!;
    expect(plan.primary.lan).toBe('ai-en');
    expect(plan.secondary?.lan).toBe('ai-zh');
  });

  it('译文也优先人工字幕', () => {
    const plan = chooseBiliTracks([t('ai-en', 0), t('ai-zh', 1), t('zh-Hans')])!;
    expect(plan.secondary?.lan).toBe('zh-Hans');
  });

  it('只有人工字幕时以第一条为原文', () => {
    const plan = chooseBiliTracks([t('zh-CN'), t('en-US')])!;
    expect(plan.primary.lan).toBe('zh-CN');
    expect(plan.secondary?.lan).toBe('en-US');
  });

  it('没有字幕返回 null', () => {
    expect(chooseBiliTracks([])).toBeNull();
  });
});

describe('parseBiliSubtitle', () => {
  it('秒转毫秒，去掉空行并排序', () => {
    const frags = parseBiliSubtitle({
      body: [
        { from: 2.5, to: 4.1, content: '第二句' },
        { from: 0.12, to: 2.5, content: ' 第一句\n ' },
        { from: 5, to: 6, content: '  ' },
      ],
    });
    expect(frags).toEqual([
      { start: 120, end: 2500, text: '第一句' },
      { start: 2500, end: 4100, text: '第二句' },
    ]);
  });

  it('没有 body 返回空数组', () => {
    expect(parseBiliSubtitle({})).toEqual([]);
  });
});

describe('subtitleMatchesDuration', () => {
  const frags = (endSec: number) => [{ start: 0, end: endSec * 1000, text: 'x' }];

  it('字幕覆盖视频大部分时长：匹配', () => {
    expect(subtitleMatchesDuration(frags(590), 600)).toBe(true);
  });

  it('字幕明显超出视频时长：不匹配', () => {
    expect(subtitleMatchesDuration(frags(1200), 600)).toBe(false);
  });

  it('长视频的字幕只覆盖开头一小段：不匹配', () => {
    expect(subtitleMatchesDuration(frags(60), 3600)).toBe(false);
  });

  it('时长未知时不判断', () => {
    expect(subtitleMatchesDuration(frags(99999), 0)).toBe(true);
  });
});

describe('normalizeSubtitleUrl', () => {
  it('补全协议', () => {
    expect(normalizeSubtitleUrl('//a.com/x.json')).toBe('https://a.com/x.json');
    expect(normalizeSubtitleUrl('http://a.com/x.json')).toBe('https://a.com/x.json');
    expect(normalizeSubtitleUrl('https://a.com/x.json')).toBe('https://a.com/x.json');
  });
});
