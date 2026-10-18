// 下载、复制、读文件等浏览器操作。

/** 去掉文件名里不能用的字符，并限制长度。 */
export function safeFilename(title: string): string {
  const name = title.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (name || 'subtitles').slice(0, 80);
}

export function downloadUrl(filename: string, url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  // 加 BOM，Windows 记事本打开中文不乱码
  const blob = new Blob(['﻿', text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  downloadUrl(filename, url);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // 剪贴板接口不可用时（页面没获得焦点等）退回旧方法
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('复制失败');
  }
}

export interface ReadFile {
  name: string;
  /** 图片为 data URL，其余为文本 */
  content: string;
  isImage: boolean;
}

export function readFile(file: File): Promise<ReadFile> {
  const isImage = file.type.startsWith('image/');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, content: String(reader.result), isImage });
    reader.onerror = () => reject(reader.error);
    if (isImage) reader.readAsDataURL(file);
    else reader.readAsText(file, 'utf-8');
  });
}
