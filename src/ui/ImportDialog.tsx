import { useRef, useState } from 'preact/hooks';
import { importTexts, splitPasted, type ImportResult } from '../core/importer';
import { tagFromFilename } from '../core/prompt';
import { videoKeysForTag } from '../storage';
import { readFile } from './files';

interface Props {
  /** 当前视频，用来拦下为别的视频生成的文件 */
  videoKey: string;
  durationMs: number;
  /** 应用导入结果，返回给用户看的结果说明 */
  onApply: (result: ImportResult) => string;
  onClose: () => void;
}

/** 导入：选 AI 返回的文件（摘要 JSON / 双语 SRT），或粘贴 AI 的回复。 */
export function ImportDialog({ videoKey, durationMs, onApply, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  const submit = async () => {
    setBusy(true);
    try {
      const skipped: string[] = [];
      const ours: File[] = [];
      for (const f of files) {
        const tag = tagFromFilename(f.name);
        const owners = tag ? await videoKeysForTag(tag) : [];
        if (owners.length && !owners.includes(videoKey)) {
          skipped.push(`「${f.name}」是为另一个视频生成的文件，已跳过`);
        } else {
          ours.push(f);
        }
      }
      const chunks = await Promise.all(ours.map(readFile));
      if (pasted.trim()) chunks.push(...splitPasted(pasted));
      const result = importTexts(chunks, durationMs);
      const done = chunks.length ? onApply(result) : '';
      const problems = [...skipped, ...result.errors];
      if (done && problems.length === 0) {
        onClose();
        return;
      }
      setMessages([done || '没有导入任何内容', ...problems]);
    } catch (e) {
      setMessages([`读取失败：${String(e)}`]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="dialog" role="dialog" aria-label="导入">
        <h3>导入</h3>
        <p class="hint">选择 AI 返回的摘要文件（….json）；用了「中字校准」时，再选中文字幕文件（….srt）。</p>
        <div class="file-row">
          <button type="button" onClick={() => fileRef.current?.click()}>
            选择文件…
          </button>
          <span class="file-names">
            {files.length ? files.map((f) => f.name).join('、') : '未选择文件'}
          </span>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".srt,.json,.txt,.md"
            hidden
            onChange={(e) => setFiles(Array.from(e.currentTarget.files ?? []))}
          />
        </div>
        <p class="hint paste-hint">如果 AI 没有生成文件，而是直接回复了文字，把回复粘贴到这里：</p>
        <textarea
          rows={5}
          placeholder="粘贴 AI 的回复…"
          value={pasted}
          onInput={(e) => setPasted(e.currentTarget.value)}
        />
        {messages.length > 0 && (
          <ul class="messages">
            {messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        <div class="dialog-actions">
          <button type="button" onClick={onClose}>
            {messages.length ? '关闭' : '取消'}
          </button>
          <button
            type="button"
            class="primary"
            disabled={busy || (!pasted.trim() && files.length === 0)}
            onClick={submit}
          >
            {busy ? '导入中…' : '导入'}
          </button>
        </div>
      </div>
    </div>
  );
}
