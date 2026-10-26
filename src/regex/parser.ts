import { STRING_PROPERTIES } from './ast';
import type {
  AlternationNode,
  AnchorNode,
  Atom,
  BackrefNode,
  CharNode,
  ClassItem,
  ClassNode,
  ClassStringsNode,
  EscapeKind,
  EscapeNode,
  GroupKind,
  GroupNode,
  PatternNode,
  PropertyNode,
  SequenceNode,
  Term,
} from './ast';

export interface ParseOptions {
  unicode: boolean;
  unicodeSets: boolean;
}

export class ParseError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

export function optionsFromFlags(flags: string): ParseOptions {
  return { unicode: flags.includes('u'), unicodeSets: flags.includes('v') };
}

export function parse(source: string, options: ParseOptions): PatternNode {
  return new Parser(source, options).parsePattern();
}

const SYNTAX_CHARS = new Set('^$\\.*+?()[]{}|/');
const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*$/u;
/** In a `v`-flag set these must be escaped to be literal. */
const CLASS_SET_SYNTAX = new Set('()[]{}/-\\|');
/** Doubled, these are reserved for future operators and must be escaped. */
const CLASS_SET_DOUBLE = new Set('&!#$%*+,.:;<=>?@^`~');
/** Punctuation that a backslash may precede inside a `v`-flag set, in addition to the usual syntax characters. */
const CLASS_SET_ESCAPABLE = new Set('&!#%,:;<=>@`~');
const QUANTIFIER_BRACES = /^\{(\d+)(?:(,)(\d*))?\}/;

/** Counts capturing groups and detects named groups ahead of parsing, since `\N` and `\k` depend on them. */
function prescan(source: string): { groups: number; hasNamed: boolean } {
  let groups = 0;
  let hasNamed = false;
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') {
      i++;
    } else if (inClass) {
      if (c === ']') inClass = false;
    } else if (c === '[') {
      inClass = true;
    } else if (c === '(') {
      if (source[i + 1] !== '?') {
        groups++;
      } else if (source[i + 2] === '<' && source[i + 3] !== '=' && source[i + 3] !== '!') {
        groups++;
        hasNamed = true;
      }
    }
  }
  return { groups, hasNamed };
}

class Parser {
  private pos = 0;
  private groupIndex = 0;
  private readonly groupNames: string[] = [];
  private readonly totalGroups: number;
  private readonly hasNamed: boolean;
  private readonly strict: boolean;

  constructor(
    private readonly src: string,
    private readonly opts: ParseOptions,
  ) {
    const scan = prescan(src);
    this.totalGroups = scan.groups;
    this.hasNamed = scan.hasNamed;
    this.strict = opts.unicode || opts.unicodeSets;
  }

  parsePattern(): PatternNode {
    const body = this.parseAlternation();
    if (this.pos < this.src.length) this.fail('Unmatched ")"', this.pos);
    return {
      type: 'pattern',
      body,
      groupCount: this.groupIndex,
      groupNames: this.groupNames,
      start: 0,
      end: this.src.length,
    };
  }

  private fail(message: string, position: number): never {
    throw new ParseError(message, position);
  }

  private peek(offset = 0): string | undefined {
    return this.src[this.pos + offset];
  }

  private parseAlternation(): AlternationNode {
    const start = this.pos;
    const alternatives: SequenceNode[] = [this.parseSequence()];
    while (this.peek() === '|') {
      this.pos++;
      alternatives.push(this.parseSequence());
    }
    return { type: 'alternation', alternatives, start, end: this.pos };
  }

  private parseSequence(): SequenceNode {
    const start = this.pos;
    const items: Term[] = [];
    while (this.pos < this.src.length) {
      const c = this.src[this.pos];
      if (c === '|' || c === ')') break;
      items.push(this.parseTerm());
    }
    return { type: 'sequence', items, start, end: this.pos };
  }

