import { h } from './dom';

export interface HighlightFieldOptions {
  /** Id for the textarea, so a visible `<label for>` can name it. */
  id: string;
  placeholder?: string;
  /** The field grows with its content instead of scrolling. */
  autoGrow?: boolean;
  className?: string;
}

/**
 * A plain textarea laid over a mirror element that shows the same text with decorations.
 * The textarea keeps native editing, selection and IME behaviour; its own glyphs are transparent.
 */
export class HighlightField {
  readonly root: HTMLElement;
  readonly input: HTMLTextAreaElement;
  private readonly mirror: HTMLElement;
  private readonly autoGrow: boolean;
  private scrollbarWidth = 0;

  constructor(
    options: HighlightFieldOptions,
    private readonly onChange: (value: string) => void,
  ) {
    this.autoGrow = options.autoGrow ?? false;
    this.mirror = h('div', { class: 'hf-mirror', 'aria-hidden': 'true' });
    this.input = h('textarea', {
      id: options.id,
      class: 'hf-input',
      placeholder: options.placeholder,
      spellcheck: 'false',
      autocomplete: 'off',
      autocapitalize: 'off',
      rows: this.autoGrow ? 1 : undefined,
      wrap: 'soft',
    });
    this.root = h('div', { class: `hf ${options.className ?? ''}`, translate: 'no' }, this.mirror, this.input);

    this.input.addEventListener('input', () => {
      this.resize();
      this.syncScroll();
      this.onChange(this.input.value);
    });
    this.input.addEventListener('scroll', () => this.syncScroll());
    new ResizeObserver(() => {
      this.resize();
      this.syncScroll();
    }).observe(this.input);
  }

  get value(): string {
    return this.input.value;
  }

  /** Replaces the content from outside (loading a shared link). Does not call `onChange`. */
  setValue(value: string): void {
    if (this.input.value === value) return;
    this.input.value = value;
    this.resize();
  }

  /** Sets the decorated HTML, built with `renderSpans`. */
  setMirrorHtml(html: string): void {
    this.mirror.innerHTML = html;
    this.syncScroll();
  }

  insertAtCaret(token: string): void {
    const { selectionStart, selectionEnd, value } = this.input;
    const next = value.slice(0, selectionStart) + token + value.slice(selectionEnd);
    this.input.value = next;
    const caret = selectionStart + token.length;
    this.input.setSelectionRange(caret, caret);
    this.resize();
    this.input.focus();
    this.onChange(next);
  }

  selectRange(start: number, end: number): void {
    this.input.focus();
    this.input.setSelectionRange(start, end);
  }

  /**
   * The text offset where the decorated segment under the pointer starts, considering only segments that match
   * `selector`. The mirror ignores the pointer (the textarea is on top), so this compares screen rectangles instead.
   */
  segmentAt(clientX: number, clientY: number, selector: string): number | null {
    for (const el of this.mirror.querySelectorAll<HTMLElement>(selector)) {
      for (const rect of el.getClientRects()) {
        if (clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom) {
          return Number(el.dataset.s);
        }
      }
    }
    return null;
  }

  focus(): void {
    this.input.focus();
  }

  private resize(): void {
    if (!this.autoGrow) return;
    this.input.style.height = 'auto';
    this.input.style.height = `${this.input.scrollHeight}px`;
  }

  /**
   * Keeps the mirror's text wrapping identical to the textarea's. A visible scrollbar narrows the textarea,
   * so the mirror gets the same amount of extra right padding.
   */
  private syncScroll(): void {
    const scrollbar = this.input.offsetWidth - this.input.clientWidth;
    if (scrollbar !== this.scrollbarWidth) {
      this.scrollbarWidth = scrollbar;
      this.mirror.style.paddingRight = scrollbar > 0 ? `calc(var(--pad-x) + ${scrollbar}px)` : '';
    }
    this.mirror.scrollTop = this.input.scrollTop;
    this.mirror.scrollLeft = this.input.scrollLeft;
  }
}
