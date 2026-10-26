import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';

import { Analyzer } from './analysis';
import { Store } from './state/store';
import { SAMPLE_STATE, shareFields, type AppState, type ShareState } from './state/state';
import { COMFORTABLE_HASH_LENGTH, decodeState, encodeState } from './state/urlCodec';
import { createHighlights, type Actions, type Context } from './ui/context';
import { mountEditor } from './ui/editor';
import { mountShareButton, mountThemeToggle, readStoredTheme } from './ui/header';
import { mountSidebar } from './ui/sidebar';
import { mountTestText } from './ui/testText';
import { mountTools } from './ui/tools';

async function main(): Promise<void> {
  // A link restores exactly what it encodes. Without a usable one we start from an example so the page is not blank.
  const shared = location.hash.length > 1 ? await decodeState(location.hash) : null;
  const initial: ShareState = shared ?? SAMPLE_STATE;

  const state = new Store<AppState>({
    ...initial,
    theme: readStoredTheme(),
    referenceOpen: window.matchMedia('(min-width: 62rem)').matches,
  });
  // Components call these without knowing who implements them; they are filled in once everything is mounted.
  const actions: Actions = {
    selectPattern: () => {},
    selectText: () => {},
    loadExample: () => state.update(SAMPLE_STATE),
  };
  const ctx: Context = { state, analyzer: new Analyzer(state), highlights: createHighlights(), actions };

  const editor = mountEditor(ctx);
  const testText = mountTestText(ctx);
  actions.selectPattern = editor.selectRange;
  actions.selectText = testText.selectRange;
  mountTools(ctx);
  mountSidebar(ctx, (token) => editor.insertAtCaret(token));
  mountThemeToggle(ctx);
  mountShareButton(ctx);

  // Keep the address bar a working link, so reloading or copying it from the browser also works.
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  state.subscribe((next, prev) => {
    const changed = (Object.keys(shareFields(next)) as Array<keyof ShareState>).some((key) => next[key] !== prev[key]);
    if (!changed) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      const hash = await encodeState(shareFields(state.get()));
      const base = `${location.pathname}${location.search}`;
      history.replaceState(null, '', hash.length <= COMFORTABLE_HASH_LENGTH ? `${base}#${hash}` : base);
    }, 400);
  });

  // Pasting another link into this tab, or following one, replaces the current state.
  window.addEventListener('hashchange', async () => {
    const next = await decodeState(location.hash);
    if (next) state.update(next);
  });
}

void main();