  private parseTerm(): Term {
    const start = this.pos;
    const c = this.src[this.pos]!;
    let atom: Atom;
    let quantifiable = true;

    switch (c) {
      case '^':
      case '$': {
        this.pos++;
        const anchor: AnchorNode = { type: 'anchor', kind: c === '^' ? 'start' : 'end', start, end: this.pos };
        atom = anchor;
        quantifiable = false;
        break;
      }
      case '.':
        this.pos++;
        atom = { type: 'dot', start, end: this.pos };
        break;
      case '(': {
        const group = this.parseGroup();
        atom = group;
        quantifiable =
          group.kind === 'lookahead' || group.kind === 'negativeLookahead'
            ? !this.strict
            : group.kind !== 'lookbehind' && group.kind !== 'negativeLookbehind';
        break;
      }
      case '[':
        atom = this.parseClass();
        break;
      case '\\': {
        const escape = this.parseEscape(false);
        atom = escape;
        if (escape.type === 'escape' && (escape.kind === 'wordBoundary' || escape.kind === 'notWordBoundary')) {
          quantifiable = false;
        }
        break;
      }
      case '*':
      case '+':
      case '?':
        return this.fail('Nothing to repeat', start);
      case '{': {
        if (this.strict) this.fail('Lone quantifier brackets', start);
        if (this.tryQuantifierBraces()) this.fail('Nothing to repeat', start);
        atom = this.literal();
        break;
      }
      case '}':
      case ']':
        if (this.strict) this.fail('Lone quantifier brackets', start);
        atom = this.literal();
        break;
      default:
        atom = this.literal();
    }

    return this.parseQuantifier(atom, quantifiable);
  }

  private literal(): CharNode {
    const start = this.pos;
    const cp = this.strict ? this.src.codePointAt(this.pos)! : this.src.charCodeAt(this.pos);
    const value = String.fromCodePoint(cp);
    this.pos += value.length;
    return { type: 'char', value, codePoint: cp, start, end: this.pos };
  }

  private tryQuantifierBraces(): { min: number; max: number; length: number } | null {
    const m = QUANTIFIER_BRACES.exec(this.src.slice(this.pos, this.pos + 24));
    if (!m) return null;
    const min = Number(m[1]);
    const max = m[2] === undefined ? min : m[3] === '' ? Infinity : Number(m[3]);
    return { min, max, length: m[0].length };
  }

  private parseQuantifier(atom: Atom, quantifiable: boolean): Term {
    const start = this.pos;
    const c = this.peek();
    let min: number;
    let max: number;

    if (c === '*') {
      min = 0;
      max = Infinity;
      this.pos++;
    } else if (c === '+') {
      min = 1;
      max = Infinity;
      this.pos++;
    } else if (c === '?') {
      min = 0;
      max = 1;
      this.pos++;
    } else if (c === '{') {
      const braces = this.tryQuantifierBraces();
      if (!braces) {
        if (this.strict) this.fail('Incomplete quantifier', start);
        return atom;
      }
      if (braces.min > braces.max) this.fail('Numbers out of order in {} quantifier', start);
      min = braces.min;
      max = braces.max;
      this.pos += braces.length;
    } else {
      return atom;
    }

    if (!quantifiable) this.fail('Nothing to repeat', start);

    let greedy = true;
    if (this.peek() === '?') {
      greedy = false;
      this.pos++;
    }
    const next = this.peek();
    if (next === '*' || next === '+' || next === '?') {
      this.fail(
        next === '+' ? 'Nothing to repeat (possessive quantifiers are not supported)' : 'Nothing to repeat',
        this.pos,
      );
    }
    return { type: 'quantifier', min, max, greedy, body: atom, start: atom.start, end: this.pos };
  }

