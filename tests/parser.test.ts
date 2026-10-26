import { describe, expect, it } from 'vitest';
import { optionsFromFlags, parse, ParseError } from '../src/regex/parser';
import type { GroupNode, QuantifierNode } from '../src/regex/ast';

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

const corpus: Array<[string, string]> = [
  ['abc', ''],
  ['a|b|', ''],
  ['(?:a|b)+c', ''],
  ['([A-Z])\\w+', 'g'],
  ['^\\d{3}-\\d{4}$', ''],
  ['a{2,}', ''],
  ['a{,2}', ''],
  ['a{2', ''],
  ['x{1,2}?', ''],
  ['(?<year>\\d{4})-(?<month>\\d{2})', ''],
  ['(?<n>a)\\k<n>', ''],
  ['\\k<n>', ''],
  ['\\k', ''],
  ['(a)\\1', ''],
  ['\\1(a)', ''],
  ['\\2(a)', ''],
  ['\\8', ''],
  ['[\\1]', ''],
  ['(?=a)b', ''],
  ['(?!a)b', ''],
  ['(?<=a)b', ''],
  ['(?<!a)b', ''],
  ['(?=a)*', ''],
  ['(?<=a)*', ''],
  ['(?=a)*', 'u'],
  ['[a-z]', ''],
  ['[z-a]', ''],
  ['[\\d-z]', ''],
  ['[\\d-z]', 'u'],
  ['[a-\\d]', ''],
  ['[^]', ''],
  ['[]', ''],
  ['[\\b]', ''],
  ['[\\B]', ''],
  ['[\\B]', 'u'],
  ['\\p{L}', 'u'],
  ['\\p{Script=Greek}', 'u'],
  ['\\p{L}', ''],
  ['\\P{Lu}+', 'u'],
  ['\\u{1F600}', 'u'],
  ['\\u{1F600}', ''],
  ['\\u00e9', ''],
  ['\\ud83d\\ude00', 'u'],
  ['\\xZZ', ''],
  ['\\xZZ', 'u'],
  ['\\cA', ''],
  ['\\c', ''],
  ['\\c', 'u'],
  ['\\0', ''],
  ['\\00', ''],
  ['\\00', 'u'],
  ['\\377', ''],
  ['\\400', ''],
  ['\\a', ''],
  ['\\a', 'u'],
  ['\\-', ''],
  ['\\-', 'u'],
  ['[\\-]', 'u'],
  ['*a', ''],
  ['a**', ''],
  ['a*+', ''],
  ['a+?', ''],
  ['a??', ''],
  ['^*', ''],
  ['$+', ''],
  ['\\b+', ''],
  ['(', ''],
  [')', ''],
  ['(a', ''],
  ['a)', ''],
  ['[a', ''],
  ['a]', ''],
  ['a]', 'u'],
  ['}', ''],
  ['}', 'u'],
  ['{', ''],
  ['{', 'u'],
  ['{1}', ''],
  ['a{1}{2}', ''],
  ['\\', ''],
  ['(?<a>x)(?<a>y)', ''],
  ['(?<1a>x)', ''],
  ['(?<a', ''],
  ['(?i:a)b', ''],
  ['(?i-s:a)', ''],
  ['(?-i:a)', ''],
  ['(?:)', ''],
  ['(?', ''],
  ['(?x)', ''],
  ['[\\w&&\\d]', 'v'],
  ['[[a-z]--[aeiou]]', 'v'],
  ['[\\p{L}&&\\p{ASCII}]', 'v'],
  ['😀+', 'u'],
  ['[😀-😎]', 'u'],
  ['.', 's'],
  ['(a)|(b)', ''],
  ['((a)(b))', ''],
  ['(?:(a)|b)*', ''],
];

// Modifier groups such as (?i:a) are newer than some supported Node versions. Their engine rejects the syntax while
// the parser, which is meant to read current JavaScript, accepts it, so comparing the two there would only fail.
const engineHasModifiers = nativeAccepts('(?i:a)', '');
const usesModifiers = (pattern: string) => /\(\?(?:[ims]+|[ims]*-[ims]+):/.test(pattern);

describe('parser agrees with the native engine', () => {
  for (const [pattern, flags] of corpus) {
    it.skipIf(usesModifiers(pattern) && !engineHasModifiers)(`/${pattern}/${flags}`, () => {
      expect(parserAccepts(pattern, flags)).toBe(nativeAccepts(pattern, flags));
    });
  }
});

describe('AST shape', () => {
  it('records source ranges', () => {
    const ast = parse('(a)b+', optionsFromFlags(''));
    const seq = ast.body.alternatives[0]!;
    expect(seq.items).toHaveLength(2);
    const [group, quant] = seq.items as [GroupNode, QuantifierNode];
    expect([group.start, group.end]).toEqual([0, 3]);
    expect([quant.start, quant.end]).toEqual([3, 5]);
    expect(quant.min).toBe(1);
    expect(quant.max).toBe(Infinity);
    expect(quant.greedy).toBe(true);
  });

  it('numbers capturing groups in order of their opening paren', () => {
    const ast = parse('((a)(?<n>b))(?:c)', optionsFromFlags(''));
    expect(ast.groupCount).toBe(3);
    expect(ast.groupNames).toEqual(['n']);
    const outer = ast.body.alternatives[0]!.items[0] as GroupNode;
    expect(outer.index).toBe(1);
    const inner = outer.body.alternatives[0]!.items as GroupNode[];
    expect(inner[0]!.index).toBe(2);
    expect(inner[1]!.index).toBe(3);
    expect(inner[1]!.name).toBe('n');
  });

  it('treats a lazy quantifier as non-greedy', () => {
    const ast = parse('a{2,5}?', optionsFromFlags(''));
    const quant = ast.body.alternatives[0]!.items[0] as QuantifierNode;
    expect([quant.min, quant.max, quant.greedy]).toEqual([2, 5, false]);
  });

  it('reports the position of a syntax error', () => {
    expect(() => parse('ab(c', optionsFromFlags(''))).toThrowError(
      expect.objectContaining({ message: 'Unterminated group', position: 2 }),
    );
    expect(() => parse('a**', optionsFromFlags(''))).toThrowError(expect.objectContaining({ position: 2 }));
  });

  it('explains possessive quantifiers in the error', () => {
    expect(() => parse('a*+', optionsFromFlags(''))).toThrowError(/possessive/);
  });
});
