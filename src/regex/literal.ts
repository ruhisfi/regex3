import { normalizeFlags } from '../state/state';

// Written with char codes: these two characters are line terminators even inside a regex literal in source.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const LINE_BREAKS = new RegExp(`[\\n\\r${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}]`);
const LINE_BREAK_ESCAPES: Record<string, string> = {
  '\n': '\\n',
  '\r': '\\r',
  [LINE_SEPARATOR]: '\\u2028',
  [PARAGRAPH_SEPARATOR]: '\\u2029',
};

/**
 * Offsets of every `/` that is neither escaped nor inside a character class. A regex literal ends at the first one,
 * so these are the slashes that break `/pattern/flags` in code.
 *
 * This follows how JavaScript finds the end of a literal, which does not know about flags: a class ends at the first
 * `]`, even where `v` would nest it. So in `/[[a]/]/v` the slash ends the literal, although the engine reads it as
 * part of the outer set.
 */
export function unescapedSlashes(pattern: string): number[] {
  const found: number[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') {
      i++;
    } else if (inClass) {
      if (c === ']') inClass = false;
    } else if (c === '[') {
      inClass = true;
    } else if (c === '/') {
      found.push(i);
    }
  }
  return found;
}

/**
 * Reads text such as `/\b(?<word>\w+)\b/gi` as a pattern and its flags, or returns `null` when it is not a valid
 * literal (for example a path like `/usr/bin/`, which has a bare slash inside).
 */
export function parseRegexLiteral(text: string): { pattern: string; flags: string } | null {
  const match = /^\/([\s\S]+)\/([a-z]*)$/.exec(text.trim());
  if (!match) return null;
  const pattern = match[1]!;
  const flags = match[2]!;
  if (!/^[dgimsuvy]*$/.test(flags) || new Set(flags).size !== flags.length) return null;
  if (LINE_BREAKS.test(pattern)) return null;
  if (unescapedSlashes(pattern).length > 0) return null;
  return { pattern, flags: normalizeFlags(flags) };
}

/** Writes a pattern and flags as a literal that can be pasted into code: bare slashes and line breaks are escaped. */
export function toRegexLiteral(pattern: string, flags: string): string {
  const slashes = new Set(unescapedSlashes(pattern));
  let body = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === '\\' && i + 1 < pattern.length) {
      const next = pattern[i + 1]!;
      // A backslash before a raw line break already means "that line break", so only the spelling changes.
      body += LINE_BREAK_ESCAPES[next] ?? c + next;
      i++;
    } else if (slashes.has(i)) {
      body += '\\/';
    } else {
      body += LINE_BREAK_ESCAPES[c] ?? c;
    }
  }
  return `/${body}/${flags}`;
}
