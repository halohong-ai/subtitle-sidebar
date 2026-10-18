import { useState } from 'preact/hooks';

interface Props {
  hasTranscript: boolean;
  imported: boolean;
  onImport: () => void;
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
            <button
              type="button"
              role="menuitem"
              disabled={!props.hasTranscript}
              onClick={run(props.onCopyPrompt)}
            >
              复制 AI 提示词
            </button>
            <button type="button" role="menuitem" onClick={run(props.onImport)}>
              导入字幕 / 摘要…
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
