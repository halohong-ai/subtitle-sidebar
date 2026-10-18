// 识别导入的内容：文件，或从 AI 回复里整段粘贴的文字。
// 粘贴时，AI 通常把 SRT 和 JSON 放在 ``` 代码块里；没有代码块就把整段当成一份内容。

import { parseSrt, type ParsedSrt } from './srt';
import { FormatError, parseMindmap, parseSummary } from './summary';
import type { Mindmap, SummaryItem } from './types';

export interface ImportResult {
  srt?: ParsedSrt;
  summary?: SummaryItem[];
  mindmap?: Mindmap;
  /** 无法识别或格式不对的说明，给用户看 */
  errors: string[];
}

/** 从粘贴的文字里拆出各段内容。 */
export function splitPasted(text: string): string[] {
  const blocks = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1].trim());
  return blocks.length ? blocks : [text.trim()];
}

/**
 * 识别若干段文字。多段 SRT（AI 分几次回复）会拼成一份；
 * JSON 可以是 summary.json、导图 spec，或 {summary, mindmap} 合在一起。
 */
export function importTexts(chunks: string[], durationMs = 0): ImportResult {
  const result: ImportResult = { errors: [] };
  const srtParts: string[] = [];

  for (const chunk of chunks.map((c) => c.trim()).filter(Boolean)) {
    const json = tryJson(chunk);
    if (json !== undefined) {
      readJson(json, durationMs, result);
    } else if (chunk.includes('-->')) {
      srtParts.push(chunk);
    } else {
      result.errors.push(`有一段内容既不是 SRT 也不是 JSON，已跳过：「${chunk.slice(0, 30)}…」`);
    }
  }

  if (srtParts.length) {
    const srt = parseSrt(srtParts.join('\n\n'));
    if (srt.cues.length) result.srt = srt;
    else result.errors.push('SRT 里没有读到有效的字幕');
  }
  return result;
}

function readJson(json: unknown, durationMs: number, result: ImportResult): void {
  const obj = json as Record<string, unknown> | null;
  const tryRead = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      result.errors.push(e instanceof FormatError ? e.message : `JSON 内容有误：${String(e)}`);
    }
  };

  if (obj && 'items' in obj) {
    tryRead(() => (result.summary = parseSummary(obj, durationMs)));
  } else if (obj && 'branches' in obj) {
    tryRead(() => (result.mindmap = parseMindmap(obj)));
  } else if (obj && ('summary' in obj || 'mindmap' in obj)) {
    if (obj.summary) {
      const s = Array.isArray(obj.summary) ? { items: obj.summary } : obj.summary;
      tryRead(() => (result.summary = parseSummary(s, durationMs)));
    }
    if (obj.mindmap) tryRead(() => (result.mindmap = parseMindmap(obj.mindmap)));
  } else {
    result.errors.push('JSON 既不是摘要（需要 items）也不是导图（需要 branches），已跳过');
  }
}

function tryJson(text: string): unknown {
  if (!/^[[{]/.test(text)) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
