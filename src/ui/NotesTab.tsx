import { formatClock } from '../core/time';
import type { Note, NoteKind } from '../core/types';
import { seek } from '../content/sync';

interface Props {
  notes: Note[];
  getVideo: () => HTMLVideoElement | null;
  onChange: (notes: Note[]) => void;
  onExport: () => void;
}

const KIND_LABEL: Record<NoteKind, string> = { idea: '想法', phrase: '好句' };

/** 收藏的句子：可切换「想法 / 好句」，写批注，导出 Markdown。 */
export function NotesTab({ notes, getVideo, onChange, onExport }: Props) {
  if (notes.length === 0) {
    return (
      <div class="empty">
        <p>还没有笔记。</p>
        <p>在「字幕」或「摘要」里，把鼠标移到句子或话题上，点右侧的 ☆ 收藏。收藏的内容会出现在这里，可以写批注、导出 Markdown。</p>
      </div>
    );
  }

  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const patch = (id: string, p: Partial<Note>) =>
    onChange(notes.map((n) => (n.id === id ? { ...n, ...p } : n)));

  return (
    <div class="notes">
      <div class="notes-bar">
        <span>{notes.length} 条笔记</span>
        <button type="button" class="primary" onClick={onExport}>
          导出 Markdown
        </button>
      </div>
      <div class="list">
        {sorted.map((n) => (
          <div class="note" key={n.id}>
            <div class="note-head">
              <button
                type="button"
                class="time link"
                title="跳到这一句"
                onClick={() => {
                  const video = getVideo();
                  if (video) seek(video, n.start);
                }}
              >
                {formatClock(n.start)}
              </button>
              {n.source === 'summary' && <span class="chip summary">摘要</span>}
              <button
                type="button"
                class={`chip ${n.kind}`}
                title="切换类型"
                onClick={() => patch(n.id, { kind: n.kind === 'idea' ? 'phrase' : 'idea' })}
              >
                {KIND_LABEL[n.kind]}
              </button>
              <button
                type="button"
                class="icon"
                title="删除"
                aria-label="删除这条笔记"
                onClick={() => onChange(notes.filter((x) => x.id !== n.id))}
              >
                ×
              </button>
            </div>
            {n.title && <p class="note-title">{n.title}</p>}
            <p class="orig">{n.text}</p>
            {n.trans && <p class="trans">{n.trans}</p>}
            <textarea
              rows={2}
              placeholder="写点批注…"
              value={n.comment}
              onInput={(e) => patch(n.id, { comment: e.currentTarget.value })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
