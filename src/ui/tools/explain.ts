import type { ExplainNode } from '../../regex/explain';
import type { Re2Issue } from '../../regex/re2Check';
import { clear, h } from '../dom';
import type { Range } from '../context';
import { emptyState } from './empty';
import type { ToolFactory } from './tool';

const SEVERITY_LABEL = { error: 'Error', warning: 'Warning', info: 'Note' } as const;

/** Whitespace-only sources would render as an empty chip, so they get a visible stand-in. */
export function visibleSource(source: string): string {
  if (!/^\s+$/.test(source)) return source;
  return source.replace(/\n/g, '↵').replace(/\t/g, '⇥').replace(/ /g, '␣');
}

export const createExplainTool: ToolFactory = (ctx) => {
  const { state, analyzer, highlights, actions } = ctx;
  const el = h('div', { class: 'tool tool-explain' });

  const setHover = (range: Range | null) => highlights.update({ pattern: range });

  /** Rows and issues carry their source range, so one set of listeners drives highlight and selection. */
  function rangeOf(target: EventTarget | null): Range | null {
    const row = target instanceof Element ? target.closest<HTMLElement>('[data-start]') : null;
    if (!row) return null;
    return { start: Number(row.dataset.start), end: Number(row.dataset.end) };
  }
  el.addEventListener('pointerover', (event) => setHover(rangeOf(event.target)));
  el.addEventListener('pointerleave', () => setHover(null));
  el.addEventListener('focusin', (event) => setHover(rangeOf(event.target)));
  el.addEventListener('focusout', () => setHover(null));
  el.addEventListener('click', (event) => {
    const range = rangeOf(event.target);
    if (range) actions.selectPattern(range);
  });

  function renderNode(node: ExplainNode): HTMLElement {
    const row = h(
      'button',
      { type: 'button', class: `row row-${node.kind}`, 'data-start': node.start, 'data-end': node.end },
      h('code', { class: 'src', title: node.source, translate: 'no' }, visibleSource(node.source)),
      h('span', { class: 'what' }, h('b', {}, `${node.title}. `), node.description),
    );
    const item = h('li', {}, row);
    if (node.children.length > 0) item.append(renderList(node.children));
    return item;
  }

  function renderList(nodes: ExplainNode[]): HTMLElement {
    return h('ul', { class: 'tree' }, ...nodes.map(renderNode));
  }

  function renderIssues(title: string, issues: Re2Issue[], none: string): HTMLElement {
    const section = h('section', { class: 're2-block' }, h('h3', {}, title));
    if (issues.length === 0) {
      section.append(h('p', { class: 'hint' }, none));
      return section;
    }
    const list = h('ul', { class: 'issues' });
    for (const issue of issues) {
      const content = [h('span', { class: 'badge' }, SEVERITY_LABEL[issue.severity]), h('span', {}, issue.message)];
      const ranged = issue.start !== undefined && issue.end !== undefined;
      list.append(
        h(
          'li',
          {},
          ranged
            ? h(
                'button',
                { type: 'button', class: `issue-row issue-${issue.severity}`, 'data-start': issue.start, 'data-end': issue.end },
                ...content,
              )
            : h('div', { class: `issue-row issue-${issue.severity}` }, ...content),
        ),
      );
    }
    section.append(list);
    return section;
  }

  function update(): void {
    const { pattern, flavor } = state.get();
    const syntax = analyzer.syntax.get();
    clear(el);

    if (syntax.warnings.length > 0) {
      const warnings = syntax.warnings.map((w) => ({ ...w, severity: 'warning' as const }));
      el.append(renderIssues('Code Warnings', warnings, ''));
    }
    if (flavor === 're2' && syntax.ast && !syntax.error) {
      el.append(renderIssues('RE2 Compatibility', syntax.re2Issues, 'Nothing here that RE2 would reject.'));
    }

    if (pattern === '') {
      el.append(
        emptyState(ctx, 'Enter a pattern and every part of it is explained here. Hover or select a row to see which characters it covers.'),
      );
    } else if (syntax.error) {
      el.append(h('p', { class: 'hint' }, 'Fix the error above to see the explanation.'));
    } else if (!syntax.ast) {
      el.append(h('p', { class: 'hint' }, 'This pattern is valid, but the explainer cannot read it yet. Matching still works.'));
    } else {
      el.append(renderList(syntax.explanation));
    }
  }

  return { el, update };
};
