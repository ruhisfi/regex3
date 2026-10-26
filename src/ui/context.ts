import type { Analyzer } from '../analysis';
import { Store } from '../state/store';
import type { AppState } from '../state/state';

export interface Range {
  start: number;
  end: number;
}

/** Ranges emphasised because the pointer is over a related item elsewhere in the UI. */
export interface Highlights {
  pattern: Range | null;
  text: Range | null;
}

export function createHighlights(): Store<Highlights> {
  return new Store<Highlights>({ pattern: null, text: null });
}

/** Things components ask of each other without knowing who implements them. Filled in once everything is mounted. */
export interface Actions {
  selectPattern(range: Range): void;
  selectText(range: Range): void;
  loadExample(): void;
}

export interface Context {
  state: Store<AppState>;
  analyzer: Analyzer;
  highlights: Store<Highlights>;
  actions: Actions;
}

/**
 * Copies text to the clipboard. A promise is accepted so the write can start inside the click handler
 * while the text is still being computed, which browsers such as Safari require.
 */
export async function copyText(text: string | Promise<string>): Promise<boolean> {
  try {
    if (typeof text !== 'string' && typeof ClipboardItem !== 'undefined') {
      const blob = text.then((value) => new Blob([value], { type: 'text/plain' }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
    } else {
      await navigator.clipboard.writeText(await text);
    }
    return true;
  } catch {
    return false;
  }
}
