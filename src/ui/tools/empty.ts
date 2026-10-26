import { h } from '../dom';
import type { Context } from '../context';

/** An empty state always offers a way forward: here, loading a working example. */
export function emptyState(ctx: Context, message: string): HTMLElement {
  return h(
    'div',
    { class: 'empty' },
    h('p', { class: 'hint' }, message),
    h('button', { type: 'button', class: 'button', onclick: () => ctx.actions.loadExample() }, 'Load Example'),
  );
}
