const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

/**
 * 清理一行字幕文字：去掉 HTML 标签（有些人工字幕带 <b>、<i>、<font> 等格式标记），
 * 还原 &amp; &#39; 这类转义字符，合并多余空白。
 */
export function cleanText(s: string | undefined): string {
  return (s ?? '')
    .replace(/<\/?[a-zA-Z][^<>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? m;
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}