  private parseGroup(): GroupNode {
    const start = this.pos;
    let kind: GroupKind = 'capture';
    let name: string | undefined;
    let index: number | undefined;
    let add: string | undefined;
    let remove: string | undefined;

    this.pos++; // (
    if (this.peek() === '?') {
      const rest = this.src.slice(this.pos, this.pos + 3);
      if (rest.startsWith('?:')) {
        kind = 'noncapture';
        this.pos += 2;
      } else if (rest.startsWith('?=')) {
        kind = 'lookahead';
        this.pos += 2;
      } else if (rest.startsWith('?!')) {
        kind = 'negativeLookahead';
        this.pos += 2;
      } else if (rest === '?<=') {
        kind = 'lookbehind';
        this.pos += 3;
      } else if (rest === '?<!') {
        kind = 'negativeLookbehind';
        this.pos += 3;
      } else if (rest.startsWith('?<')) {
        const close = this.src.indexOf('>', this.pos);
        if (close === -1) this.fail('Invalid capture group name', start);
        name = this.src.slice(this.pos + 2, close);
        if (!IDENTIFIER.test(name)) this.fail('Invalid capture group name', this.pos + 2);
        if (this.groupNames.includes(name)) this.fail('Duplicate capture group name', this.pos + 2);
        this.pos = close + 1;
        kind = 'named';
        index = ++this.groupIndex;
        this.groupNames.push(name);
      } else {
        const modifiers = /^\?([ims]*)(?:-([ims]*))?:/.exec(this.src.slice(this.pos, this.pos + 12));
        if (!modifiers || (!modifiers[1] && !modifiers[2])) this.fail('Invalid group', start);
        kind = 'modifiers';
        add = modifiers[1] ?? '';
        remove = modifiers[2] ?? '';
        this.pos += modifiers[0].length;
      }
    } else {
      index = ++this.groupIndex;
    }

    const body = this.parseAlternation();
    if (this.peek() !== ')') this.fail('Unterminated group', start);
    this.pos++;

    const group: GroupNode = { type: 'group', kind, body, start, end: this.pos };
    if (index !== undefined) group.index = index;
    if (name !== undefined) group.name = name;
    if (add !== undefined) group.add = add;
    if (remove !== undefined) group.remove = remove;
    return group;
  }

  private parseClass(): ClassNode {
    const start = this.pos;
    this.pos++; // [
    let negated = false;
    if (this.peek() === '^') {
      negated = true;
      this.pos++;
    }
    if (this.opts.unicodeSets) return this.parseClassSet(start, negated);

    const items: ClassItem[] = [];

    for (;;) {
      if (this.pos >= this.src.length) this.fail('Unterminated character class', start);
      if (this.src[this.pos] === ']') {
        this.pos++;
        break;
      }

      const from = this.parseClassAtom();
      const isRangeDash = this.peek() === '-' && this.peek(1) !== undefined && this.peek(1) !== ']';
      if (!isRangeDash) {
        items.push(from);
        continue;
      }

      const dash = this.literalAt('-');
      const to = this.parseClassAtom();
      if (isRangeEnd(from) && isRangeEnd(to)) {
        if (from.codePoint! > to.codePoint!) this.fail('Range out of order in character class', from.start);
        items.push({ type: 'range', from, to, start: from.start, end: to.end });
      } else {
        if (this.strict) this.fail('Invalid character class', from.start);
        items.push(from, dash, to);
      }
    }

    return { type: 'class', negated, operation: 'union', items, start, end: this.pos };
  }

