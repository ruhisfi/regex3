import { captureNames, type PatternNode } from './regex/ast';
import type { MatchResult } from './regex/engine';
import { explain, type ExplainNode } from './regex/explain';
import { Matcher } from './regex/matcher';
import { optionsFromFlags, parse, ParseError } from './regex/parser';
import { checkRe2, type Re2Issue } from './regex/re2Check';
import { findWarnings, type CodeWarning } from './regex/warnings';
import { Store } from './state/store';
import type { AppState } from './state/state';

/** Everything derived from the pattern and flags alone. Cheap enough to compute on every keystroke. */
export interface Syntax {
  pattern: string;
  ast: PatternNode | null;
  /** Message and optional offset of the problem to show the user, or `null` when the pattern compiles. */
  error: { message: string; position?: number } | null;
  /** Empty when there is no valid tree. */
  explanation: ExplainNode[];
  re2Issues: Re2Issue[];
  /** Valid for the engine, but trouble once the pattern is pasted into code. */
  warnings: CodeWarning[];
  names: ReadonlyMap<number, string>;
}

/** Output of running the pattern against the text. It lags behind `Syntax` by a worker round trip. */
export interface Results {
  pattern: string;
  flags: string;
  text: string;
  matches: MatchResult[];
  truncated: boolean;
  /** The text with the replacement applied, or `null` when the Replace tool is not in use. */
  replaced: string | null;
  error: string | null;
  timedOut: boolean;
  elapsedMs: number;
  busy: boolean;
}

const MATCH_LIMIT = 5000;

function cleanEngineMessage(message: string): string {
  return message.replace(/^Invalid regular expression: \/[\s\S]*\/[a-z]*: /, '').replace(/^Invalid flags supplied to RegExp constructor '.*'$/, 'Invalid flag combination');
}

export function analyseSyntax(pattern: string, flags: string, flavor: AppState['flavor']): Syntax {
  let ast: PatternNode | null = null;
  let parseError: ParseError | null = null;
  try {
    ast = parse(pattern, optionsFromFlags(flags));
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    parseError = e;
  }

  let engineMessage: string | null = null;
  try {
    new RegExp(pattern, flags);
  } catch (e) {
    engineMessage = e instanceof Error ? e.message : String(e);
  }

  // The engine has the final say on validity; our parser only supplies a position and friendlier wording.
  let error: Syntax['error'] = null;
  if (engineMessage !== null) {
    error = parseError
      ? { message: parseError.message, position: parseError.position }
      : { message: cleanEngineMessage(engineMessage) };
    ast = parseError ? null : ast;
  } else if (parseError) {
    ast = null;
  }

  return {
    pattern,
    ast,
    error,
    explanation: ast && !error ? explain(ast, pattern, { flags }) : [],
    re2Issues: ast && !error && flavor === 're2' ? checkRe2(ast, flags) : [],
    warnings: ast && !error ? findWarnings(pattern) : [],
    names: ast ? captureNames(ast) : new Map(),
  };
}

const EMPTY_RESULTS: Results = {
  pattern: '',
  flags: '',
  text: '',
  matches: [],
  truncated: false,
  replaced: null,
  error: null,
  timedOut: false,
  elapsedMs: 0,
  busy: false,
};

/** Watches the app state and publishes derived `syntax` and `results`. */
export class Analyzer {
  readonly syntax: Store<Syntax>;
  readonly results = new Store<Results>(EMPTY_RESULTS);
  private readonly matcher = new Matcher();
  private generation = 0;

  constructor(private readonly state: Store<AppState>) {
    const s = state.get();
    this.syntax = new Store(analyseSyntax(s.pattern, s.flags, s.flavor));
    this.run();

    state.subscribe((next, prev) => {
      if (next.pattern !== prev.pattern || next.flags !== prev.flags || next.flavor !== prev.flavor) {
        this.syntax.update(analyseSyntax(next.pattern, next.flags, next.flavor));
      }
      if (
        next.pattern !== prev.pattern ||
        next.flags !== prev.flags ||
        next.text !== prev.text ||
        next.replacement !== prev.replacement ||
        (next.tool === 'replace') !== (prev.tool === 'replace')
      ) {
        this.run();
      }
    });
  }

  private run(): void {
    const { pattern, flags, text, replacement, tool } = this.state.get();
    const generation = ++this.generation;
    const base = { ...EMPTY_RESULTS, pattern, flags, text };

    // `syntax` is always updated before this runs, since both are driven by the same state change.
    if (pattern === '' || this.syntax.get().error) {
      this.matcher.dispose();
      this.results.update({ ...base, busy: false });
      return;
    }

    this.results.update({ busy: true });
    const started = performance.now();
    void this.matcher
      .run({ pattern, flags, text, limit: MATCH_LIMIT, ...(tool === 'replace' && { replacement }) })
      .then((outcome) => {
        if (outcome === null || generation !== this.generation) return;
        const elapsedMs = performance.now() - started;
        if (!outcome.ok) {
          this.results.update({
            ...base,
            error: outcome.error,
            timedOut: 'timeout' in outcome,
            elapsedMs,
          });
          return;
        }
        this.results.update({
          ...base,
          matches: outcome.matches,
          truncated: outcome.truncated,
          replaced: outcome.replaced ?? null,
          elapsedMs,
        });
      });
  }
}
