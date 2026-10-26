import type { CaptureGroup, MatchResult } from '../regex/engine';
import { clear, h } from './dom';
import { visibleSource } from './tools/explain';

/** The first tooltip waits a moment so it does not flash while the pointer is just passing over text. */
const FIRST_SHOW_DELAY_MS = 150;
const MAX_GROUPS_SHOWN = 8;
const MAX_VALUE_LENGTH = 60;

/** Index of the match covering `offset`, or -1. Matches are sorted and never overlap, so this is a binary search. */
export function findMatchAt(matches: readonly MatchResult[], offset: number): number {
  let low = 0;
  let high = matches.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const match = matches[mid]!;
    if (offset < match.index) high = mid - 1;
    else if (offset >= match.end) low = mid + 1;
    else return mid;
  }
  return -1;
}

/** The innermost capture group of `match` that covers `offset`. When groups share a range, the later one wins. */
export function groupAt(match: MatchResult, offset: number): CaptureGroup | null {
  let best: CaptureGroup | null = null;
  for (const group of match.groups) {
    if (group.start === undefined || group.end === undefined) continue;
    if (offset < group.start || offset >= group.end) continue;
    if (best === null || group.end - group.start <= best.end! - best.start!) best = group;
  }
  return best;
}

function shorten(value: string): string {
  const chars = [...value];
  return chars.length > MAX_VALUE_LENGTH ? `${chars.slice(0, MAX_VALUE_LENGTH).join('')}…` : value;
}

const showValue = (value: string) => (value === '' ? '(empty)' : visibleSource(shorten(value)));

/** The tooltip body for one match: its number, position and value, then each capture group. */
export function describeMatch(
  match: MatchResult,
  number: number,
  names: ReadonlyMap<number, string>,
  current: CaptureGroup | null,
): Node[] {
  const nodes: Node[] = [
    h('div', { class: 'tip-head' }, h('strong', {}, `Match ${number}`), h('span', {}, `${match.index}–${match.end}`)),
    h('code', { class: 'tip-value', translate: 'no' }, showValue(match.value)),
  ];

  if (match.groups.length > 0) {
    const rows = match.groups.slice(0, MAX_GROUPS_SHOWN).map((group) => {
      const name = names.get(group.index);
      return h(
        'div',
        { class: group === current ? 'tip-group tip-current' : 'tip-group' },
        h('span', {}, name ? `Group ${group.index} · ${name}` : `Group ${group.index}`),
        group.value === undefined
          ? h('span', {}, 'Did not participate')
          : h('code', { translate: 'no' }, showValue(group.value)),
      );
    });
    const hidden = match.groups.length - MAX_GROUPS_SHOWN;
    nodes.push(h('div', { class: 'tip-groups' }, ...rows, hidden > 0 && h('div', { class: 'tip-more' }, `…and ${hidden} more`)));
  }
  return nodes;
}

/**
 * A small floating note next to the pointer. It is a mouse-only extra: the Details tool shows the same information
 * and works with a keyboard and screen readers, so this stays hidden from assistive technology.
 */
export class MatchTip {
  private readonly el = h('div', { class: 'match-tip', 'aria-hidden': 'true' });
  private timer: ReturnType<typeof setTimeout> | undefined;
  private visible = false;
  private latest: { content: Node[]; x: number; y: number } | null = null;

  constructor() {
    this.el.hidden = true;
    document.body.append(this.el);
  }

  /** The first call is delayed; once a tip is showing, later calls update it immediately. */
  show(content: Node[], x: number, y: number): void {
    this.latest = { content, x, y };
    if (this.visible) {
      this.render();
    } else {
      this.timer ??= setTimeout(() => {
        this.timer = undefined;
        this.render();
      }, FIRST_SHOW_DELAY_MS);
    }
  }

  hide(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.latest = null;
    this.visible = false;
    this.el.hidden = true;
  }

  private render(): void {
    if (!this.latest) return;
    const { content, x, y } = this.latest;
    clear(this.el);
    this.el.append(...content);
    this.el.hidden = false;
    this.visible = true;

    // Sit below and to the right of the pointer, flipping to the other side where there is no room.
    const gap = 14;
    const box = this.el.getBoundingClientRect();
    const left = x + gap + box.width > window.innerWidth - 8 ? Math.max(8, x - gap - box.width) : x + gap;
    const top = y + gap + box.height > window.innerHeight - 8 ? Math.max(8, y - gap - box.height) : y + gap;
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }
}
