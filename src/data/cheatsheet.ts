export interface CheatEntry {
  /** What is shown, and by default what is inserted into the pattern. */
  token: string;
  meaning: string;
  /** Text to insert when it differs from `token`. An empty string marks an informational entry that is not clickable. */
  insert?: string;
  /** How RE2 treats the token, when that differs from JavaScript. */
  re2?: 'unsupported' | 'differs';
  /** Extra remark shown under the meaning. */
  note?: string;
}

export interface CheatSection {
  id: string;
  title: string;
  entries: CheatEntry[];
}

export const CHEATSHEET: readonly CheatSection[] = [
  {
    id: 'anchors',
    title: 'Anchors',
    entries: [
      { token: '^', meaning: 'Start of the text. With the m flag, start of each line.' },
      { token: '$', meaning: 'End of the text. With the m flag, end of each line.' },
      { token: '\\b', meaning: 'Word boundary: between a word character and a non-word character.' },
      { token: '\\B', meaning: 'Anything that is not a word boundary.' },
    ],
  },
  {
    id: 'classes',
    title: 'Characters & Sets',
    entries: [
      { token: '.', meaning: 'Any character except a line break. With the s flag, including line breaks.' },
      { token: '\\d', meaning: 'A digit, 0 to 9.' },
      { token: '\\D', meaning: 'Anything that is not a digit.' },
      { token: '\\w', meaning: 'A letter, digit or underscore.' },
      { token: '\\W', meaning: 'Anything that is not a word character.' },
      { token: '\\s', meaning: 'Whitespace: space, tab, line break and so on.', re2: 'differs' },
      { token: '\\S', meaning: 'Anything that is not whitespace.', re2: 'differs' },
      { token: '[abc]', meaning: 'Any one of a, b or c.' },
      { token: '[^abc]', meaning: 'Any character except a, b or c.' },
      { token: '[a-z]', meaning: 'Any character in the range a to z.' },
      { token: '\\p{L}', meaning: 'Any letter in any language. Needs the u or v flag.' },
      { token: '\\P{L}', meaning: 'Anything that is not a letter. Needs the u or v flag.' },
      { token: '\\p{Script=Greek}', meaning: 'Characters of one script. Needs the u or v flag.', re2: 'differs' },
      { token: '[\\p{L}&&\\p{ASCII}]', meaning: 'Intersection: only characters in both sets. Needs the v flag.', re2: 'unsupported' },
      { token: '[\\p{L}--[aeiou]]', meaning: 'Subtraction: the first set without the second. Needs the v flag.', re2: 'unsupported' },
      { token: '[[a-c][x-z]]', meaning: 'A set inside a set. Needs the v flag.', re2: 'unsupported' },
      { token: '[\\q{abc|de}]', meaning: 'Whole strings, tried longest first. Needs the v flag.', re2: 'unsupported' },
      { token: '\\p{RGI_Emoji}', meaning: 'Any standard emoji, including multi-character ones. Needs the v flag.', re2: 'unsupported' },
    ],
  },
  {
    id: 'quantifiers',
    title: 'Quantifiers',
    entries: [
      { token: '*', meaning: 'Zero or more of the preceding token.' },
      { token: '+', meaning: 'One or more.' },
      { token: '?', meaning: 'Zero or one: the token is optional.' },
      { token: '{3}', meaning: 'Exactly 3.' },
      { token: '{3,}', meaning: '3 or more.' },
      { token: '{3,5}', meaning: 'Between 3 and 5.', note: 'RE2 allows counts up to 1000.' },
      { token: '*?', meaning: 'Lazy: as few as possible. Also +?, ?? and {n,m}?.' },
    ],
  },
  {
    id: 'groups',
    title: 'Groups & Lookaround',
    entries: [
      { token: '(abc)', meaning: 'Capturing group, numbered from 1.', insert: '()' },
      { token: '(?<name>abc)', meaning: 'Named capturing group.', insert: '(?<name>)' },
      { token: '(?:abc)', meaning: 'Group without capturing.', insert: '(?:)' },
      { token: 'a|b', meaning: 'Either a or b. Alternatives are tried from left to right.', insert: '|' },
      { token: '(?i:abc)', meaning: 'Apply flags i, m or s only inside the group.', insert: '(?i:)' },
      { token: '(?=abc)', meaning: 'Lookahead: what follows must match.', insert: '(?=)', re2: 'unsupported' },
      { token: '(?!abc)', meaning: 'Negative lookahead: what follows must not match.', insert: '(?!)', re2: 'unsupported' },
      { token: '(?<=abc)', meaning: 'Lookbehind: what precedes must match.', insert: '(?<=)', re2: 'unsupported' },
      { token: '(?<!abc)', meaning: 'Negative lookbehind: what precedes must not match.', insert: '(?<!)', re2: 'unsupported' },
    ],
  },
  {
    id: 'references',
    title: 'References',
    entries: [
      { token: '\\1', meaning: 'Same text as capturing group 1 matched.', re2: 'unsupported' },
      { token: '\\k<name>', meaning: 'Same text as the named group matched.', re2: 'unsupported' },
      { token: '$1', meaning: 'In a replacement: the text of group 1.', insert: '' },
      { token: '$<name>', meaning: 'In a replacement: the text of a named group.', insert: '' },
      { token: '$&', meaning: 'In a replacement: the whole match.', insert: '' },
      { token: '$$', meaning: 'In a replacement: a literal dollar sign.', insert: '' },
    ],
  },
  {
    id: 'escapes',
    title: 'Escapes',
    entries: [
      { token: '\\n', meaning: 'Line feed. Also \\r carriage return, \\t tab, \\v vertical tab, \\f form feed.' },
      { token: '\\0', meaning: 'The null character.' },
      { token: '\\xHH', meaning: 'A character by two hex digits, such as \\x41 for A.', insert: '\\x41' },
      { token: '\\uHHHH', meaning: 'A character by four hex digits.', insert: '\\u00e9', re2: 'unsupported' },
      { token: '\\u{H…}', meaning: 'Any code point. Needs the u or v flag.', insert: '\\u{1F600}', re2: 'unsupported' },
      { token: '\\.', meaning: 'A backslash makes punctuation literal: \\. \\* \\+ \\? \\( \\[ \\\\ and so on.' },
    ],
  },
  {
    id: 'flags',
    title: 'Flags',
    entries: [
      { token: 'g', meaning: 'Global: find all matches.', insert: '' },
      { token: 'i', meaning: 'Ignore case.', insert: '' },
      { token: 'm', meaning: 'Multiline: ^ and $ work per line.', insert: '' },
      { token: 's', meaning: 'Dot all: . also matches line breaks.', insert: '' },
      { token: 'u', meaning: 'Unicode: code points, \\p{…}, stricter syntax.', insert: '' },
      { token: 'v', meaning: 'Unicode sets: u plus set operations in [ ].', insert: '', re2: 'unsupported' },
      { token: 'y', meaning: 'Sticky: match only at the search position.', insert: '', re2: 'unsupported' },
      { token: 'd', meaning: 'Record match indices for groups.', insert: '', re2: 'unsupported' },
    ],
  },
];

/** Entries match when every whitespace-separated word of the query appears in the token or meaning. */
export function filterCheatsheet(query: string, sections: readonly CheatSection[] = CHEATSHEET): CheatSection[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...sections];
  return sections
    .map((section) => ({
      ...section,
      entries: section.entries.filter((entry) => {
        const haystack = `${entry.token} ${entry.meaning} ${section.title}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
      }),
    }))
    .filter((section) => section.entries.length > 0);
}
