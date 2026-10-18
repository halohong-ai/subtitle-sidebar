import { useState } from 'preact/hooks';

interface Props {
  hasTranscript: boolean;
  imported: boolean;
  onImport: () => void;
  onCopySummary: () => void;
  onCopyCalibrate: () => void;
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
            <button
              type="button"
              role="menuitem"
              disabled={!props.hasTranscript}
              onClick={run(props.onCopySummary)}
            >
              复制AI提示词：仅生成摘要
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!props.hasTranscript}
              title="摘要依据原文生成；AI 同时重新翻译中文字幕，导入后与原文合成双语"
              onClick={run(props.onCopyCalibrate)}
            >
              复制AI提示词：摘要+中字校准
            </button>
            <button type="button" role="menuitem" onClick={run(props.onImport)}>
              导入摘要/字幕
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
