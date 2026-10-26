import type { MatchResult } from './engine';

/**
 * Expands a replacement template for one match, following `String.prototype.replace` semantics:
 * `$$`, `$&`, `` $` ``, `$'`, `$n`, `$nn` and `$<name>`.
 */
export function expandTemplate(
  template: string,
  match: MatchResult,
  text: string,
  names: ReadonlyMap<number, string>,
): string {
  const groupCount = match.groups.length;
  const hasNamed = names.size > 0;
  let out = '';

  for (let i = 0; i < template.length; i++) {
    const c = template[i]!;
    if (c !== '$' || i === template.length - 1) {
      out += c;
      continue;
    }

    const next = template[i + 1]!;
    if (next === '$') {
      out += '$';
      i++;
    } else if (next === '&') {
      out += match.value;
      i++;
    } else if (next === '`') {
      out += text.slice(0, match.index);
      i++;
    } else if (next === "'") {
      out += text.slice(match.end);
      i++;
    } else if (next >= '0' && next <= '9') {
      const two = template.slice(i + 1, i + 3);
      const twoDigit = /^\d\d$/.test(two) ? Number(two) : 0;
      if (twoDigit >= 1 && twoDigit <= groupCount) {
        out += match.groups[twoDigit - 1]!.value ?? '';
        i += 2;
      } else if (Number(next) >= 1 && Number(next) <= groupCount) {
        out += match.groups[Number(next) - 1]!.value ?? '';
        i++;
      } else {
        out += c;
      }
    } else if (next === '<' && hasNamed) {
      const close = template.indexOf('>', i + 2);
      if (close === -1) {
        out += c;
        continue;
      }
      const name = template.slice(i + 2, close);
      for (const [index, groupName] of names) {
        if (groupName === name) out += match.groups[index - 1]?.value ?? '';
      }
      i = close;
    } else {
      out += c;
    }
  }
  return out;
}