  /**
   * The body of a `v`-flag set, after `[` and an optional `^`. It is a union of operands and ranges, or a chain of
   * `&&` or `--` between operands. The two forms cannot be mixed at one level, and ranges cannot be operands.
   */
  private parseClassSet(start: number, negated: boolean): ClassNode {
    const items: ClassItem[] = [];
    let operation: ClassNode['operation'] = 'union';
    let operands = 0;
    let lastWasRange = false;

    for (;;) {
      if (this.pos >= this.src.length) this.fail('Unterminated character class', start);
      if (this.src[this.pos] === ']') {
        this.pos++;
        break;
      }

      const pair = this.src.slice(this.pos, this.pos + 2);
      if (pair === '&&' || pair === '--') {
        const next = pair === '&&' ? 'intersection' : 'subtraction';
        if (operation === 'union') {
          if (operands !== 1 || lastWasRange) this.fail('Invalid set operation in character class', this.pos);
          operation = next;
        } else if (operation !== next) {
          this.fail('Invalid set operation in character class', this.pos);
        }
        items.push({ type: 'classOperator', operator: pair, start: this.pos, end: this.pos + 2 });
        this.pos += 2;
        if (pair === '&&' && this.peek() === '&') this.fail('Invalid character in character class', this.pos);
        items.push(this.parseClassSetOperand());
        operands++;
        lastWasRange = false;
        continue;
      }
      if (operation !== 'union') this.fail('Invalid set operation in character class', this.pos);

      const first = this.parseClassSetOperand();
      if (isRangeEnd(first) && this.peek() === '-' && this.peek(1) !== '-') {
        this.pos++; // -
        const to = this.parseClassSetOperand();
        if (!isRangeEnd(to)) this.fail('Invalid character class', first.start);
        if (first.codePoint! > to.codePoint!) this.fail('Range out of order in character class', first.start);
        items.push({ type: 'range', from: first, to, start: first.start, end: to.end });
        lastWasRange = true;
      } else {
        items.push(first);
        lastWasRange = false;
      }
      operands++;
    }

    const node: ClassNode = { type: 'class', negated, operation, items, start, end: this.pos };
    if (negated && setContentMayContainStrings(node)) this.fail('Negated character class may contain strings', start);
    return node;
  }

  private parseClassSetOperand(): ClassItem {
    const c = this.src[this.pos];
    if (c === undefined) return this.fail('Unterminated character class', this.pos);
    if (c === '[') return this.parseClass();
    if (c === '\\') {
      if (this.peek(1) === 'q') return this.parseClassStrings();
      return this.parseEscape(true, true) as CharNode | EscapeNode | PropertyNode;
    }
    return this.classSetCharacter();
  }

  /** A plain character in a `v`-flag set. Syntax characters and doubled punctuation must be escaped. */
  private classSetCharacter(): CharNode {
    const c = this.src[this.pos]!;
    if (CLASS_SET_SYNTAX.has(c) || (c === this.src[this.pos + 1] && CLASS_SET_DOUBLE.has(c))) {
      this.fail('Invalid character in character class', this.pos);
    }
    return this.literal();
  }

  private parseClassStrings(): ClassStringsNode {
    const start = this.pos;
    if (this.peek(2) !== '{') this.fail('Invalid escape', start);
    this.pos += 3;
    const strings: string[] = [];
    let current = '';

    for (;;) {
      const c = this.src[this.pos];
      if (c === undefined) this.fail('Unterminated string alternatives', start);
      if (c === '}' || c === '|') {
        strings.push(current);
        current = '';
        this.pos++;
        if (c === '}') break;
        continue;
      }
      const char = c === '\\' ? this.parseEscape(true, true) : this.classSetCharacter();
      if ((char.type !== 'char' && char.type !== 'escape') || char.codePoint === undefined) {
        this.fail('Invalid escape', char.start);
      }
      current += String.fromCodePoint(char.codePoint);
    }
    return { type: 'classStrings', strings, start, end: this.pos };
  }

  private literalAt(expected: string): CharNode {
    const start = this.pos;
    this.pos++;
    return { type: 'char', value: expected, codePoint: expected.charCodeAt(0), start, end: this.pos };
  }

  private parseClassAtom(): Exclude<ClassItem, ClassNode | { type: 'range' } | { type: 'classOperator' }> {
    if (this.src[this.pos] === '\\') {
      const escape = this.parseEscape(true);
      // Back-references cannot occur inside classes, so this only ever yields chars, escapes and properties.
      return escape as CharNode | EscapeNode | PropertyNode;
    }
    return this.literal();
  }

