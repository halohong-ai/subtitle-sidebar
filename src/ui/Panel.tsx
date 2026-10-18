import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Transcript } from '../core/types';
import { NoCaptionsError, type SiteAdapter } from '../sites/types';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../storage';
import { Toolbar } from './Toolbar';
import { TranscriptTab } from './TranscriptTab';

const MIN_WIDTH = 280;
const MAX_WIDTH = 640;
const MIN_FONT = 11;
const MAX_FONT = 22;

type Status =
  | { kind: 'hidden' }
  | { kind: 'loading' }
  | { kind: 'ready'; transcript: Transcript }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

const cache = new Map<string, Transcript>();

export function Panel({ adapter }: { adapter: SiteAdapter }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<Status>({ kind: 'hidden' });
  const [videoKey, setVideoKey] = useState<string | null>(() => adapter.videoKey());
  const [reloadTick, setReloadTick] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [dark, setDark] = useState(isYoutubeDark);

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

  // 读取字幕
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

  // 全屏时隐藏；跟随 YouTube 的深色模式
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    const obs = new MutationObserver(() => setDark(isYoutubeDark()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      obs.disconnect();
    };
  }, []);

  const getVideo = useCallback(() => adapter.video(), [adapter]);
  const resize = useResize(settings.width, (w) => update({ width: w }));

  if (status.kind === 'hidden' || fullscreen) return null;

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

  const transcript = status.kind === 'ready' ? status.transcript : null;

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
        <div class="title">
          <strong>字幕</strong>
          {transcript && <span class="source" title={transcript.label}>{transcript.label}</span>}
        </div>
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

      {status.kind === 'loading' && <p class="state">正在读取字幕…</p>}
      {status.kind === 'empty' && (
        <p class="state">这个视频没有字幕。</p>
      )}
      {status.kind === 'error' && (
        <div class="state">
          <p>{status.message}</p>
          <button type="button" class="retry" onClick={() => setReloadTick((n) => n + 1)}>
            重试
          </button>
        </div>
      )}
      {transcript && (
        <TranscriptTab
          key={transcript.videoKey}
          cues={transcript.cues}
          mode={settings.langMode}
          fontSize={settings.fontSize}
          getVideo={getVideo}
        />
      )}
    </aside>
  );
}

function isYoutubeDark(): boolean {
  return document.documentElement.hasAttribute('dark');
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 在搜索框里打字时，不让按键冒泡到 YouTube 的快捷键（空格暂停、F 全屏等）。 */
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
