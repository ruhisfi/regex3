import { describe, expect, it } from 'vitest';
import { checkRe2 } from '../src/regex/re2Check';
import { optionsFromFlags, parse } from '../src/regex/parser';

const issues = (pattern: string, flags = '') => checkRe2(parse(pattern, optionsFromFlags(flags)), flags);

describe('checkRe2', () => {
  it('accepts plain patterns', () => {
    expect(issues('^[a-z]+(?:\\d{1,3})?[ \\t]*$', 'i')).toEqual([]);
  });

  it('notes the narrower meaning of \\s as information, not an error', () => {
    expect(issues('\\s').map((i) => i.severity)).toEqual(['info']);
  });

  it('rejects backreferences with their location', () => {
    const found = issues('(a)\\1');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'error', start: 3, end: 5 });
  });

  it('rejects lookaround of every kind', () => {
    for (const p of ['(?=a)', '(?!a)', '(?<=a)', '(?<!a)']) {
      expect(issues(p)).toHaveLength(1);
    }
  });

  it('rejects repetition counts above 1000', () => {
    expect(issues('a{1001}')).toHaveLength(1);
    expect(issues('a{2,1000}')).toEqual([]);
  });

  it('suggests \\x{...} for \\u escapes', () => {
    expect(issues('\\u00e9')[0]!.message).toContain('\\x{E9}');
  });

  it('flags unsupported flags without a range', () => {
    const found = issues('a', 'dy');
    expect(found.map((i) => i.start)).toEqual([undefined, undefined]);
  });

  it('rejects property name=value but accepts the short category form', () => {
    expect(issues('\\p{Script=Greek}', 'u')).toHaveLength(1);
    expect(issues('\\p{L}', 'u')).toEqual([]);
  });

  it('only reports the bell escape as a warning', () => {
    expect(issues('\\a')[0]!.severity).toBe('warning');
    expect(issues('\\q')[0]!.severity).toBe('error');
    expect(issues('\\.')).toEqual([]);
  });
});
