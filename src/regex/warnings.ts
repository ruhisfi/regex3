import { unescapedSlashes } from './literal';

/** Something the engine accepts but that breaks or surprises once the pattern is used in real code. */
export interface CodeWarning {
  message: string;
  start: number;
  end: number;
}

const LINE_BREAK_NAMES: Record<string, string> = {
  '\n': 'line feed',
  '\r': 'carriage return',
  [String.fromCharCode(0x2028)]: 'line separator',
  [String.fromCharCode(0x2029)]: 'paragraph separator',
};

export function findWarnings(pattern: string): CodeWarning[] {
  const warnings: CodeWarning[] = [];

  for (const at of unescapedSlashes(pattern)) {
    warnings.push({
      message:
        'Unescaped “/”. A regex literal ends at the first unescaped slash, so write it as \\/ if you use this pattern in code.',
      start: at,
      end: at + 1,
    });
  }

  for (let i = 0; i < pattern.length; i++) {
    const name = LINE_BREAK_NAMES[pattern[i]!];
    if (name) {
      warnings.push({
        message: `A raw ${name} in the pattern. A regex literal cannot contain one, so write it as an escape such as \\n.`,
        start: i,
        end: i + 1,
      });
    }
  }

  return warnings.sort((a, b) => a.start - b.start);
}
