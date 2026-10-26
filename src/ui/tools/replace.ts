import { copyText } from '../context';
import { h } from '../dom';
import type { ToolFactory } from './tool';

export const createReplaceTool: ToolFactory = (ctx) => {
  const { state, analyzer } = ctx;

  const template = h('input', {
    class: 'line-input',
    type: 'text',
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-label': 'Replacement',
    placeholder: 'e.g. $2, $1…',
    translate: 'no',
    value: state.get().replacement,
  });
  template.addEventListener('input', () => state.update({ replacement: template.value }));

  const output = h('textarea', {
    class: 'output',
    readonly: true,
    rows: 8,
    'aria-label': 'Text after replacement',
    translate: 'no',
    spellcheck: 'false',
  });
  const note = h('p', { class: 'hint' });
  const copy = h('button', { type: 'button', class: 'button' }, 'Copy');
  copy.addEventListener('click', async () => {
    copy.textContent = (await copyText(output.value)) ? 'Copied' : 'Copy failed';
    setTimeout(() => (copy.textContent = 'Copy'), 1500);
  });

  const el = h(
    'div',
    { class: 'tool tool-replace' },
    h(
      'label',
      { class: 'field-row' },
      h('span', {}, 'Replace With'),
      template,
      h('span', { class: 'hint inline' }, '$1 is a group, $<name> a named group, $& the match, $$ a dollar sign.'),
    ),
    output,
    note,
    h('div', { class: 'actions' }, copy),
  );

  function update(): void {
    const { text, flags, replacement } = state.get();
    const results = analyzer.results.get();
    if (template.value !== replacement) template.value = replacement;

    if (results.text !== text || results.replaced === null) {
      return;
    }
    output.value = results.replaced;
    note.textContent =
      !flags.includes('g') && results.matches.length > 0 ? 'Only the first match is replaced because the g flag is off. Turn on Global to replace every match.' : '';
  }

  return { el, update };
};
