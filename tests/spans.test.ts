import { describe, expect, it } from 'vitest';
import { renderSpans } from '../src/ui/spans';
import { tokenSpans } from '../src/ui/syntaxTokens';
import { optionsFromFlags, parse } from '../src/regex/parser';

const ZW = '​';

describe('renderSpans', () => {
  it('escapes HTML and appends the trailing zero-width space', () => {
    expect(renderSpans('a<b>&"', [])).toBe('a&lt;b&gt;&amp;&quot;' + ZW);
  });

  it('wraps a simple range', () => {
    expect(renderSpans('abcd', [{ start: 1, end: 3, className: 'x' }])).toBe('a<span class="x" data-s="1">bc</span>d' + ZW);
  });

  it('gives overlapping segments the classes of every covering span, in span order', () => {
    const html = renderSpans('abcd', [
      { start: 0, end: 3, className: 'outer' },
      { start: 1, end: 2, className: 'inner' },
    ]);
    expect(html).toBe(
      '<span class="outer" data-s="0">a</span><span class="outer inner" data-s="1">b</span><span class="outer" data-s="2">c</span>d' +
        ZW,
    );
  });

  it('draws zero-length spans as point markers before the character at that offset', () => {
    expect(renderSpans('ab', [{ start: 1, end: 1, className: 'pt' }])).toBe('a<span class="pt"></span>b' + ZW);
    expect(renderSpans('ab', [{ start: 2, end: 2, className: 'pt' }])).toBe('ab<span class="pt"></span>' + ZW);
  });

  it('clamps spans that run past the text', () => {
    expect(renderSpans('ab', [{ start: 1, end: 99, className: 'x' }])).toBe('a<span class="x" data-s="1">b</span>' + ZW);
  });

  it('keeps adjacent spans separate', () => {
    const html = renderSpans('abcd', [
      { start: 0, end: 2, className: 'a' },
      { start: 2, end: 4, className: 'b' },
    ]);
    expect(html).toBe('<span class="a" data-s="0">ab</span><span class="b" data-s="2">cd</span>' + ZW);
  });
});

describe('tokenSpans', () => {
  const spansFor = (pattern: string) =>
    tokenSpans(parse(pattern, optionsFromFlags(''))).map((s) => [pattern.slice(s.start, s.end), s.className]);

  it('colors parens by nesting depth, quantifiers, escapes and alternation', () => {
    expect(spansFor('(a|\\d+)')).toEqual([
      ['(', 'tk-paren tk-d0'],
      ['|', 'tk-alt'],
      ['\\d', 'tk-esc'],
      ['+', 'tk-quant'],
      [')', 'tk-paren tk-d0'],
    ]);
  });

  it('covers group prefixes like (?: and (?<name>', () => {
    expect(spansFor('(?<n>a)')[0]).toEqual(['(?<n>', 'tk-paren tk-d0']);
    expect(spansFor('((?:a))').map((s) => s[1])).toEqual(['tk-paren tk-d0', 'tk-paren tk-d1', 'tk-paren tk-d1', 'tk-paren tk-d0']);
  });

  it('marks set brackets, including the negation caret, and ranges', () => {
    expect(spansFor('[^a-z]')).toEqual([
      ['[^', 'tk-set'],
      ['a-z', 'tk-range'],
      [']', 'tk-set'],
    ]);
  });

  it('never produces overlapping spans', () => {
    const pattern = '^(?:[a-z0-9._-]+)@(?<host>[\\w.]+)\\.(com|org){1,2}?$';
    const spans = tokenSpans(parse(pattern, optionsFromFlags(''))).sort((a, b) => a.start - b.start);
    for (let i = 1; i < spans.length; i++) expect(spans[i]!.start).toBeGreaterThanOrEqual(spans[i - 1]!.end);
  });
});
