import { describe, expect, it } from 'vitest';
import { parseRegexLiteral, toRegexLiteral, unescapedSlashes } from '../src/regex/literal';
import { findWarnings } from '../src/regex/warnings';

describe('parseRegexLiteral', () => {
  it('splits a literal into pattern and flags', () => {
    expect(parseRegexLiteral('/\\b(?<word>[A-Z][a-z]+)\\b\\s/gi')).toEqual({
      pattern: '\\b(?<word>[A-Z][a-z]+)\\b\\s',
      flags: 'gi',
    });
  });

  it('reads a literal without flags as having none', () => {
    expect(parseRegexLiteral('/abc/')).toEqual({ pattern: 'abc', flags: '' });
  });

  it('ignores whitespace around the literal and keeps escaped slashes in the pattern', () => {
    expect(parseRegexLiteral('  /a\\/b/g \n')).toEqual({ pattern: 'a\\/b', flags: 'g' });
  });

  it('allows a bare slash inside a character class, as a literal does', () => {
    expect(parseRegexLiteral('/[/]x/')).toEqual({ pattern: '[/]x', flags: '' });
  });

  it('puts flags in canonical order and lets v replace u', () => {
    expect(parseRegexLiteral('/a/yig')?.flags).toBe('giy');
    expect(parseRegexLiteral('/a/uv')?.flags).toBe('v');
  });

  it('rejects text that is not a literal', () => {
    expect(parseRegexLiteral('abc')).toBeNull();
    expect(parseRegexLiteral('//')).toBeNull();
    expect(parseRegexLiteral('/abc')).toBeNull();
    expect(parseRegexLiteral('/usr/bin/')).toBeNull(); // a path, with a bare slash inside
    expect(parseRegexLiteral('/a/gg')).toBeNull(); // repeated flag
    expect(parseRegexLiteral('/a/gx')).toBeNull(); // unknown flag
    expect(parseRegexLiteral('/a\nb/')).toBeNull(); // line break
  });

  it('finds the end of the literal the way JavaScript does, whatever the flags', () => {
    // The first `]` closes the class for the tokenizer, so the slash after it is bare even where v nests sets.
    expect(parseRegexLiteral('/[[a]/]/v')).toBeNull();
    expect(parseRegexLiteral('/[[a\\]/]/v')).not.toBeNull();
  });
});

describe('toRegexLiteral', () => {
  it('adds the slashes and flags', () => {
    expect(toRegexLiteral('\\d+', 'gi')).toBe('/\\d+/gi');
    expect(toRegexLiteral('abc', '')).toBe('/abc/');
  });

  it('escapes bare slashes but not escaped ones or ones in a set', () => {
    expect(toRegexLiteral('a/b', 'g')).toBe('/a\\/b/g');
    expect(toRegexLiteral('a\\/b', 'g')).toBe('/a\\/b/g');
    expect(toRegexLiteral('[/]', 'g')).toBe('/[/]/g');
    expect(toRegexLiteral('\\\\/', '')).toBe('/\\\\\\//'); // an escaped backslash, then a bare slash
  });

  it('writes raw line breaks as escapes', () => {
    expect(toRegexLiteral('a\nb', '')).toBe('/a\\nb/');
    expect(toRegexLiteral('a\\\nb', '')).toBe('/a\\nb/'); // a backslash before a line break already meant that line break
    expect(toRegexLiteral(`x${String.fromCharCode(0x2028)}y`, '')).toBe('/x\\u2028y/');
  });

  it('round-trips: what is copied out can be pasted back in', () => {
    for (const [pattern, flags] of [
      ['\\b(?<word>[A-Z][a-z]+)\\b\\s', 'gi'],
      ['a/b', 'g'],
      ['[/\\]]+', ''],
      ['x\ny', 'm'],
      ['[[\\/]--[a]]', 'v'],
      ['[[a]\\/]', 'v'],
    ] as const) {
      const back = parseRegexLiteral(toRegexLiteral(pattern, flags));
      expect(back).not.toBeNull();
      // The pattern may come back spelled differently (\/ for /, \n for a raw line break) but must mean the same.
      const original = new RegExp(pattern, flags);
      const again = new RegExp(back!.pattern, back!.flags);
      expect(again.flags).toBe(original.flags);
      for (const sample of ['a/b', 'Hello world ', 'x\ny', '/]', 'a']) {
        expect(again.exec(sample)?.[0]).toBe(original.exec(sample)?.[0]);
      }
    }
  });
});

describe('unescapedSlashes', () => {
  it('reports offsets of bare slashes outside sets', () => {
    expect(unescapedSlashes('a/b\\/c/d')).toEqual([1, 6]);
    expect(unescapedSlashes('[/a]/')).toEqual([4]);
    expect(unescapedSlashes('\\\\/')).toEqual([2]);
  });
});

describe('findWarnings', () => {
  it('flags an unescaped slash, including one that is quantified or grouped', () => {
    const found = findWarnings('a/b');
    expect(found.map((w) => [w.start, w.end])).toEqual([[1, 2]]);
    expect(found[0]!.message).toContain('Unescaped “/”');
    expect(findWarnings('a/+')).toHaveLength(1);
    expect(findWarnings('(a/)')).toHaveLength(1);
  });

  it('leaves escaped slashes and slashes inside sets alone', () => {
    expect(findWarnings('a\\/b')).toEqual([]);
    expect(findWarnings('[/]')).toEqual([]);
    expect(findWarnings('[+-/]')).toEqual([]);
  });

  it('agrees with the tokenizer about sets, including nested v-flag sets', () => {
    expect(findWarnings('[[a]/]').map((w) => w.start)).toEqual([4]);
  });

  it('flags raw line breaks', () => {
    const found = findWarnings('a\nb');
    expect(found.map((w) => [w.start, w.end])).toEqual([[1, 2]]);
    expect(found[0]!.message).toContain('raw line feed');
  });

  it('reports warnings in pattern order', () => {
    expect(findWarnings('a\n/').map((w) => w.start)).toEqual([1, 2]);
  });
});
