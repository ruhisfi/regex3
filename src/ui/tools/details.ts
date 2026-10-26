import { clear, h } from '../dom';
import type { Range } from '../context';
import { emptyState } from './empty';
import type { ToolFactory } from './tool';

/** Rendering every row of a very large result set would make the page sluggish; the rest is summarized. */
const ROW_LIMIT = 200;

const numbers = new Intl.NumberFormat();

export const createDetailsTool: ToolFactory = (ctx) => {
  const { state, analyzer, highlights, actions } = ctx;
  const el = h('div', { class: 'tool tool-details' });

  const setHover = (range: Range | null) => highlights.update({ text: range });
  const rangeOf = (target: EventTarget | null): Range | null => {
    const row = target instanceof Element ? target.closest<HTMLElement>('[data-start]') : null;
    return row ? { start: Number(row.dataset.start), end: Number(row.dataset.end) } : null;
  };
  el.addEventListener('pointerover', (event) => setHover(rangeOf(event.target)));
  el.addEventListener('pointerleave', () => setHover(null));
  el.addEventListener('focusin', (event) => setHover(rangeOf(event.target)));
  el.addEventListener('focusout', () => setHover(null));
  el.addEventListener('click', (event) => {
    const range = rangeOf(event.target);
    if (range) actions.selectText(range);
  });

  const span = (start: number, end: number) => (end - start === 0 ? `at ${start}` : `${start}–${end}`);

  function update(): void {
    const results = analyzer.results.get();
    const { names } = analyzer.syntax.get();
    clear(el);

    if (state.get().pattern === '') {
      el.append(emptyState(ctx, 'Enter a pattern to list its matches with their positions and capture groups.'));
      return;
    }
    if (analyzer.syntax.get().error || results.text !== state.get().text) {
      el.append(h('p', { class: 'hint' }, analyzer.syntax.get().error ? 'Fix the error above to see matches.' : 'Matching…'));
      return;
    }
    if (results.matches.length === 0) {
      el.append(h('p', { class: 'hint' }, 'No matches. Check the flags, edit the pattern, or change the text.'));
      return;
    }

    const list = h('ol', { class: 'matches' });
    results.matches.slice(0, ROW_LIMIT).forEach((match, i) => {
      const groups = match.groups.map((group) => {
        const name = names.get(group.index);
        const participated = group.start !== undefined && group.end !== undefined;
        const content = [
          h('span', { class: 'label' }, name ? `Group ${group.index} · ${name}` : `Group ${group.index}`),
          group.value === undefined
            ? h('span', { class: 'unmatched' }, 'Did not participate')
            : h('code', { class: 'value', translate: 'no' }, group.value === '' ? '(empty)' : group.value),
          participated && h('span', { class: 'pos' }, span(group.start!, group.end!)),
        ];
        return h(
          'li',
          {},
          participated
            ? h('button', { type: 'button', class: 'group-row', 'data-start': group.start, 'data-end': group.end }, ...content)
            : h('div', { class: 'group-row' }, ...content),
        );
      });

      list.append(
        h(
          'li',
          { class: 'match-row' },
          h(
            'button',
            { type: 'button', class: 'match-head', 'data-start': match.index, 'data-end': match.end },
            h('span', { class: 'label' }, `Match ${i + 1}`),
            h('code', { class: 'value', translate: 'no' }, match.value === '' ? '(empty)' : match.value),
            h('span', { class: 'pos' }, span(match.index, match.end)),
          ),
          groups.length > 0 && h('ul', { class: 'groups' }, ...groups),
        ),
      );
    });
    el.append(list);

    if (results.matches.length > ROW_LIMIT || results.truncated) {
      el.append(
        h(
          'p',
          { class: 'hint' },
          `Showing the first ${ROW_LIMIT} of ${numbers.format(results.matches.length)}${results.truncated ? '+' : ''} matches.`,
        ),
      );
    }
  }

  return { el, update };
};
