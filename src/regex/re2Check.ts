import { STRING_PROPERTIES, walk, type AnyNode, type PatternNode } from './ast';

export type Severity = 'error' | 'warning' | 'info';

export interface Re2Issue {
  severity: Severity;
  message: string;
  /** Range in the pattern the issue applies to; absent for flag-level issues. */
  start?: number;
  end?: number;
}

type Rule = (node: AnyNode, parent: AnyNode | null) => Omit<Re2Issue, 'start' | 'end'> | undefined;

const MAX_REPEAT = 1000;

/** Each rule inspects one node and returns an issue when RE2 would reject or interpret it differently. */
const nodeRules: Rule[] = [
  (node) =>
    node.type === 'backref'
      ? {
          severity: 'error',
          message: 'RE2 has no backreferences, because they cannot be matched in linear time.',
        }
      : undefined,

  (node) => {
    if (node.type !== 'group') return undefined;
    if (node.kind === 'lookahead' || node.kind === 'negativeLookahead') {
      return { severity: 'error', message: 'RE2 does not support lookahead.' };
    }
    if (node.kind === 'lookbehind' || node.kind === 'negativeLookbehind') {
      return { severity: 'error', message: 'RE2 does not support lookbehind.' };
    }
    if (node.kind === 'named' && node.name && !/^\w+$/.test(node.name)) {
      return { severity: 'error', message: 'RE2 group names may only contain letters, digits and underscores.' };
    }
    return undefined;
  },

  (node) =>
    node.type === 'quantifier' &&
    ((Number.isFinite(node.min) && node.min > MAX_REPEAT) || (Number.isFinite(node.max) && node.max > MAX_REPEAT))
      ? { severity: 'error', message: `RE2 limits repetition counts to ${MAX_REPEAT}.` }
      : undefined,

  (node) => {
    if (node.type !== 'escape') return undefined;
    switch (node.kind) {
      case 'controlLetter':
        return { severity: 'error', message: 'RE2 does not support \\cX control escapes. Use \\x00 style escapes.' };
      case 'unicode': {
        const hex = (node.codePoint ?? 0).toString(16).toUpperCase();
        return { severity: 'error', message: `RE2 has no \\u escapes. Write this as \\x{${hex}}.` };
      }
      case 'backspace':
        return { severity: 'error', message: 'RE2 does not support \\b (backspace) inside a character set.' };
      case 'space':
      case 'notSpace':
        return {
          severity: 'info',
          message: 'RE2 \\s only matches [\\t\\n\\f\\r ]. JavaScript also matches vertical tab and Unicode spaces.',
        };
      case 'identity': {
        const ch = String.fromCodePoint(node.codePoint ?? 0);
        if (!/[A-Za-z0-9_]/.test(ch)) return undefined;
        return ch === 'a'
          ? { severity: 'warning', message: 'In RE2, \\a is the bell character. JavaScript treats it as a plain “a”.' }
          : { severity: 'error', message: `RE2 rejects \\${ch}. Only punctuation can be escaped this way.` };
      }
      case 'octal':
        return { severity: 'warning', message: 'Legacy octal escapes behave differently between JavaScript and RE2.' };
      default:
        return undefined;
    }
  },

  (node) =>
    node.type === 'property' && node.value !== undefined
      ? {
          severity: 'error',
          message: `RE2 does not accept \\p{${node.name}=${node.value}}. It names scripts and categories directly, such as \\p{Greek} or \\p{L}. JavaScript only accepts the name=value form for scripts.`,
        }
      : undefined,

  (node) =>
    node.type === 'classOperator'
      ? { severity: 'error', message: 'RE2 has no set operations (&& and --) inside character classes.' }
      : undefined,

  (node) =>
    node.type === 'classStrings'
      ? { severity: 'error', message: 'RE2 has no \\q{…} string alternatives inside character classes.' }
      : undefined,

  (node) =>
    node.type === 'property' && node.value === undefined && STRING_PROPERTIES.has(node.name)
      ? { severity: 'error', message: `RE2 has no properties of strings such as \\p{${node.name}}.` }
      : undefined,

  (node, parent) =>
    node.type === 'class' && parent?.type === 'class'
      ? { severity: 'error', message: 'RE2 has no nested character classes.' }
      : undefined,
];

const flagRules: Array<{ flag: string; issue: Re2Issue }> = [
  { flag: 'd', issue: { severity: 'warning', message: 'The d flag (match indices) is a JavaScript API feature with no RE2 equivalent.' } },
  { flag: 'y', issue: { severity: 'warning', message: 'RE2 has no sticky matching. The y flag does not exist there.' } },
  { flag: 'v', issue: { severity: 'error', message: 'RE2 has no unicodeSets (v) mode.' } },
];

export function checkRe2(ast: PatternNode, flags: string): Re2Issue[] {
  const issues: Re2Issue[] = [];

  for (const { flag, issue } of flagRules) {
    if (flags.includes(flag)) issues.push(issue);
  }

  walk(ast, (node, parent) => {
    for (const rule of nodeRules) {
      const found = rule(node, parent);
      if (found) issues.push({ ...found, start: node.start, end: node.end });
    }
  });

  return issues;
}
