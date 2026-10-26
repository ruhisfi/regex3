import { describe, expect, it } from 'vitest';
import { execute } from '../src/regex/engine';
import { expandTemplate } from '../src/regex/replace';
import { captureNames } from '../src/regex/ast';
import { optionsFromFlags, parse } from '../src/regex/parser';

function expandFirst(pattern: string, text: string, template: string): string {
  const result = execute({ pattern, flags: '', text, limit: 10 });
  if (!result.ok) throw new Error(result.error);
  const names = captureNames(parse(pattern, optionsFromFlags('')));
  return expandTemplate(template, result.matches[0]!, text, names);
}

describe('expandTemplate', () => {
  it('expands the special patterns', () => {
    expect(expandFirst('b(c)', 'abcd', '[$&|$`|$\'|$1|$$]')).toBe('[bc|a|d|c|$]');
  });

  it('prefers two-digit references only when that group exists', () => {
    expect(expandFirst('(a)', 'a', '$10')).toBe('a0');
    expect(expandFirst('(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)', 'abcdefghij', '$10')).toBe('j');
  });

  it('leaves out-of-range references untouched', () => {
    expect(expandFirst('(a)', 'a', '$2 $0')).toBe('$2 $0');
  });

  it('expands named references and empties unmatched groups', () => {
    expect(expandFirst('(?<x>a)|(?<y>b)', 'a', '<$<x>|$<y>>')).toBe('<a|>');
  });

  it('keeps $< literal when the pattern has no named groups', () => {
    expect(expandFirst('a', 'a', '$<x>')).toBe('$<x>');
  });

  it('matches the native replace for the same template', () => {
    const text = 'john smith';
    const template = '$2, $1 ($&)';
    const native = text.replace(/(\w+) (\w+)/, template);
    expect(expandFirst('(\\w+) (\\w+)', text, template)).toBe(native);
  });
});