  private parseEscape(inClass: boolean, classSet = false): CharNode | EscapeNode | BackrefNode | PropertyNode {
    const start = this.pos;
    this.pos++; // backslash
    if (this.pos >= this.src.length) this.fail('\\ at end of pattern', start);
    const c = this.src[this.pos]!;

    const esc = (kind: EscapeKind, codePoint?: number): EscapeNode => {
      const node: EscapeNode = { type: 'escape', kind, raw: this.src.slice(start, this.pos), start, end: this.pos };
      if (codePoint !== undefined) node.codePoint = codePoint;
      return node;
    };
    const simple = (kind: EscapeKind, codePoint?: number): EscapeNode => {
      this.pos++;
      return esc(kind, codePoint);
    };

    switch (c) {
      case 'd':
        return simple('digit');
      case 'D':
        return simple('notDigit');
      case 'w':
        return simple('word');
      case 'W':
        return simple('notWord');
      case 's':
        return simple('space');
      case 'S':
        return simple('notSpace');
      case 'b':
        return inClass ? simple('backspace', 8) : simple('wordBoundary');
      case 'B':
        if (inClass) {
          if (this.strict) this.fail('Invalid escape', start);
          return simple('identity', 66);
        }
        return simple('notWordBoundary');
      case 'f':
        return simple('control', 12);
      case 'n':
        return simple('control', 10);
      case 'r':
        return simple('control', 13);
      case 't':
        return simple('control', 9);
      case 'v':
        return simple('control', 11);
      case 'c': {
        const letter = this.peek(1);
        if (letter !== undefined && /[A-Za-z]/.test(letter)) {
          this.pos += 2;
          return esc('controlLetter', letter.charCodeAt(0) % 32);
        }
        if (this.strict) this.fail('Invalid unicode escape', start);
        // Annex B: a lone `\c` matches a literal backslash, and `c` is parsed on its own.
        this.pos = start + 1;
        return { type: 'char', value: '\\', codePoint: 92, start, end: this.pos };
      }
      case 'x': {
        const hex = /^[0-9a-fA-F]{2}/.exec(this.src.slice(this.pos + 1, this.pos + 3));
        if (hex) {
          this.pos += 3;
          return esc('hex', parseInt(hex[0], 16));
        }
        if (this.strict) this.fail('Invalid escape', start);
        return simple('identity', 120);
      }
      case 'u':
        return this.parseUnicodeEscape(start, esc);
      case 'p':
      case 'P': {
        if (!this.strict) return simple('identity', c.charCodeAt(0));
        return this.parseProperty(start, c === 'P');
      }
      case 'k': {
        if (!inClass && (this.hasNamed || this.strict)) {
          const m = /^<([^>]*)>/.exec(this.src.slice(this.pos + 1));
          if (!m || !IDENTIFIER.test(m[1]!)) this.fail('Invalid named reference', start);
          this.pos += 1 + m[0].length;
          return { type: 'backref', ref: m[1]!, start, end: this.pos };
        }
        if (this.strict) this.fail('Invalid escape', start);
        return simple('identity', 107);
      }
    }

    if (c >= '0' && c <= '9') {
      if (c === '0' && !isDigit(this.peek(1))) return simple('null', 0);

      if (c !== '0' && !inClass) {
        let end = this.pos;
        while (isDigit(this.src[end])) end++;
        const n = Number(this.src.slice(this.pos, end));
        if (n <= this.totalGroups) {
          this.pos = end;
          return { type: 'backref', ref: n, start, end };
        }
      }
      if (this.strict) this.fail(inClass || c === '0' ? 'Invalid class escape' : 'Invalid escape', start);

      if (c <= '7') {
        // Legacy octal escape, at most \377.
        let end = this.pos + 1;
        let value = Number(c);
        while (end < this.pos + 3 && this.src[end]! >= '0' && this.src[end]! <= '7' && value * 8 + Number(this.src[end]) <= 255) {
          value = value * 8 + Number(this.src[end]);
          end++;
        }
        this.pos = end;
        return esc('octal', value);
      }
      return simple('identity', c.charCodeAt(0));
    }

    const cp = this.strict ? this.src.codePointAt(this.pos)! : this.src.charCodeAt(this.pos);
    const escapable = SYNTAX_CHARS.has(c) || (inClass && c === '-') || (classSet && CLASS_SET_ESCAPABLE.has(c));
    if (this.strict && !escapable) this.fail('Invalid escape', start);
    this.pos += String.fromCodePoint(cp).length;
    return esc('identity', cp);
  }

