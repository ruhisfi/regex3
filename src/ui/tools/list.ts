import { expandTemplate } from '../../regex/replace';
import { copyText } from '../context';
import { h } from '../dom';
import type { ToolFactory } from './tool';

export const createListTool: ToolFactory = (ctx) => {
  const { state, analyzer } = ctx;

  const template = h('input', {
    class: 'line-input',
    type: 'text',
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-label': 'Output template for each match',
    placeholder: 'e.g. $1: $&…',
    translate: 'no',
    value: state.get().listTemplate,
  });
  template.addEventListener('input', () => state.update({ listTemplate: template.value }));

  const output = h('textarea', {
    class: 'output',
    readonly: true,
    rows: 6,
    'aria-label': 'List of results',
    translate: 'no',
    spellcheck: 'false',
  });
  const copy = h('button', { type: 'button', class: 'button' }, 'Copy');
  copy.addEventListener('click', async () => {
    copy.textContent = (await copyText(output.value)) ? 'Copied' : 'Copy failed';
    setTimeout(() => (copy.textContent = 'Copy'), 1500);
  });

  const el = h(
    'div',
    { class: 'tool tool-list' },
    h(
      'label',
      { class: 'field-row' },
      h('span', {}, 'Template'),
      template,
      h('span', { class: 'hint inline' }, '$& is the whole match, $1 a group, $<name> a named group.'),
    ),
    output,
    h('div', { class: 'actions' }, copy),
  );

  function update(): void {
    const results = analyzer.results.get();
    const text = state.get().text;
    if (template.value !== state.get().listTemplate) template.value = state.get().listTemplate;

    if (results.text !== text) return;
    const { names } = analyzer.syntax.get();
    output.value = results.matches
      .map((match) => expandTemplate(state.get().listTemplate, match, text, names))
      .join('\n');
  }

  return { el, update };
};
