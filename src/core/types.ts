// 所有时间都是毫秒整数。

/** 网站字幕里的一个原始片段：一行字幕，或自动字幕里的一个词。 */
export interface Fragment {
  start: number;
  end: number;
  text: string;
}

/** 一条字幕轨道解析后的结果。 */
export interface SourceTrack {
  /** 语言代码，如 en、zh-Hans */
  lang: string;
  /** 给用户看的说明，如「英语（自动生成）」 */
  label: string;
  /** 是否为语音识别的自动字幕（逐词、通常无标点） */
  asr: boolean;
  fragments: Fragment[];
}

/** 浮窗里的一句字幕。 */
export interface Cue {
  id: number;
  start: number;
  end: number;
  /** 原文（视频说话的语言） */
  text: string;
  /** 译文；没有第二条轨道时为空 */
  trans?: string;
}

export interface Transcript {
  /** yt:<videoId> */
  videoKey: string;
  source: 'site' | 'import' | 'ai';
  lang: string;
  transLang?: string;
  /** 浮窗顶部显示的来源说明 */
  label: string;
  cues: Cue[];
}

/** 摘要：与 bilingual-srt-translator skill 的 summary.json 对应，start 已换算成毫秒。 */
export interface SummaryItem {
  start: number;
  title: string;
  summary: string;
}

export type NoteKind = 'idea' | 'phrase';

/** 笔记按句子的开始时间对应字幕（换了字幕来源也能对上），不依赖句子 id。 */
export interface Note {
  id: string;
  start: number;
  text: string;
  trans?: string;
  kind: NoteKind;
  comment: string;
  createdAt: number;
}

/** 每个视频单独保存的数据 */
export interface VideoData {
  /** 导入的字幕；存在时代替网站字幕 */
  transcript?: Transcript;
  summary?: SummaryItem[];
  notes: Note[];
}
