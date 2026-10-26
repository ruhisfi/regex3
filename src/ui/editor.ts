import { parseRegexLiteral, toRegexLiteral } from '../regex/literal';
import { FLAG_INFO, normalizeFlags } from '../state/state';
import { byId, clear, h } from './dom';
import { HighlightField } from './highlightField';
import { renderSpans, type Span } from './spans';
import { tokenSpans } from './syntaxTokens';
import type { Context, Range } from './context';

const FLAVOR_HINT: Record<'js' | 're2', string> = {
  js: 'JavaScript regular expressions.',
  re2: 'RE2 compatibility: flags what RE2 would reject. Matching still uses the JavaScript engine.',
};

/** What to do about each syntax error, matched by the start of its message. */
const FIX_HINTS: ReadonlyArray<[prefix: string, hint: string]> = [
  ['Unterminated group', 'Add a closing parenthesis.'],
  ['Unmatched', 'Remove it, or add the matching opening parenthesis.'],
  ['Unterminated character class', 'Add a closing bracket.'],
  ['Nothing to repeat', 'Put something before it to repeat, or escape it with a backslash.'],
  ['Range out of order', 'Swap the two ends of the range.'],
  ['Numbers out of order', 'Make the first number the smaller one.'],
  ['Invalid escape', 'Remove the backslash, or turn off the u flag.'],
  ['Invalid Unicode escape', 'Use \\uHHHH or, with the u flag, \\u{H…}.'],
  ['Invalid class escape', 'Remove the backslash, or turn off the u flag.'],
  ['Duplicate capture group name', 'Give every group its own name.'],
  ['\\ at end', 'Add a character after the backslash, or write it as \\\\.'],
  ['Lone quantifier brackets', 'Escape the brace with a backslash.'],
  ['Incomplete quantifier', 'Complete it, such as {2,5}, or escape the brace.'],
  ['Invalid group', 'Use (?:…) for a plain group or (?<name>…) for a named one.'],
  ['Invalid capture group name', 'Names start with a letter and use only letters, digits, _ and $.'],
  ['Invalid named reference', 'Use \\k<name> with the name of an existing group.'],
  ['Invalid property name', 'Use \\p{Name} or \\p{Name=Value} with a valid Unicode property.'],
  ['Invalid flag', 'Turn off either u or v. They cannot be combined.'],
  ['Invalid set operation', 'Use either && or -- in one set, not both. Each side must be one character, an escape or a nested set, not a range or a list.'],
  ['Invalid character in character class', 'With the v flag, escape ( ) [ ] { } / - | and doubled punctuation such as !! with a backslash.'],
  ['Invalid character class', 'A range needs a single character on each side. Escapes like \\d cannot be range ends.'],
  ['Negated character class may contain strings', 'A negated set cannot hold \\q{…} strings longer than one character, or properties like \\p{RGI_Emoji}.'],
  ['Unterminated string alternatives', 'Add the closing brace after the last string.'],
];

function fixHint(message: string): string {
  return FIX_HINTS.find(([prefix]) => message.startsWith(prefix))?.[1] ?? 'Edit the highlighted part to fix it.';
}

