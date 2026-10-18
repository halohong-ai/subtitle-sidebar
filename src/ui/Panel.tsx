import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { ImportResult } from '../core/importer';
import { notesToMarkdown } from '../core/markdown';
import { mergeCues } from '../core/normalize';
import { buildPrompt } from '../core/prompt';
import type { Cue, Note, SummaryItem, Transcript, VideoData } from '../core/types';
import { NoCaptionsError, type SiteAdapter } from '../sites/types';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  loadVideoData,
  saveSettings,
  saveVideoData,
  type Settings,
} from '../storage';
import { copyText, downloadText, safeFilename } from './files';
import { ImportDialog } from './ImportDialog';
import { Menu } from './Menu';
import { NotesTab } from './NotesTab';
import { SummaryTab } from './SummaryTab';
import { Toolbar } from './Toolbar';
import { TranscriptTab } from './TranscriptTab';

const MIN_WIDTH = 280;
const MAX_WIDTH = 640;
const MIN_FONT = 11;
const MAX_FONT = 22;
const LONG_PROMPT_CHARS = 100_000;

type Status =
  | { kind: 'hidden' }
  | { kind: 'loading' }
  | { kind: 'ready'; transcript: Transcript }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

type Tab = 'transcript' | 'summary' | 'notes';

const TABS: Array<[Tab, string]> = [
  ['transcript', '字幕'],
  ['summary', '摘要'],
  ['notes', '笔记'],
];

const cache = new Map<string, Transcript>();

