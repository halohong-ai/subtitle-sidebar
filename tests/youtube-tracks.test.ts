import { describe, expect, it } from 'vitest';
import { chooseTracks, trackUrl } from '../src/sites/youtube-tracks';

const t = (languageCode: string, kind?: string, name = languageCode) => ({
  baseUrl: `https://www.youtube.com/api/timedtext?v=abc&lang=${languageCode}${kind ? `&kind=${kind}` : ''}&expire=1&signature=s`,
  languageCode,
  kind,
  name,
});

describe('chooseTracks', () => {
  it('只有英文自动字幕：原文用它，译文用 YouTube 机翻中文', () => {
    const asr = t('en', 'asr');
    const plan = chooseTracks([asr])!;
    expect(plan.primary.track).toBe(asr);
    expect(plan.secondary).toMatchObject({ track: asr, tlang: 'zh-Hans' });
  });

  it('有人工英文字幕时优先于自动字幕', () => {
    const asr = t('en', 'asr');
    const manual = t('en');
    expect(chooseTracks([asr, manual])!.primary.track).toBe(manual);
  });

  it('有人工中文轨道时直接用，简体优先', () => {
    const plan = chooseTracks([t('en', 'asr'), t('zh-Hant'), t('zh-Hans')])!;
    expect(plan.secondary?.track.languageCode).toBe('zh-Hans');
    expect(plan.secondary?.tlang).toBeUndefined();
  });

  it('中文视频：原文中文，译文英文', () => {
    const plan = chooseTracks([t('zh-CN', 'asr'), t('zh-CN')])!;
    expect(plan.primary.track.languageCode).toBe('zh-CN');
    expect(plan.primary.track.kind).toBeUndefined();
    expect(plan.secondary?.tlang).toBe('en');
  });

  it('多音轨视频：有英文自动字幕时不选排在前面的阿拉伯语配音字幕', () => {
    const plan = chooseTracks([t('ar', 'asr'), t('en', 'asr')])!;
    expect(plan.primary.track.languageCode).toBe('en');
    expect(plan.secondary?.tlang).toBe('zh-Hans');
  });

  it('只有阿拉伯语自动字幕、另有人工英文字幕：视为阿拉伯语原声，英文是翻译', () => {
    const plan = chooseTracks([t('ar', 'asr'), t('en')])!;
    expect(plan.primary.track.languageCode).toBe('ar');
  });

  it('没有轨道返回 null', () => {
    expect(chooseTracks([])).toBeNull();
  });
});

describe('trackUrl', () => {
  const choice = { track: t('en', 'asr'), label: 'x' };

  it('没有捕获地址时只加 fmt=json3', () => {
    const u = new URL(trackUrl(choice, null));
    expect(u.searchParams.get('fmt')).toBe('json3');
    expect(u.searchParams.get('pot')).toBeNull();
  });

  it('从捕获地址补上 PO Token，但不覆盖轨道参数和签名', () => {
    const captured =
      'https://www.youtube.com/api/timedtext?v=abc&lang=de&kind=asr&tlang=fr&fmt=srv3&pot=TOKEN&c=WEB&signature=other';
    const u = new URL(trackUrl({ ...choice, tlang: 'zh-Hans' }, captured));
    expect(u.searchParams.get('pot')).toBe('TOKEN');
    expect(u.searchParams.get('c')).toBe('WEB');
    expect(u.searchParams.get('lang')).toBe('en');
    expect(u.searchParams.get('signature')).toBe('s');
    expect(u.searchParams.get('tlang')).toBe('zh-Hans');
    expect(u.searchParams.get('fmt')).toBe('json3');
  });
});
