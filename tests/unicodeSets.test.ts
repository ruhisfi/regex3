import { describe, expect, it } from 'vitest';
import type { ClassNode, GroupNode } from '../src/regex/ast';
import { explain, type ExplainNode } from '../src/regex/explain';
import { optionsFromFlags, parse, ParseError } from '../src/regex/parser';
import { checkRe2 } from '../src/regex/re2Check';

function nativeAccepts(pattern: string, flags: string): boolean {
  try {
    new RegExp(pattern, flags);
    return true;
  } catch {
    return false;
  }
}

function parserAccepts(pattern: string, flags: string): boolean {
  try {
    parse(pattern, optionsFromFlags(flags));
    return true;
  } catch (e) {
    if (e instanceof ParseError) return false;
    throw e;
  }
}

/** Patterns with the v flag. Each is checked against the engine, so this list never encodes a guess. */
const valid = [
  '[a-z]',
  '[]',
  '[^]',
  '[\\d\\w]',
  '[\\&\\-\\!\\#\\%\\,\\:\\;\\<\\=\\>\\@\\`\\~]',
  '[\\b]',
  '[a&b]',
  '[a&&b]',
  '[a&&b&&c]',
  '[a--b]',
  '[a--b--c]',
  '[\\p{L}--[a-z]]',
  '[[a-z]--[aeiou]]',
  '[\\p{L}&&\\p{ASCII}]',
  '[[a-c][x-z]]',
  '[a-z[0-9]]',
  '[[^a]--b]',
  '[^[a-c]]',
  '[\\q{abc|d}]',
  '[\\q{}]',
  '[\\q{a|b|c}]',
  '[^\\q{a|b}]',
  '[\\q{\\n|\\u{1F600}}]',
  '[\\q{abc}--\\q{abc}]',
  '[\\p{RGI_Emoji}--\\q{😀}]',
  '\\p{RGI_Emoji}',
  '\\p{Emoji_Keycap_Sequence}+',
  '[\\p{RGI_Emoji}\\q{abc}]',
  '[\\u{1F600}-\\u{1F64F}]',
  '[😀-😎]',
  '[\\(\\)\\[\\]\\{\\}\\/\\|]',
  '[\\p{Script=Greek}&&\\p{L}]',
  '[\\p{L}&&[^a-z]]',
  '(?:[\\p{L}--[a-z]]+)',
];

const invalid = [
  '[(]',
  '[)]',
  '[{]',
  '[}]',
  '[/]',
  '[|]',
  '[-]',
  '[a-]',
  '[-a]',
  '[a&&&b]',
  '[a&&b--c]',
  '[a--b&&c]',
  '[ab&&c]',
  '[ab--c]',
  '[a-z&&b]',
  '[a-z--m]',
  '[a&&]',
  '[&&a]',
  '[--a]',
  '[a--]',
  '[a!!b]',
  '[a##b]',
  '[a$$b]',
  '[a%%b]',
  '[a**b]',
  '[a++b]',
  '[a,,b]',
  '[a..b]',
  '[a::b]',
  '[a;;b]',
  '[a<<b]',
  '[a==b]',
  '[a>>b]',
  '[a??b]',
  '[a@@b]',
  '[a^^b]',
  '[a``b]',
  '[a~~b]',
  '[\\d-z]',
  '[z-a]',
  '[^\\p{RGI_Emoji}]',
  '[^\\q{ab}]',
  '[^[\\q{ab}]]',
  '[^\\p{RGI_Emoji}--\\q{x}]',
  '\\P{RGI_Emoji}',
  '[\\P{RGI_Emoji}]',
  '\\p{NotAProperty}',
  '[\\p{NotAProperty}]',
  '[\\q{a]',
  '[\\q{(}]',
  '[\\q]',
  '[\\q{a|}',
  '[\\_]',
  '[a',
  '[[a]',
  '[a]]',
  '[\\w-a]',
];

describe('v flag: the parser agrees with the engine', () => {
  for (const pattern of valid) {
    it(`accepts /${pattern}/v`, () => {
      expect(nativeAccepts(pattern, 'v')).toBe(true);
      expect(parserAccepts(pattern, 'v')).toBe(true);
    });
  }
  for (const pattern of invalid) {
    it(`rejects /${pattern}/v`, () => {
      expect(nativeAccepts(pattern, 'v')).toBe(false);
      expect(parserAccepts(pattern, 'v')).toBe(false);
    });
  }

  it('does not allow properties of strings without v', () => {
    expect(nativeAccepts('\\p{RGI_Emoji}', 'u')).toBe(false);
    expect(parserAccepts('\\p{RGI_Emoji}', 'u')).toBe(false);
  });

  it('still reads classic sets without v the way it did', () => {
    expect(parserAccepts('[a&&b]', 'u')).toBe(true);
    expect(parserAccepts('[(]', 'u')).toBe(true);
    expect(parserAccepts('[(]', 'v')).toBe(false);
  });
});

