import type { VideoData } from './core/types';

export type LangMode = 'both' | 'orig' | 'trans';

export interface Settings {
  langMode: LangMode;
  fontSize: number;
  width: number;
  collapsed: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  langMode: 'both',
  fontSize: 14,
  width: 380,
  collapsed: false,
};

// 正常运行在扩展里用 chrome.storage（属于扩展自己，清除网站数据不会丢）；
// 直接注入页面调试时退回 localStorage。
const hasChromeStorage = typeof chrome !== 'undefined' && !!chrome.storage?.local;

async function getItem<T>(key: string): Promise<T | undefined> {
  try {
    if (hasChromeStorage) return (await chrome.storage.local.get(key))[key] as T | undefined;
    const raw = localStorage.getItem(`subtitle-sidebar:${key}`);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

async function setItem(key: string, value: unknown): Promise<void> {
  try {
    if (hasChromeStorage) await chrome.storage.local.set({ [key]: value });
    else localStorage.setItem(`subtitle-sidebar:${key}`, JSON.stringify(value));
  } catch {
    // 存不了就只在本次页面生效
  }
}

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await getItem<Partial<Settings>>('settings')) };
}

export function saveSettings(settings: Settings): Promise<void> {
  return setItem('settings', settings);
}

export async function loadVideoData(videoKey: string): Promise<VideoData> {
  // 只取认识的字段（旧版本存过的导图数据等会被丢掉）
  const { transcript, summary, notes } = (await getItem<Partial<VideoData>>(`video:${videoKey}`)) ?? {};
  return { transcript, summary, notes: notes ?? [] };
}

export function saveVideoData(videoKey: string, data: VideoData): Promise<void> {
  return setItem(`video:${videoKey}`, data);
}

/** 记下某个文件名（日期时间）是为哪个视频生成的。同一分钟可能复制过多个视频，所以存列表。 */
export async function rememberPromptTag(tag: string, videoKey: string): Promise<void> {
  const keys = (await getItem<string[]>(`tag:${tag}`)) ?? [];
  if (!keys.includes(videoKey)) await setItem(`tag:${tag}`, [...keys, videoKey]);
}

/** 这个文件名是为哪些视频生成的；没记录时为空数组。 */
export async function videoKeysForTag(tag: string): Promise<string[]> {
  return (await getItem<string[]>(`tag:${tag}`)) ?? [];
}
