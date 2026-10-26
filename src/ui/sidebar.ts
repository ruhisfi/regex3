import { filterCheatsheet, type CheatEntry } from '../data/cheatsheet';
import { byId, clear, h } from './dom';
import type { Context } from './context';

export function mountSidebar(ctx: Context, insertAtCaret: (token: string) => void): void {
  const { state } = ctx;
  const body = byId('reference-body');
  const filter = byId<HTMLInputElement>('reference-filter');
  const aside = byId('reference');
  const toggle = byId<HTMLButtonElement>('reference-toggle');

  function renderEntry(entry: CheatEntry): HTMLElement {
    const text = entry.insert ?? entry.token;
    const inner = [
      h('code', { class: 'token' }, entry.token),
      h(
        'span',
        { class: 'meaning' },
        entry.meaning,
        entry.note && h('span', { class: 'note' }, ` ${entry.note}`),
        entry.re2 === 'unsupported' && h('span', { class: 'tag tag-bad' }, 'not in RE2'),
        entry.re2 === 'differs' && h('span', { class: 'tag tag-warn' }, 'differs in RE2'),
      ),
    ];
    if (text === '') return h('div', { class: 'entry' }, ...inner);
    return h('button', { type: 'button', class: 'entry', title: 'Insert into the pattern', onclick: () => insertAtCaret(text) }, ...inner);
  }

  function renderBody(): void {
    clear(body);
    const sections = filterCheatsheet(filter.value);
    if (sections.length === 0) {
      body.append(h('p', { class: 'hint' }, 'Nothing matches that search.'));
      return;
    }
    for (const section of sections) {
      body.append(h('section', {}, h('h3', {}, section.title), ...section.entries.map(renderEntry)));
    }
  }

  function renderOpen(): void {
    const open = state.get().referenceOpen;
    aside.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }

  filter.addEventListener('input', renderBody);
  toggle.addEventListener('click', () => state.update({ referenceOpen: !state.get().referenceOpen }));
  state.subscribe((next, prev) => {
    if (next.referenceOpen !== prev.referenceOpen) renderOpen();
  });

  renderBody();
  renderOpen();
}
