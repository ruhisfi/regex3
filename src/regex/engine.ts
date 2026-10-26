export interface CaptureGroup {
  /** 1-based group number. */
  index: number;
  value: string | undefined;
  start: number | undefined;
  end: number | undefined;
}

export interface MatchResult {
  index: number;
  end: number;
  value: string;
  groups: CaptureGroup[];
}

export type ExecuteResult =
  | { ok: true; matches: MatchResult[]; truncated: boolean; replaced?: string }
  | { ok: false; error: string };

export interface ExecuteRequest {
  pattern: string;
  flags: string;
  text: string;
  /** Maximum number of matches to collect before stopping. */
  limit: number;
  /** When present, `replaced` in the result holds `text` with the replacement template applied. */
  replacement?: string;
}

/** Runs a pattern on the native engine. Everything here is synchronous and may be slow for pathological patterns. */
export function execute(request: ExecuteRequest): ExecuteResult {
  const { pattern, flags, text, limit, replacement } = request;

  let regex: RegExp;
  try {
    // `d` gives us group offsets without recomputing them.
    regex = new RegExp(pattern, flags.includes('d') ? flags : flags + 'd');
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const matches: MatchResult[] = [];
  let truncated = false;

  if (regex.global) {
    for (const m of text.matchAll(regex)) {
      if (matches.length >= limit) {
        truncated = true;
        break;
      }
      matches.push(toMatchResult(m));
    }
  } else {
    const m = regex.exec(text);
    if (m) matches.push(toMatchResult(m));
  }

  const result: ExecuteResult = { ok: true, matches, truncated };
  if (replacement !== undefined) {
    regex.lastIndex = 0;
    result.replaced = text.replace(regex, replacement);
  }
  return result;
}

function toMatchResult(m: RegExpExecArray | RegExpMatchArray): MatchResult {
  const indices = (m as RegExpExecArray).indices;
  const index = m.index ?? 0;
  const groups: CaptureGroup[] = [];
  for (let i = 1; i < m.length; i++) {
    const span = indices?.[i];
    groups.push({ index: i, value: m[i], start: span?.[0], end: span?.[1] });
  }
  return { index, end: index + m[0].length, value: m[0], groups };
}