export function Panel({ adapter }: { adapter: SiteAdapter }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<Status>({ kind: 'hidden' });
  const [videoKey, setVideoKey] = useState<string | null>(() => adapter.videoKey());
  const [reloadTick, setReloadTick] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [dark, setDark] = useState(() => adapter.isDark());
  const [tab, setTab] = useState<Tab>('transcript');
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // 站内跳转
  useEffect(() => adapter.onNavigate(() => setVideoKey(adapter.videoKey())), [adapter]);

  // 读取网站字幕
  useEffect(() => {
    if (!videoKey) {
      setStatus({ kind: 'hidden' });
      return;
    }
    const cached = cache.get(videoKey);
    if (cached) {
      setStatus({ kind: 'ready', transcript: cached });
      return;
    }
    const ctrl = new AbortController();
    setStatus({ kind: 'loading' });
    adapter.load(videoKey, ctrl.signal).then(
      (t) => {
        if (ctrl.signal.aborted) return;
        cache.set(videoKey, t);
        setStatus({ kind: 'ready', transcript: t });
      },
      (err: unknown) => {
        if (ctrl.signal.aborted) return;
        if (err instanceof NoCaptionsError) setStatus({ kind: 'empty' });
        else setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => ctrl.abort();
  }, [adapter, videoKey, reloadTick]);

  const { data, updateData } = useVideoData(videoKey);

  // 全屏时隐藏；跟随网站的深色模式
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    const obs = new MutationObserver(() => setDark(adapter.isDark()));
    const opts = { attributes: true, attributeFilter: ['dark', 'class', 'style'] };
    obs.observe(document.documentElement, opts);
    if (document.body) obs.observe(document.body, opts);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      obs.disconnect();
    };
  }, [adapter]);

  // 提示条几秒后自动消失
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const getVideo = useCallback(() => adapter.video(), [adapter]);
  const resize = useResize(settings.width, (w) => update({ width: w }));

  // 导入的字幕优先于网站字幕
  const siteTranscript = status.kind === 'ready' ? status.transcript : null;
  const transcript = data?.transcript ?? siteTranscript;
  const notes = data?.notes ?? [];

  /** 收藏 / 取消收藏一条字幕或摘要 */
  const toggleNote = useCallback(
    (source: 'cue' | 'summary', fields: Pick<Note, 'start' | 'text' | 'trans' | 'title'>) =>
      updateData((d) => {
        const same = (n: Note) => (n.source ?? 'cue') === source && n.start === fields.start;
        const next: Note[] = d.notes.some(same)
          ? d.notes.filter((n) => !same(n))
          : [
              ...d.notes,
              {
                id: `n_${source}_${fields.start}_${Date.now().toString(36)}`,
                source,
                ...fields,
                kind: 'idea',
                comment: '',
                createdAt: Date.now(),
              },
            ];
        return { ...d, notes: next };
      }),
    [updateData],
  );
  const onToggleNote = useCallback(
    (cue: Cue) => toggleNote('cue', { start: cue.start, text: cue.text, trans: cue.trans }),
    [toggleNote],
  );
  const onToggleSummaryNote = useCallback(
    (item: SummaryItem) =>
      toggleNote('summary', { start: item.start, title: item.title, text: item.summary }),
    [toggleNote],
  );

  if (status.kind === 'hidden' || fullscreen || !videoKey) return null;

  const theme = dark ? 'dark' : 'light';

  if (settings.collapsed) {
    return (
      <button
        type="button"
        class="launcher"
        data-theme={theme}
        title="展开字幕浮窗"
        onClick={() => update({ collapsed: false })}
      >
        字幕
      </button>
    );
  }

  const filename = safeFilename(adapter.title());

  const actions = {
    copyPrompt: async () => {
      if (!transcript) return;
      const prompt = buildPrompt({
        title: adapter.title(),
        url: adapter.timeUrl(videoKey, 0),
        cues: transcript.cues,
        lang: transcript.lang,
        transLang: transcript.transLang,
      });
      try {
        await copyText(prompt);
        setToast(
          '已复制。粘贴到 ChatGPT、DeepSeek、Kimi、Claude 等 AI，等它回复完，把整段回复复制下来，点 ⋯ → 导入 → 粘贴。' +
            (prompt.length > LONG_PROMPT_CHARS ? ' 字幕较长，AI 可能要分几次回复，全部复制后一起粘贴即可。' : ''),
        );
      } catch {
        setToast('复制失败，请再点一次');
      }
    },
    restoreSite: () => {
      updateData((d) => ({ ...d, transcript: undefined }));
      setToast('已恢复为网站字幕');
    },
  };

  const applyImport = (result: ImportResult): string => {
    const parts: string[] = [];
    updateData((d) => {
      const next = { ...d };
      if (result.srt) {
        const zh = result.srt.origIsCjk;
        next.transcript = {
          videoKey,
          source: 'import',
          lang: zh ? 'zh' : 'en',
          transLang: result.srt.hasTrans ? (zh ? 'en' : 'zh') : undefined,
          label: '导入的字幕',
          cues: mergeCues(result.srt.cues),
        };
      }
      if (result.summary) next.summary = result.summary;
      return next;
    });
    if (result.srt) parts.push(`字幕 ${result.srt.cues.length} 句`);
    if (result.summary) parts.push(`摘要 ${result.summary.length} 项`);
    if (result.summary) setTab('summary');
    else if (result.srt) setTab('transcript');
    return parts.length ? `已导入：${parts.join('、')}` : '';
  };

  return (
    <aside
      class="panel"
      data-theme={theme}
      style={{ width: `${resize.width}px` }}
      onKeyDown={stopIfTyping}
      onKeyUp={stopIfTyping}
      onKeyPress={stopIfTyping}
    >
      <div class="resize" onPointerDown={resize.onPointerDown} title="拖动调整宽度" />
      <header>
        <nav class="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              class={tab === id ? 'on' : ''}
              onClick={() => setTab(id)}
            >
              {label}
              {id === 'notes' && notes.length > 0 && <span class="badge">{notes.length}</span>}
            </button>
          ))}
        </nav>
        <Menu
          hasTranscript={!!transcript}
          imported={!!data?.transcript}
          onImport={() => setImporting(true)}
          onCopyPrompt={actions.copyPrompt}
          onRestoreSite={actions.restoreSite}
        />
        <button
          type="button"
          class="icon"
          title="收起"
          aria-label="收起字幕浮窗"
          onClick={() => update({ collapsed: true })}
        >
          ⟩
        </button>
      </header>

      {transcript && tab === 'transcript' && (
        <p class="source" title={transcript.label}>
          {transcript.label}
        </p>
      )}

      {toast && (
        <div class="toast" role="status">
          <span>{toast}</span>
          <button type="button" class="icon" aria-label="关闭提示" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}

      {tab === 'transcript' && (
        <>
          {transcript && (
            <Toolbar
              lang={transcript.lang}
              transLang={transcript.transLang}
              mode={settings.langMode}
              fontSize={settings.fontSize}
              onMode={(m) => update({ langMode: m })}
              onFontSize={(n) => update({ fontSize: clamp(n, MIN_FONT, MAX_FONT) })}
            />
          )}
          {!transcript && status.kind === 'loading' && <p class="state">正在读取字幕…</p>}
          {!transcript && status.kind === 'empty' && (
            <p class="state">这个视频没有字幕。可以点 ⋯ → 导入，导入 SRT 字幕文件。</p>
          )}
          {!transcript && status.kind === 'error' && (
            <div class="state">
              <p>{status.message}</p>
              <button type="button" class="retry" onClick={() => setReloadTick((n) => n + 1)}>
                重试
              </button>
            </div>
          )}
          {transcript && (
            <TranscriptTab
              key={`${transcript.videoKey}:${transcript.source}`}
              cues={transcript.cues}
              mode={settings.langMode}
              fontSize={settings.fontSize}
              getVideo={getVideo}
              notedStarts={startsOf(notes, 'cue')}
              onToggleNote={onToggleNote}
            />
          )}
        </>
      )}

      {tab === 'summary' && (
        <SummaryTab
          key={videoKey}
          items={data?.summary}
          getVideo={getVideo}
          notedStarts={startsOf(notes, 'summary')}
          onToggleNote={onToggleSummaryNote}
        />
      )}

      {tab === 'notes' && (
        <NotesTab
          notes={notes}
          getVideo={getVideo}
          onChange={(next) => updateData((d) => ({ ...d, notes: next }))}
          onExport={() =>
            downloadText(
              `${filename}_notes.md`,
              notesToMarkdown(adapter.title(), adapter.timeUrl(videoKey, 0), notes, (ms) =>
                adapter.timeUrl(videoKey, ms),
              ),
              'text/markdown',
            )
          }
        />
      )}

      {importing && (
        <ImportDialog
          durationMs={(getVideo()?.duration || 0) * 1000}
          onApply={applyImport}
          onClose={() => setImporting(false)}
        />
      )}
    </aside>
  );
}

