import { STRING_PROPERTIES } from './ast';
import type {
  AlternationNode,
  AnyNode,
  Atom,
  CharNode,
  ClassItem,
  ClassNode,
  EscapeNode,
  GroupNode,
  PatternNode,
  PropertyNode,
  QuantifierNode,
  SequenceNode,
} from './ast';

export interface ExplainNode {
  /** Short category shown in bold, such as "Character set". */
  title: string;
  description: string;
  /** The pattern text this node covers. */
  source: string;
  start: number;
  end: number;
  kind: AnyNode['type'];
  children: ExplainNode[];
}

export interface ExplainOptions {
  flags: string;
}

export function explain(ast: PatternNode, source: string, options: ExplainOptions): ExplainNode[] {
  return new Explainer(source, options.flags).alternation(ast.body);
}

const CONTROL_NAMES: Record<number, string> = {
  0: 'null character',
  8: 'backspace',
  9: 'tab',
  10: 'line feed',
  11: 'vertical tab',
  12: 'form feed',
  13: 'carriage return',
  32: 'space',
  160: 'non-breaking space',
};

export function describeCodePoint(cp: number): string {
  const named = CONTROL_NAMES[cp];
  if (named) return named;
  const hex = 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return `control character ${hex}`;
  return `“${String.fromCodePoint(cp)}” (${hex})`;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

export function describeQuantifier(q: Pick<QuantifierNode, 'min' | 'max' | 'greedy'>): string {
  let count: string;
  if (q.min === 0 && q.max === Infinity) count = 'any number of times (zero or more)';
  else if (q.min === 1 && q.max === Infinity) count = '1 or more times';
  else if (q.min === 0 && q.max === 1) count = 'zero or one time (optional)';
  else if (q.max === Infinity) count = `${q.min} or more times`;
  else if (q.min === q.max) count = `exactly ${plural(q.min, 'time')}`;
  else count = `between ${q.min} and ${plural(q.max, 'time')}`;

  const mode = q.greedy
    ? 'As many as possible (greedy).'
    : 'As few as possible (lazy).';
  // A fixed count has nothing to be greedy or lazy about.
  return q.min === q.max ? `Matches the preceding token ${count}.` : `Matches the preceding token ${count}. ${mode}`;
}

class Explainer {
  private readonly ignoreCase: boolean;
  private readonly multiline: boolean;
  private readonly dotAll: boolean;

  constructor(
    private readonly src: string,
    flags: string,
  ) {
    this.ignoreCase = flags.includes('i');
    this.multiline = flags.includes('m');
    this.dotAll = flags.includes('s');
  }

  alternation(node: AlternationNode): ExplainNode[] {
    if (node.alternatives.length === 1) return this.sequence(node.alternatives[0]!);

    const out: ExplainNode[] = [];
    node.alternatives.forEach((alt, i) => {
      const children = this.sequence(alt);
      out.push(
        this.make(alt, 'sequence', `Alternative ${i + 1}`, alt.items.length === 0 ? 'An empty alternative: matches the empty string.' : 'Tried in order. The first alternative that matches wins.', children),
      );
      if (i < node.alternatives.length - 1) {
        const barStart = alt.end;
        out.push({
          title: 'Alternation',
          description: 'Acts like a boolean OR. Matches the expression before or after the |.',
          source: '|',
          start: barStart,
          end: barStart + 1,
          kind: 'alternation',
          children: [],
        });
      }
    });
    return out;
  }

  private sequence(node: SequenceNode): ExplainNode[] {
    const out: ExplainNode[] = [];
    for (const item of node.items) {
      if (item.type === 'quantifier') {
        out.push(...this.quantified(item));
      } else {
        out.push(this.term(item));
      }
    }
    return out;
  }

  /** A quantified atom becomes the atom's own row followed by a row for the quantifier token. */
  private quantified(q: QuantifierNode): ExplainNode[] {
    const body = this.term(q.body);
    const quantifier: ExplainNode = {
      title: 'Quantifier',
      description: describeQuantifier(q),
      source: this.src.slice(q.body.end, q.end),
      start: q.body.end,
      end: q.end,
      kind: 'quantifier',
      children: [],
    };
    return [body, quantifier];
  }

  private term(node: Atom): ExplainNode {
    switch (node.type) {
      case 'char':
        return this.make(node, 'char', 'Character', `Matches ${this.charText(node)}${this.caseNote(node.value)}.`);
      case 'escape':
        return this.escape(node);
      case 'dot':
        return this.make(
          node,
          'dot',
          'Any Character',
          this.dotAll
            ? 'Matches any character, including line breaks (the s flag is on).'
            : 'Matches any character except line breaks.',
        );
      case 'anchor':
        return this.make(
          node,
          'anchor',
          node.kind === 'start' ? 'Beginning' : 'End',
          node.kind === 'start'
            ? this.multiline
              ? 'Matches the start of a line (the m flag is on).'
              : 'Matches the start of the text.'
            : this.multiline
              ? 'Matches the end of a line (the m flag is on).'
              : 'Matches the end of the text.',
        );
      case 'backref':
        return this.make(
          node,
          'backref',
          'Backreference',
          typeof node.ref === 'number'
            ? `Matches the same text that capturing group #${node.ref} matched.`
            : `Matches the same text that the group named “${node.ref}” matched.`,
        );
      case 'property':
        return this.property(node);
      case 'class':
        return this.classNode(node, false);
      case 'group':
        return this.group(node);
    }
  }

  private group(node: GroupNode): ExplainNode {
    const children = this.alternation(node.body);
    switch (node.kind) {
      case 'capture':
        return this.make(
          node,
          'group',
          `Capturing Group #${node.index}`,
          'Groups tokens together and captures the matched text for backreferences and replacements.',
          children,
        );
      case 'named':
        return this.make(
          node,
          'group',
          `Named Group “${node.name}” (#${node.index})`,
          'A capturing group you can also refer to by name, as $<name> or \\k<name>.',
          children,
        );
      case 'noncapture':
        return this.make(node, 'group', 'Non-Capturing Group', 'Groups tokens together without saving the match.', children);
      case 'lookahead':
        return this.make(node, 'group', 'Positive Lookahead', 'Matches only if the group could match next. Nothing is consumed.', children);
      case 'negativeLookahead':
        return this.make(node, 'group', 'Negative Lookahead', 'Matches only if the group could not match next. Nothing is consumed.', children);
      case 'lookbehind':
        return this.make(node, 'group', 'Positive Lookbehind', 'Matches only if the group matches immediately before this point. Nothing is consumed.', children);
      case 'negativeLookbehind':
        return this.make(node, 'group', 'Negative Lookbehind', 'Matches only if the group does not match immediately before this point. Nothing is consumed.', children);
      case 'modifiers': {
        const parts: string[] = [];
        if (node.add) parts.push(`turns on ${[...node.add].join(', ')}`);
        if (node.remove) parts.push(`turns off ${[...node.remove].join(', ')}`);
        return this.make(
          node,
          'group',
          'Modifier Group',
          `Inside this group, ${parts.join(' and ')}. Flags outside the group are unchanged.`,
          children,
        );
      }
    }
  }

  /** A character set. With the `v` flag it can also be an intersection or subtraction of its operands. */
  private classNode(node: ClassNode, nested: boolean): ExplainNode {
    const children = node.items.filter((item) => item.type !== 'classOperator').map((item) => this.classItem(item));

    if (node.operation === 'union') {
      return this.make(
        node,
        'class',
        node.negated ? 'Negated Set' : nested ? 'Nested Set' : 'Character Set',
        node.negated
          ? 'Matches any single character that is not in the set.'
          : nested
            ? 'A set inside another set. Everything in it is added to the outer set.'
            : 'Matches any single character in the set.',
        children,
      );
    }

    const base = node.operation === 'intersection' ? 'Set Intersection' : 'Set Subtraction';
    const what =
      node.operation === 'intersection'
        ? 'Keeps only the characters that are in every one of the sets below.'
        : 'Starts with the first set below and removes every character that is in any of the others.';
    return this.make(
      node,
      'class',
      node.negated ? `Negated ${base}` : base,
      node.negated ? `Matches any single character outside the result. ${what}` : what,
      children,
    );
  }

  private classItem(item: ClassItem): ExplainNode {
    switch (item.type) {
      case 'char':
        return this.make(item, 'char', 'Character', `Matches ${this.charText(item)}.`);
      case 'escape':
        return this.escape(item);
      case 'property':
        return this.property(item);
      case 'range': {
        const from = item.from.codePoint ?? 0;
        const to = item.to.codePoint ?? 0;
        return this.make(
          item,
          'range',
          'Range',
          `Matches a character from ${describeCodePoint(from)} to ${describeCodePoint(to)} (code ${from} to ${to}).${this.ignoreCase ? ' Case is ignored (the i flag is on).' : ' Case sensitive.'}`,
        );
      }
      case 'class':
        return this.classNode(item, true);
      case 'classStrings': {
        const shown = item.strings.map((string) => `“${string}”`).join(', ');
        return this.make(
          item,
          'classStrings',
          'String Alternatives',
          `Matches one of these whole strings: ${shown}.${item.strings.length > 1 ? ' Longer strings are tried first.' : ''}`,
        );
      }
      case 'classOperator':
        return this.make(
          item,
          'classOperator',
          item.operator === '&&' ? 'Intersection' : 'Subtraction',
          item.operator === '&&'
            ? 'Keeps only characters that are in both neighbouring sets.'
            : 'Removes characters of the following set from the preceding one.',
        );
    }
  }

  private escape(node: EscapeNode): ExplainNode {
    switch (node.kind) {
      case 'digit':
        return this.make(node, 'escape', 'Digit', 'Matches any digit character (0 to 9).');
      case 'notDigit':
        return this.make(node, 'escape', 'Not a Digit', 'Matches any character that is not a digit.');
      case 'word':
        return this.make(node, 'escape', 'Word', 'Matches a letter, digit or underscore (A-Z, a-z, 0-9, _).');
      case 'notWord':
        return this.make(node, 'escape', 'Not a Word Character', 'Matches any character that is not a letter, digit or underscore.');
      case 'space':
        return this.make(node, 'escape', 'Whitespace', 'Matches a space, tab, line break or other whitespace character.');
      case 'notSpace':
        return this.make(node, 'escape', 'Not Whitespace', 'Matches any character that is not whitespace.');
      case 'wordBoundary':
        return this.make(node, 'escape', 'Word Boundary', 'Matches the position between a word character and a non-word character, or an edge of the text.');
      case 'notWordBoundary':
        return this.make(node, 'escape', 'Not a Word Boundary', 'Matches any position that is not a word boundary.');
      case 'backspace':
        return this.make(node, 'escape', 'Backspace', 'Matches the backspace character (only inside a set).');
      case 'controlLetter':
        return this.make(node, 'escape', 'Control Character', `Matches ${describeCodePoint(node.codePoint ?? 0)}, typed as Ctrl+${node.raw.slice(2).toUpperCase()}.`);
      case 'identity':
        return this.make(node, 'escape', 'Escaped Character', `Matches ${this.charText(node)} literally.`);
      default:
        return this.make(node, 'escape', 'Character', `Matches ${describeCodePoint(node.codePoint ?? 0)}.`);
    }
  }

  private property(node: PropertyNode): ExplainNode {
    const what = node.value !== undefined ? `${node.name} = ${node.value}` : node.name;
    if (node.value === undefined && STRING_PROPERTIES.has(node.name)) {
      return this.make(
        node,
        'property',
        'Unicode Property of Strings',
        `Matches a whole emoji sequence of the kind ${node.name}, which can be several characters long. Only available with the v flag.`,
      );
    }
    return this.make(
      node,
      'property',
      node.negated ? 'Unicode Property (Negated)' : 'Unicode Property',
      node.negated
        ? `Matches any character that does not have the Unicode property ${what}.`
        : `Matches any character with the Unicode property ${what}.`,
    );
  }

  private charText(node: CharNode | EscapeNode): string {
    const cp = node.type === 'char' ? node.codePoint : (node.codePoint ?? 0);
    return describeCodePoint(cp);
  }

  private caseNote(value: string): string {
    return this.ignoreCase && value.toLowerCase() !== value.toUpperCase() ? ' (case is ignored)' : '';
  }

  private make(
    node: { start: number; end: number },
    kind: AnyNode['type'],
    title: string,
    description: string,
    children: ExplainNode[] = [],
  ): ExplainNode {
    return {
      title,
      description,
      source: this.src.slice(node.start, node.end),
      start: node.start,
      end: node.end,
      kind,
      children,
    };
  }
}
