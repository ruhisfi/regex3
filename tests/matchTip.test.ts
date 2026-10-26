import { describe, expect, it } from 'vitest';
import { execute, type MatchResult } from '../src/regex/engine';
import { findMatchAt, groupAt } from '../src/ui/matchTip';

function matchesFor(pattern: string, text: string, flags = 'g'): MatchResult[] {
  const result = execute({ pattern, flags, text, limit: 10000 });
  if (!result.ok) throw new Error(result.error);
  return result.matches;
}

describe('findMatchAt', () => {
  const text = 'ab 12 cd 345';
  const matches = matchesFor('\\d+', text);

  it('finds the match that covers an offset', () => {
    expect(findMatchAt(matches, 3)).toBe(0);
    expect(findMatchAt(matches, 4)).toBe(0);
    expect(findMatchAt(matches, 9)).toBe(1);
    expect(findMatchAt(matches, 11)).toBe(1);
  });

  it('treats the end of a match as outside it', () => {
    expect(findMatchAt(matches, 5)).toBe(-1);
    expect(findMatchAt(matches, 12)).toBe(-1);
  });

  it('returns -1 between matches, before the first and with no matches', () => {
    expect(findMatchAt(matches, 0)).toBe(-1);
    expect(findMatchAt(matches, 7)).toBe(-1);
    expect(findMatchAt([], 3)).toBe(-1);
  });

  it('ignores empty matches', () => {
    expect(findMatchAt(matchesFor('x*', 'ab'), 1)).toBe(-1);
  });

  it('works across many matches', () => {
    const many = matchesFor('a', 'a'.repeat(5000));
    expect(findMatchAt(many, 0)).toBe(0);
    expect(findMatchAt(many, 2500)).toBe(2500);
    expect(findMatchAt(many, 4999)).toBe(4999);
  });
});

describe('groupAt', () => {
  const [match] = matchesFor('(?<year>(\\d\\d)\\d\\d)-(\\d\\d)', 'on 2024-05');

  it('returns the innermost group covering the offset', () => {
    expect(groupAt(match!, 3)?.index).toBe(2); // the first "20" is in both group 1 and group 2
    expect(groupAt(match!, 5)?.index).toBe(1); // "24" is only in group 1
    expect(groupAt(match!, 8)?.index).toBe(3);
  });

  it('returns null outside every group', () => {
    expect(groupAt(match!, 7)).toBeNull(); // the hyphen
  });

  it('skips groups that did not take part', () => {
    const [m] = matchesFor('(a)|(b)', 'b');
    expect(groupAt(m!, 0)?.index).toBe(2);
  });

  it('prefers the later group when two cover exactly the same text', () => {
    const [m] = matchesFor('((a))', 'a');
    expect(groupAt(m!, 0)?.index).toBe(2);
  });
});
