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

const KEY = 'settings';

// 正常运行在扩展里用 chrome.storage；直接注入页面调试时退回 localStorage。
const hasChromeStorage = typeof chrome !== 'undefined' && !!chrome.storage?.local;

export async function loadSettings(): Promise<Settings> {
  try {
    if (hasChromeStorage) {
      const got = await chrome.storage.local.get(KEY);
      return { ...DEFAULT_SETTINGS, ...(got[KEY] as Partial<Settings> | undefined) };
    }
    const raw = localStorage.getItem(`subtitle-sidebar:${KEY}`);
    return { ...DEFAULT_SETTINGS, ...(raw ? (JSON.parse(raw) as Partial<Settings>) : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    if (hasChromeStorage) await chrome.storage.local.set({ [KEY]: settings });
    else localStorage.setItem(`subtitle-sidebar:${KEY}`, JSON.stringify(settings));
  } catch {
    // 存不了就只在本次页面生效
  }
}
