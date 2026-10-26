import { describe, expect, it } from 'vitest';
import { execute } from '../src/regex/engine';

const run = (pattern: string, flags: string, text: string, replacement?: string) =>
  execute({ pattern, flags, text, limit: 1000, ...(replacement !== undefined && { replacement }) });

describe('execute', () => {
  it('returns every match for a global pattern', () => {
    const r = run('\\d+', 'g', 'a1 b22 c333');
    expect(r.ok && r.matches.map((m) => [m.index, m.end, m.value])).toEqual([
      [1, 2, '1'],
      [4, 6, '22'],
      [8, 11, '333'],
    ]);
  });

  it('returns only the first match without the g flag', () => {
    const r = run('\\d+', '', 'a1 b22');
    expect(r.ok && r.matches).toHaveLength(1);
  });

  it('reports capture group offsets, including unmatched groups', () => {
    const r = run('(a)|(b)', 'g', 'b');
    expect(r.ok && r.matches[0]!.groups).toEqual([
      { index: 1, value: undefined, start: undefined, end: undefined },
      { index: 2, value: 'b', start: 0, end: 1 },
    ]);
  });

  it('advances past empty matches', () => {
    const r = run('x*', 'g', 'ab');
    expect(r.ok && r.matches).toHaveLength(3);
  });

  it('truncates at the match limit', () => {
    const r = execute({ pattern: 'a', flags: 'g', text: 'aaaaa', limit: 2 });
    expect(r.ok && [r.matches.length, r.truncated]).toEqual([2, true]);
  });

  it('reports the engine error for an invalid pattern', () => {
    const r = run('(', '', 'x');
    expect(r.ok).toBe(false);
  });

  it('applies a replacement template with native semantics', () => {
    const r = run('(?<w>\\w+)@(\\w+)', 'g', 'me@home you@work', '$2:$<w>');
    expect(r.ok && r.replaced).toBe('home:me work:you');
  });

  it('does not mutate results when the d flag is already present', () => {
    const r = run('a', 'gd', 'a');
    expect(r.ok && r.matches).toHaveLength(1);
  });
});