  private parseUnicodeEscape(
    start: number,
    esc: (kind: EscapeKind, codePoint?: number) => EscapeNode,
  ): EscapeNode | CharNode {
    // `this.pos` is at the `u`.
    const rest = this.src.slice(this.pos + 1);
    if (this.strict) {
      const braced = /^\{([0-9a-fA-F]+)\}/.exec(rest);
      if (braced) {
        const cp = parseInt(braced[1]!, 16);
        if (cp > 0x10ffff) this.fail('Invalid Unicode escape', start);
        this.pos += 1 + braced[0].length;
        return esc('unicode', cp);
      }
    }
    const four = /^[0-9a-fA-F]{4}/.exec(rest);
    if (four) {
      let cp = parseInt(four[0], 16);
      this.pos += 5;
      if (this.strict && cp >= 0xd800 && cp <= 0xdbff) {
        const low = /^\\u([dD][c-fC-F][0-9a-fA-F]{2})/.exec(this.src.slice(this.pos, this.pos + 6));
        if (low) {
          cp = 0x10000 + ((cp - 0xd800) << 10) + (parseInt(low[1]!, 16) - 0xdc00);
          this.pos += 6;
        }
      }
      return esc('unicode', cp);
    }
    if (this.strict) this.fail('Invalid Unicode escape', start);
    this.pos++;
    return esc('identity', 117);
  }

  private parseProperty(start: number, negated: boolean): PropertyNode {
    // `this.pos` is at the `p` / `P`.
    const m = /^\{([^}=]+)(?:=([^}]*))?\}/.exec(this.src.slice(this.pos + 1));
    if (!m) this.fail('Invalid property name', start);
    this.pos += 1 + m[0].length;
    // Which names exist, and which are valid only with `v` or only when not negated, is the engine's call.
    try {
      new RegExp(this.src.slice(start, this.pos), this.opts.unicodeSets ? 'v' : 'u');
    } catch {
      this.fail('Invalid property name', start);
    }
    const node: PropertyNode = { type: 'property', negated, name: m[1]!, start, end: this.pos };
    if (m[2] !== undefined) node.value = m[2];
    return node;
  }
}

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= '0' && c <= '9';
}

/** Whether a `v`-flag set can match strings longer than one character, which a negated set may not. */
function mayContainStrings(item: ClassItem): boolean {
  switch (item.type) {
    case 'classStrings':
      return item.strings.some((string) => [...string].length !== 1);
    case 'property':
      return !item.negated && item.value === undefined && STRING_PROPERTIES.has(item.name);
    case 'class':
      // A negated set matches single characters only (a set that could hold strings cannot be negated at all).
      return !item.negated && setContentMayContainStrings(item);
    default:
      return false;
  }
}

/** Looks inside a set, whether or not the set itself is negated. */
function setContentMayContainStrings(set: ClassNode): boolean {
  const operands = set.items.filter((i) => i.type !== 'classOperator');
  if (set.operation === 'intersection') return operands.every(mayContainStrings);
  if (set.operation === 'subtraction') return operands[0] !== undefined && mayContainStrings(operands[0]);
  return operands.some(mayContainStrings);
}

function isRangeEnd(item: ClassItem): item is CharNode | EscapeNode {
  return (item.type === 'char' || item.type === 'escape') && item.codePoint !== undefined;
}