/** The pattern line, its flags, and the flavor switch. */
export function mountEditor(ctx: Context): {
  insertAtCaret(token: string): void;
  selectRange(range: Range): void;
} {
  const { state, analyzer, highlights } = ctx;

  const field = new HighlightField(
    {
      id: 'pattern-input',
      placeholder: 'e.g. \\b(\\w+)@(\\w+)\\.com\\b…',
      autoGrow: true,
      className: 'hf-pattern',
    },
    (pattern) => state.update({ pattern }),
  );
  byId('pattern-field').append(field.root);

  // Pasting a whole literal such as /\d+/gi fills in the pattern and the flags. Copying the whole pattern gives
  // the literal back, with its slashes and flags, ready for code. A partial selection copies and pastes as plain text.
  const everythingSelected = () => {
    const { value, selectionStart, selectionEnd } = field.input;
    return selectionStart === 0 && selectionEnd === value.length;
  };
  field.input.addEventListener('paste', (event) => {
    const literal = parseRegexLiteral(event.clipboardData?.getData('text/plain') ?? '');
    if (!literal || !everythingSelected()) return;
    event.preventDefault();
    state.update(literal);
  });
  const copyAsLiteral = (event: ClipboardEvent): boolean => {
    if (field.value === '' || !everythingSelected()) return false;
    event.clipboardData?.setData('text/plain', toRegexLiteral(field.value, state.get().flags));
    event.preventDefault();
    return true;
  };
  field.input.addEventListener('copy', copyAsLiteral);
  field.input.addEventListener('cut', (event) => {
    if (copyAsLiteral(event)) state.update({ pattern: '' });
  });

  const status = byId('pattern-status');
  const flagSummary = byId('flag-summary');

  function renderMirror(): void {
    const { pattern } = state.get();
    const syntax = analyzer.syntax.get();
    const spans: Span[] = [];

    if (syntax.ast) spans.push(...tokenSpans(syntax.ast));
    for (const issue of syntax.re2Issues) {
      if (issue.start !== undefined && issue.end !== undefined) {
        spans.push({ start: issue.start, end: issue.end, className: `issue issue-${issue.severity}` });
      }
    }
    for (const warning of syntax.warnings) {
      spans.push({ start: warning.start, end: warning.end, className: 'issue issue-warning' });
    }
    if (syntax.error?.position !== undefined) {
      const at = syntax.error.position;
      spans.push(
        at < pattern.length
          ? { start: at, end: at + 1, className: 'err' }
          : { start: at, end: at, className: 'err-end' },
      );
    }
    const hover = highlights.get().pattern;
    if (hover) spans.push({ ...hover, className: 'hl-hover' });

    field.setMirrorHtml(renderSpans(pattern, spans));
  }

  /** Status lines always carry a text label, so meaning never depends on color alone. */
  function say(kind: 'error' | 'warn' | 'info', label: string, message: string): void {
    status.className = `status status-line${kind === 'info' ? '' : ` status-${kind}`}`;
    clear(status);
    status.append(h('strong', {}, `${label}: `), message);
  }

  function renderStatus(): void {
    const syntax = analyzer.syntax.get();
    const { pattern, flavor } = state.get();
    clear(status);
    status.className = 'status status-line';

    if (syntax.error) {
      const where = syntax.error.position !== undefined ? ` at position ${syntax.error.position + 1}` : '';
      say('error', 'Error', `${syntax.error.message}${where}. ${fixHint(syntax.error.message)}`);
    } else {
      const re2 = pattern !== '' && flavor === 're2';
      const errors = syntax.re2Issues.filter((i) => i.severity === 'error').length;
      const others = syntax.re2Issues.length - errors;
      if (re2 && syntax.re2Issues.length > 0) {
        say(
          errors > 0 ? 'error' : 'warn',
          'RE2',
          `${errors} ${errors === 1 ? 'Error' : 'Errors'} & ${others} ${others === 1 ? 'Note' : 'Notes'}. Open Explain for details. Matching still runs on the JavaScript engine.`,
        );
      } else if (syntax.warnings.length > 0) {
        const [first, ...rest] = syntax.warnings;
        say('warn', 'Warning', `${first!.message}${rest.length > 0 ? ` ${rest.length} more in Explain.` : ''}`);
      } else if (re2) {
        say('info', 'RE2', 'No incompatibilities found. Matching still runs on the JavaScript engine.');
      }
    }
  }

  // Flags
  const flagsEl = byId('flags');
  const flagButtons = new Map<string, HTMLButtonElement>();
  for (const info of FLAG_INFO) {
    const button = h(
      'button',
      {
        type: 'button',
        class: 'flag',
        title: info.hint,
        onclick: () => {
          const current = state.get().flags;
          const next = current.includes(info.flag) ? current.replace(info.flag, '') : current + info.flag;
          state.update({ flags: normalizeFlags(next) });
        },
      },
      h('span', { class: 'flag-key', translate: 'no' }, info.flag),
      info.name,
    );
    flagButtons.set(info.flag, button);
    flagsEl.append(button);
  }
  function renderFlags(): void {
    const { flags } = state.get();
    for (const [flag, button] of flagButtons) button.setAttribute('aria-pressed', String(flags.includes(flag)));
    flagSummary.textContent = flags;
  }

  // Flavor switch
  const flavorEl = byId('flavor');
  clear(flavorEl);
  const flavorButtons = (['js', 're2'] as const).map((flavor) =>
    h(
      'button',
      {
        type: 'button',
        class: 'seg',
        title: FLAVOR_HINT[flavor],
        'aria-label': flavor === 'js' ? 'JavaScript flavor' : 'RE2 compatibility flavor',
        onclick: () => state.update({ flavor }),
      },
      flavor === 'js' ? 'JS' : 'RE2',
    ),
  );
  flavorEl.append(...flavorButtons);
  function renderFlavor(): void {
    const { flavor } = state.get();
    flavorButtons.forEach((button, i) => button.setAttribute('aria-pressed', String((i === 0) === (flavor === 'js'))));
  }

  state.subscribe((next, prev) => {
    if (next.pattern !== prev.pattern) field.setValue(next.pattern);
    if (next.flags !== prev.flags) renderFlags();
    if (next.flavor !== prev.flavor) renderFlavor();
    if (next.pattern !== prev.pattern || next.flavor !== prev.flavor) renderStatus();
  });
  analyzer.syntax.subscribe(() => {
    renderMirror();
    renderStatus();
  });
  highlights.subscribe((next, prev) => {
    if (next.pattern !== prev.pattern) renderMirror();
  });

  field.setValue(state.get().pattern);
  renderMirror();
  renderStatus();
  renderFlags();
  renderFlavor();

  // Autofocus only where there is a hardware keyboard; on touch screens it would cover half the page.
  if (window.matchMedia('(pointer: fine)').matches) field.focus();

  return {
    insertAtCaret: (token) => field.insertAtCaret(token),
    selectRange: (range) => field.selectRange(range.start, range.end),
  };
}
