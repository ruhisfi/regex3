import { byId } from './dom';
import { HighlightField } from './highlightField';
import { describeMatch, findMatchAt, groupAt, MatchTip } from './matchTip';
import { renderSpans, type Span } from './spans';
import type { Context, Range } from './context';

/** Only the first matches get per-group underlines, to keep the highlight layer cheap on huge result sets. */
const GROUP_DECORATION_LIMIT = 300;

/** A spinner or busy message that flashes for a few milliseconds is worse than none, so it waits this long. */
const BUSY_DELAY_MS = 150;

const numbers = new Intl.NumberFormat();

export function mountTestText(ctx: Context): { selectRange(range: Range): void } {
  const { state, analyzer, highlights } = ctx;

  const field = new HighlightField(
    { id: 'text-input', placeholder: 'Paste or type the text to test against…', className: 'hf-text' },
    (text) => state.update({ text }),
  );
  byId('text-field').append(field.root);
  const summary = byId('match-summary');

  // Hovering a match outlines it and shows its details beside the pointer.
  const tip = new MatchTip();
  let pointer: { x: number; y: number } | null = null;
  let frame = 0;
  let hoveredMatch = -1;
  let ownsHighlight = false;

  function clearHover(): void {
    cancelAnimationFrame(frame);
    frame = 0;
    pointer = null;
    hoveredMatch = -1;
    tip.hide();
    if (ownsHighlight) {
      ownsHighlight = false;
      highlights.update({ text: null });
    }
  }

  function updateHover(): void {
    frame = 0;
    if (!pointer) return;
    const results = analyzer.results.get();
    if (results.text !== state.get().text) return clearHover();

    const offset = field.segmentAt(pointer.x, pointer.y, '.m');
    const index = offset === null ? -1 : findMatchAt(results.matches, offset);
    if (offset === null || index === -1) return clearHover();

    const match = results.matches[index]!;
    if (index !== hoveredMatch) {
      hoveredMatch = index;
      ownsHighlight = true;
      highlights.update({ text: { start: match.index, end: match.end } });
    }
    tip.show(describeMatch(match, index + 1, analyzer.syntax.get().names, groupAt(match, offset)), pointer.x, pointer.y);
  }

  field.input.addEventListener('pointermove', (event) => {
    // Only a resting mouse: a held button means a selection is being dragged, and touch has no hover.
    if (event.pointerType !== 'mouse' || event.buttons !== 0) return clearHover();
    pointer = { x: event.clientX, y: event.clientY };
    frame ||= requestAnimationFrame(updateHover);
  });
  for (const type of ['pointerleave', 'pointerdown', 'scroll', 'input', 'blur'] as const) {
    field.input.addEventListener(type, clearHover);
  }

  function renderMirror(): void {
    const { text } = state.get();
    const results = analyzer.results.get();
    const spans: Span[] = [];

    // Results describe `results.text`. While a newer run is in flight their offsets would be wrong, so skip them.
    if (results.text === text) {
      results.matches.forEach((match, i) => {
        spans.push(
          match.value.length === 0
            ? { start: match.index, end: match.index, className: 'm-empty' }
            : { start: match.index, end: match.end, className: `m m${i % 2}` },
        );
        if (i < GROUP_DECORATION_LIMIT) {
          for (const group of match.groups) {
            // A group that spans the whole match says nothing the match highlight does not already say.
            const wholeMatch = group.start === match.index && group.end === match.end;
            if (group.start !== undefined && group.end !== undefined && group.end > group.start && !wholeMatch) {
              spans.push({ start: group.start, end: group.end, className: `g g${(group.index - 1) % 4}` });
            }
          }
        }
      });
      const hover = highlights.get().text;
      if (hover) spans.push({ ...hover, className: 'hl-hover' });
    }
    field.setMirrorHtml(renderSpans(text, spans));
  }

  let busyTimer: ReturnType<typeof setTimeout> | undefined;

  function renderSummary(): void {
    const results = analyzer.results.get();
    const { pattern, text } = state.get();
    const stale = results.busy || results.text !== text;

    if (stale && !results.error && pattern !== '' && !analyzer.syntax.get().error) {
      // Keep the previous message and only admit to being busy if this takes noticeable time.
      busyTimer ??= setTimeout(() => {
        busyTimer = undefined;
        const latest = analyzer.results.get();
        if (latest.busy || latest.text !== state.get().text) show('Matching…', false);
      }, BUSY_DELAY_MS);
      return;
    }
    clearTimeout(busyTimer);
    busyTimer = undefined;

    if (results.error) {
      show(results.error, true);
    } else if (pattern === '' || analyzer.syntax.get().error) {
      show('', false);
    } else {
      const count = results.matches.length;
      const label = results.truncated
        ? `${numbers.format(count)}+ matches (stopped at ${numbers.format(count)})`
        : `${numbers.format(count)} ${count === 1 ? 'match' : 'matches'}`;
      show(`${label} · ${formatMs(results.elapsedMs)}`, false);
    }
  }

  function show(message: string, isError: boolean): void {
    summary.className = isError ? 'status status-error' : 'status';
    summary.textContent = message;
  }

  state.subscribe((next, prev) => {
    if (next.text !== prev.text) field.setValue(next.text);
  });
  analyzer.results.subscribe(() => {
    clearHover();
    renderMirror();
    renderSummary();
  });
  analyzer.syntax.subscribe(renderSummary);
  highlights.subscribe((next, prev) => {
    if (next.text !== prev.text) renderMirror();
  });

  field.setValue(state.get().text);
  renderMirror();
  renderSummary();

  return { selectRange: (range) => field.selectRange(range.start, range.end) };
}

/** Value and unit are joined with a non-breaking space so they never wrap apart. */
function formatMs(ms: number): string {
  const value = ms < 1 ? '<1' : ms < 10 ? ms.toFixed(1) : String(Math.round(ms));
  return `${value} ms`;
}
