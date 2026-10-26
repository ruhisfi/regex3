export type Flavor = 'js' | 're2';
export type Tool = 'explain' | 'details' | 'list' | 'replace';
export type ThemeChoice = 'system' | 'light' | 'dark';

/** Everything that a shared link restores. */
export interface ShareState {
  pattern: string;
  flags: string;
  flavor: Flavor;
  text: string;
  replacement: string;
  listTemplate: string;
  tool: Tool;
}

/** Fields that only live in this browser. */
export interface LocalState {
  theme: ThemeChoice;
  referenceOpen: boolean;
}

export type AppState = ShareState & LocalState;

/** The part of the app state that a shared link carries. */
export function shareFields(state: AppState): ShareState {
  const { pattern, flags, flavor, text, replacement, listTemplate, tool } = state;
  return { pattern, flags, flavor, text, replacement, listTemplate, tool };
}

export const DEFAULT_SHARE_STATE: ShareState = {
  pattern: '',
  flags: 'g',
  flavor: 'js',
  text: '',
  replacement: '',
  listTemplate: '$&',
  tool: 'explain',
};

export const SAMPLE_STATE: ShareState = {
  ...DEFAULT_SHARE_STATE,
  pattern: '\\b(?<word>[A-Z][a-z]+)\\b',
  text: [
    'Type a pattern above and every match lights up here.',
    'Hover a row in Explain to see which part of the pattern it describes.',
    'Open Details for capture groups, Replace to rewrite the text, or List to extract values.',
  ].join('\n'),
  replacement: '<$<word>>',
};

export const FLAG_INFO: ReadonlyArray<{ flag: string; name: string; hint: string }> = [
  { flag: 'g', name: 'global', hint: 'Find every match instead of stopping at the first.' },
  { flag: 'i', name: 'ignore case', hint: 'Letters match regardless of case.' },
  { flag: 'm', name: 'multiline', hint: '^ and $ match at the start and end of each line.' },
  { flag: 's', name: 'dot all', hint: '. also matches line breaks.' },
  { flag: 'u', name: 'unicode', hint: 'Treat the pattern and text as Unicode code points. Enables \\p{...}.' },
  { flag: 'v', name: 'unicode sets', hint: 'An upgraded u: set operations and nested classes inside [...].' },
  { flag: 'y', name: 'sticky', hint: 'Match only at the exact position where the search starts.' },
  { flag: 'd', name: 'indices', hint: 'Record start and end offsets of capture groups.' },
];

const VALID_FLAGS = new Set(FLAG_INFO.map((f) => f.flag));

/** Drops unknown and repeated flags and keeps the canonical order. `u` and `v` cannot be combined, so `v` wins. */
export function normalizeFlags(flags: string): string {
  const wanted = new Set([...flags].filter((f) => VALID_FLAGS.has(f)));
  if (wanted.has('v')) wanted.delete('u');
  return FLAG_INFO.map((f) => f.flag)
    .filter((f) => wanted.has(f))
    .join('');
}
