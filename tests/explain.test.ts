import { describe, expect, it } from 'vitest';
import { explain, describeQuantifier, type ExplainNode } from '../src/regex/explain';
import { optionsFromFlags, parse } from '../src/regex/parser';

function explainPattern(pattern: string, flags = ''): ExplainNode[] {
  return explain(parse(pattern, optionsFromFlags(flags)), pattern, { flags });
}

describe('explain', () => {
  it('describes the reference example: a capturing set followed by \\w+', () => {
    const tree = explainPattern('([A-Z])\\w+');
    expect(tree.map((n) => [n.source, n.title])).toEqual([
      ['([A-Z])', 'Capturing Group #1'],
      ['\\w', 'Word'],
      ['+', 'Quantifier'],
    ]);
    const set = tree[0]!.children[0]!;
    expect(set.title).toBe('Character Set');
    expect(set.children[0]!.title).toBe('Range');
    expect(set.children[0]!.description).toContain('code 65 to 90');
  });

  it('puts quantifier rows beside their atom with an exact source range', () => {
    const tree = explainPattern('ab{2,3}?');
    const quantifier = tree[2]!;
    expect([quantifier.start, quantifier.end, quantifier.source]).toEqual([2, 8, '{2,3}?']);
    expect(quantifier.description).toContain('As few as possible');
  });

  it('splits alternatives into rows with | separators', () => {
    const tree = explainPattern('cat|dog');
    expect(tree.map((n) => n.title)).toEqual(['Alternative 1', 'Alternation', 'Alternative 2']);
    expect(tree[1]!.start).toBe(3);
  });

  it('reflects flags in the description', () => {
    expect(explainPattern('.', 's')[0]!.description).toContain('including line breaks');
    expect(explainPattern('.')[0]!.description).toContain('except line breaks');
    expect(explainPattern('^', 'm')[0]!.description).toContain('line');
    expect(explainPattern('a', 'i')[0]!.description).toContain('case is ignored');
  });

  it('names lookaround and named groups', () => {
    expect(explainPattern('(?<=a)b')[0]!.title).toBe('Positive Lookbehind');
    expect(explainPattern('(?<id>\\d)')[0]!.title).toBe('Named Group “id” (#1)');
  });

  it('gives every node a range that lies inside the pattern', () => {
    const pattern = '^(?:[a-z0-9._-]+)@(?<host>[\\w.]+)\\.(com|org)$';
    const check = (nodes: ExplainNode[]) => {
      for (const n of nodes) {
        expect(pattern.slice(n.start, n.end)).toBe(n.source);
        check(n.children);
      }
    };
    check(explainPattern(pattern));
  });
});

describe('describeQuantifier', () => {
  it('handles the common shapes', () => {
    expect(describeQuantifier({ min: 0, max: Infinity, greedy: true })).toContain('zero or more');
    expect(describeQuantifier({ min: 3, max: 3, greedy: true })).toBe('Matches the preceding token exactly 3 times.');
    expect(describeQuantifier({ min: 1, max: 1, greedy: true })).toContain('exactly 1 time.');
    expect(describeQuantifier({ min: 2, max: Infinity, greedy: false })).toContain('lazy');
  });
});
