import { formatClock } from './time';
import type { Note, NoteKind } from './types';

const SECTIONS: Array<[NoteKind, string]> = [
  ['idea', '想法'],
  ['phrase', '好句'],
];

/** 笔记导出为 Markdown：按类型分组，每条带可点击回到视频该处的时间戳链接。 */
export function notesToMarkdown(
  title: string,
  url: string,
  notes: Note[],
  timeUrl: (ms: number) => string,
): string {
  const out = [`# ${title}`, '', url, ''];
  for (const [kind, name] of SECTIONS) {
    const group = notes.filter((n) => n.kind === kind).sort((a, b) => a.start - b.start);
    if (!group.length) continue;
    out.push(`## ${name}`, '');
    for (const n of group) {
      out.push(`- [${formatClock(n.start)}](${timeUrl(n.start)}) ${n.text}`);
      if (n.trans) out.push(`  ${n.trans}`);
      for (const line of n.comment.trim().split('\n').filter(Boolean)) out.push(`  > ${line}`);
    }
    out.push('');
  }
  return out.join('\n');
}
