import { COMFORTABLE_HASH_LENGTH, encodeState } from '../state/urlCodec';
import { shareFields, type ThemeChoice } from '../state/state';
import { byId } from './dom';
import { copyText, type Context } from './context';

export const THEME_STORAGE_KEY = 'regex3.theme';

export function readStoredTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = choice;
}

/** Matches the browser's own chrome (address bar, status bar on mobile) to the page background. */
function applyThemeColor(dark: boolean): void {
  document.getElementById('theme-color')?.setAttribute('content', dark ? '#111113' : '#ffffff');
}

export function mountThemeToggle({ state }: Context): void {
  const button = byId<HTMLButtonElement>('theme-toggle');
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  function isDark(): boolean {
    const { theme } = state.get();
    return theme === 'dark' || (theme === 'system' && systemPrefersDark());
  }

  function render(): void {
    applyTheme(state.get().theme);
    const dark = isDark();
    applyThemeColor(dark);
    button.setAttribute('aria-pressed', String(dark));
    button.title = dark ? 'Switch to the light theme' : 'Switch to the dark theme';
  }

  button.addEventListener('click', () => {
    const next: ThemeChoice = isDark() ? 'light' : 'dark';
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private windows); the choice then lasts for this visit only.
    }
    state.update({ theme: next });
  });
  media.addEventListener('change', render);
  state.subscribe((next, prev) => {
    if (next.theme !== prev.theme) render();
  });
  render();
}

export function mountShareButton({ state }: Context): void {
  const button = byId<HTMLButtonElement>('share');
  const live = byId('share-status');
  let timer: ReturnType<typeof setTimeout> | undefined;

  function announce(message: string): void {
    live.textContent = message;
    clearTimeout(timer);
    timer = setTimeout(() => (live.textContent = ''), 3000);
  }

  button.addEventListener('click', async () => {
    let hashLength = 0;
    const url = encodeState(shareFields(state.get())).then((hash) => {
      hashLength = hash.length;
      const link = `${location.origin}${location.pathname}${location.search}#${hash}`;
      history.replaceState(null, '', link);
      return link;
    });
    const copied = await copyText(url);
    await url;
    const long = hashLength > COMFORTABLE_HASH_LENGTH ? ` It is ${hashLength} characters long, which some apps cut off.` : '';
    announce(copied ? `Link copied.${long}` : `Could not copy automatically. The address bar has the link.${long}`);
  });
}