/**
 * 当前视频的导入数据和笔记：切换视频时读取，修改后稍等片刻再保存（连续打字只存一次）。
 * 离开页面或切换视频时，立刻保存还没存的修改，避免丢失。
 */
function useVideoData(videoKey: string | null) {
  const [data, setData] = useState<VideoData | null>(null);
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; data: VideoData }>());

  const flush = useCallback((key?: string) => {
    for (const [k, p] of pending.current) {
      if (key && k !== key) continue;
      clearTimeout(p.timer);
      pending.current.delete(k);
      saveVideoData(k, p.data);
    }
  }, []);

  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [flush]);

  useEffect(() => {
    setData(null);
    if (!videoKey) return;
    let live = true;
    loadVideoData(videoKey).then((d) => live && setData(d));
    return () => {
      live = false;
      flush(videoKey);
    };
  }, [videoKey, flush]);

  const updateData = useCallback(
    (fn: (d: VideoData) => VideoData) => {
      if (!videoKey) return;
      setData((prev) => {
        const next = fn(prev ?? { notes: [] });
        clearTimeout(pending.current.get(videoKey)?.timer);
        pending.current.set(videoKey, {
          data: next,
          timer: setTimeout(() => flush(videoKey), 300),
        });
        return next;
      });
    },
    [videoKey, flush],
  );

  return { data, updateData };
}

function startsOf(notes: Note[], source: 'cue' | 'summary'): Set<number> {
  return new Set(notes.filter((n) => (n.source ?? 'cue') === source).map((n) => n.start));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 在输入框里打字时，不让按键冒泡到网站的快捷键（空格暂停、F 全屏等）。 */
function stopIfTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) e.stopPropagation();
}

/** 拖动浮窗左边缘调整宽度，松手时保存。 */
function useResize(saved: number, onDone: (w: number) => void) {
  const [width, setWidth] = useState(saved);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setWidth(saved);
  }, [saved]);

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let w = width;
    const move = (ev: PointerEvent) => {
      w = clamp(window.innerWidth - ev.clientX - 12, MIN_WIDTH, MAX_WIDTH);
      setWidth(w);
    };
    const up = () => {
      dragging.current = false;
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      onDone(w);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  return { width, onPointerDown };
}
