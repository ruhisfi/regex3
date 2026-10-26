import type { Context } from '../context';

/** A tools-panel tab. `el` is created once; `update` refreshes it while it is visible. */
export interface Tool {
  el: HTMLElement;
  update(): void;
}

export type ToolFactory = (ctx: Context) => Tool;