const parseSet = (pattern: string): ClassNode => {
  const ast = parse(pattern, optionsFromFlags('v'));
  return ast.body.alternatives[0]!.items[0] as ClassNode;
};

describe('v flag: structure', () => {
  it('labels a set as a union, intersection or subtraction', () => {
    expect(parseSet('[a-z0-9]').operation).toBe('union');
    expect(parseSet('[\\p{L}&&\\p{ASCII}]').operation).toBe('intersection');
    expect(parseSet('[\\p{L}--[a-z]]').operation).toBe('subtraction');
  });

  it('keeps the operators in the item list with their offsets', () => {
    const set = parseSet('[\\p{L}--[a-z]]');
    const operator = set.items.find((item) => item.type === 'classOperator')!;
    expect([operator.start, operator.end]).toEqual([6, 8]);
  });

  it('reads \\q{} into its strings', () => {
    const set = parseSet('[\\q{abc|d|}]');
    const strings = set.items[0]!;
    expect(strings.type === 'classStrings' && strings.strings).toEqual(['abc', 'd', '']);
  });

  it('nests sets with their own operation', () => {
    const outer = parseSet('[[a-c]--[b]]');
    expect(outer.items.filter((i) => i.type === 'class')).toHaveLength(2);
  });

  it('is not confused by groups around sets', () => {
    const ast = parse('([a--b])', optionsFromFlags('v'));
    const group = ast.body.alternatives[0]!.items[0] as GroupNode;
    expect((group.body.alternatives[0]!.items[0] as ClassNode).operation).toBe('subtraction');
  });

  it('points at the offending operator for a mixed chain', () => {
    expect(() => parse('[a&&b--c]', optionsFromFlags('v'))).toThrowError(
      expect.objectContaining({ message: 'Invalid set operation in character class', position: 5 }),
    );
  });
});

const explainSet = (pattern: string): ExplainNode[] =>
  explain(parse(pattern, optionsFromFlags('v')), pattern, { flags: 'v' });

describe('v flag: explanation', () => {
  it('shows an intersection with its operands underneath, without separate operator rows', () => {
    const [set] = explainSet('[\\p{L}&&\\p{ASCII}]');
    expect(set!.title).toBe('Set Intersection');
    expect(set!.children.map((c) => c.source)).toEqual(['\\p{L}', '\\p{ASCII}']);
  });

  it('shows a subtraction with a nested set', () => {
    const [set] = explainSet('[\\p{L}--[aeiou]]');
    expect(set!.title).toBe('Set Subtraction');
    expect(set!.children.map((c) => c.title)).toEqual(['Unicode Property', 'Nested Set']);
  });

  it('explains string alternatives', () => {
    const [set] = explainSet('[\\q{abc|d}]');
    const strings = set!.children[0]!;
    expect(strings.title).toBe('String Alternatives');
    expect(strings.description).toContain('“abc”, “d”');
    expect(strings.description).toContain('Longer strings are tried first');
  });

  it('explains properties of strings', () => {
    const [row] = explainSet('\\p{RGI_Emoji}');
    expect(row!.title).toBe('Unicode Property of Strings');
  });

  it('marks a negated operation as negated', () => {
    const [set] = explainSet('[^\\p{L}--[a-z]]');
    expect(set!.title).toBe('Negated Set Subtraction');
  });
});

describe('v flag: RE2', () => {
  const issues = (pattern: string) => checkRe2(parse(pattern, optionsFromFlags('v')), 'v').map((i) => i.message);

  it('flags the flag, set operations, strings, string properties and nested sets', () => {
    expect(issues('[a&&b]').join('\n')).toMatch(/set operations/);
    expect(issues('[\\q{ab}]').join('\n')).toMatch(/string alternatives/);
    expect(issues('\\p{RGI_Emoji}').join('\n')).toMatch(/properties of strings/);
    expect(issues('[a[b]]').join('\n')).toMatch(/nested character classes/);
    expect(issues('a').join('\n')).toMatch(/unicodeSets/);
  });
});
