import { escapeHtml } from './dom';

/**
 * A decoration over `[start, end)`. A span with `start === end` is a point marker drawn between characters.
 * Spans may overlap; each text segment receives the classes of every span covering it.
 */
export interface Span {
  start: number;
  end: number;
  className: string;
}

/** Renders `text` as HTML with the spans applied. Output ends with a zero-width space so a trailing newline keeps its line. */
export function renderSpans(text: string, spans: readonly Span[]): string {
  const points = new Map<number, string[]>();
  const events: Array<{ pos: number; start: boolean; index: number }> = [];

  spans.forEach((span, index) => {
    const start = Math.max(0, Math.min(span.start, text.length));
    const end = Math.max(0, Math.min(span.end, text.length));
    if (start === end) {
      const list = points.get(start) ?? [];
      list.push(span.className);
      points.set(start, list);
    } else {
      events.push({ pos: start, start: true, index }, { pos: end, start: false, index });
    }
  });

  // At the same position, close spans before opening new ones.
  events.sort((a, b) => a.pos - b.pos || Number(a.start) - Number(b.start) || a.index - b.index);

  const boundaries = new Set<number>([0, text.length, ...points.keys()]);
  for (const e of events) boundaries.add(e.pos);
  const positions = [...boundaries].sort((a, b) => a - b);

  const active = new Set<number>();
  let html = '';
  let cursor = 0;

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]!;
    while (cursor < events.length && events[cursor]!.pos === pos) {
      const e = events[cursor++]!;
      if (e.start) active.add(e.index);
      else active.delete(e.index);
    }
    for (const className of points.get(pos) ?? []) html += `<span class="${className}"></span>`;

    const next = positions[i + 1];
    if (next === undefined) break;
    const segment = escapeHtml(text.slice(pos, next));
    if (active.size === 0) {
      html += segment;
    } else {
      const classes = [...active]
        .sort((a, b) => a - b)
        .map((index) => spans[index]!.className)
        .join(' ');
      // `data-s` is where this segment starts in the text, so a pointer position can be traced back to an offset.
      html += `<span class="${classes}" data-s="${pos}">${segment}</span>`;
    }
  }
  return html + '​';
}
