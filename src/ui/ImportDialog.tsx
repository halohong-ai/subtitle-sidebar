import { useRef, useState } from 'preact/hooks';
import { importTexts, splitPasted, type ImportResult } from '../core/importer';
import { readFile } from './files';

interface Props {
  durationMs: number;
  /** 应用导入结果，返回给用户看的结果说明 */
  onApply: (result: ImportResult, image: string | null) => string;
  onClose: () => void;
}

/** 导入：选文件（SRT / JSON / 导图图片），或直接粘贴 AI 的整段回复。 */
export function ImportDialog({ durationMs, onApply, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  const submit = async () => {
    setBusy(true);
    try {
      const read = await Promise.all(files.map(readFile));
      const image = read.find((f) => f.isImage)?.content ?? null;
      const chunks = read.filter((f) => !f.isImage).map((f) => f.content);
      if (pasted.trim()) chunks.push(...splitPasted(pasted));
      const result = importTexts(chunks, durationMs);
      const done = onApply(result, image);
      if (done && result.errors.length === 0) {
        onClose();
        return;
      }
      setMessages([done || '没有识别到可导入的内容', ...result.errors]);
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
        <p class="hint">
          把 AI 的整段回复粘贴到下面，会自动识别其中的双语字幕、摘要和导图；也可以选择文件（.srt、.json，或导图图片）。
        </p>
        <textarea
          rows={7}
          placeholder="在这里粘贴 AI 的回复…"
          value={pasted}
          onInput={(e) => setPasted(e.currentTarget.value)}
        />
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
            accept=".srt,.json,.txt,.md,image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => setFiles(Array.from(e.currentTarget.files ?? []))}
          />
        </div>
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
