import { useState } from 'preact/hooks';

interface Props {
  hasTranscript: boolean;
  /** 有译文时显示「导出双语」和「导出原文」两项；这里是原文语言名，如「英文」 */
  origName?: string;
  imported: boolean;
  onImport: () => void;
  onExportSrt: () => void;
  onExportOrig: () => void;
  onExportTxt: () => void;
  onCopyPrompt: () => void;
  onRestoreSite: () => void;
}

export function Menu(props: Props) {
  const [open, setOpen] = useState(false);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div class="menu">
      <button
        type="button"
        class="icon"
        title="更多操作"
        aria-label="更多操作"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <>
          <div class="menu-backdrop" onClick={() => setOpen(false)} />
          <div class="menu-list" role="menu">
            <button type="button" role="menuitem" onClick={run(props.onImport)}>
              导入字幕 / 摘要…
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!props.hasTranscript}
              onClick={run(props.onCopyPrompt)}
            >
              复制 AI 提示词
            </button>
            <hr />
            <button
              type="button"
              role="menuitem"
              disabled={!props.hasTranscript}
              onClick={run(props.onExportSrt)}
            >
              {props.origName ? '导出双语字幕（SRT）' : '导出字幕（SRT）'}
            </button>
            {props.origName && (
              <button
                type="button"
                role="menuitem"
                title="只含原文，不含译文。对机翻不满意时，可以拿去自己翻译"
                onClick={run(props.onExportOrig)}
              >
                导出{props.origName}字幕（SRT）
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              disabled={!props.hasTranscript}
              onClick={run(props.onExportTxt)}
            >
              导出文本（TXT）
            </button>
            {props.imported && (
              <>
                <hr />
                <button type="button" role="menuitem" onClick={run(props.onRestoreSite)}>
                  恢复为网站字幕
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
