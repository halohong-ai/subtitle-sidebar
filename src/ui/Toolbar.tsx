import type { LangMode } from '../storage';

const LANG_NAMES: Record<string, string> = {
  en: '英', zh: '中', ja: '日', ko: '韩', fr: '法', de: '德', es: '西', ru: '俄',
};

export function langShort(lang: string | undefined): string {
  if (!lang) return '';
  const base = lang.toLowerCase().split('-')[0];
  return LANG_NAMES[base] ?? base.toUpperCase();
}

interface Props {
  lang: string;
  transLang?: string;
  mode: LangMode;
  onMode: (m: LangMode) => void;
  /** 调整字号：+1 放大，-1 缩小 */
  onFontStep: (delta: number) => void;
}

export function Toolbar({ lang, transLang, mode, onMode, onFontStep }: Props) {
  const modes: Array<[LangMode, string]> = [
    ['both', '双语'],
    ['orig', langShort(lang)],
    ['trans', langShort(transLang)],
  ];
  return (
    <div class="toolbar">
      {transLang && (
        <div class="segmented" role="group" aria-label="字幕语言">
          {modes.map(([m, label]) => (
            <button
              key={m}
              type="button"
              class={mode === m ? 'on' : ''}
              aria-pressed={mode === m}
              onClick={() => onMode(m)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div class="font-size" role="group" aria-label="字号">
        <button type="button" title="缩小字号" onClick={() => onFontStep(-1)}>
          A−
        </button>
        <button type="button" title="放大字号" onClick={() => onFontStep(1)}>
          A+
        </button>
      </div>
    </div>
  );
}
