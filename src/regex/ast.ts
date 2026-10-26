/** Source offsets are UTF-16 code unit indices into the pattern string; `end` is exclusive. */
export interface BaseNode {
  start: number;
  end: number;
}

export type EscapeKind =
  | 'digit'
  | 'notDigit'
  | 'word'
  | 'notWord'
  | 'space'
  | 'notSpace'
  | 'wordBoundary'
  | 'notWordBoundary'
  | 'backspace'
  | 'control'
  | 'controlLetter'
  | 'null'
  | 'octal'
  | 'hex'
  | 'unicode'
  | 'identity';

export interface CharNode extends BaseNode {
  type: 'char';
  value: string;
  codePoint: number;
}

export interface EscapeNode extends BaseNode {
  type: 'escape';
  kind: EscapeKind;
  raw: string;
  /** Resolved code point for escapes that denote a single character. */
  codePoint?: number;
}

export interface DotNode extends BaseNode {
  type: 'dot';
}

export interface AnchorNode extends BaseNode {
  type: 'anchor';
  kind: 'start' | 'end';
}

export interface BackrefNode extends BaseNode {
  type: 'backref';
  ref: number | string;
}

export interface PropertyNode extends BaseNode {
  type: 'property';
  negated: boolean;
  name: string;
  value?: string;
}

export interface RangeNode extends BaseNode {
  type: 'range';
  from: CharNode | EscapeNode;
  to: CharNode | EscapeNode;
}

/** `&&` or `--` between operands inside a `v`-flag class. */
export interface ClassOperatorNode extends BaseNode {
  type: 'classOperator';
  operator: '&&' | '--';
}

/** `\q{abc|d}` inside a `v`-flag class: a list of whole strings that may match. */
export interface ClassStringsNode extends BaseNode {
  type: 'classStrings';
  strings: string[];
}

export type ClassItem =
  | CharNode
  | EscapeNode
  | PropertyNode
  | RangeNode
  | ClassNode
  | ClassOperatorNode
  | ClassStringsNode;

export interface ClassNode extends BaseNode {
  type: 'class';
  negated: boolean;
  /** With `v`, a set is either a union, or an intersection or subtraction of operands. `items` holds the operators too. */
  operation: 'union' | 'intersection' | 'subtraction';
  items: ClassItem[];
}

/** Unicode properties whose matches are whole sequences rather than single characters. Only valid with the `v` flag. */
export const STRING_PROPERTIES: ReadonlySet<string> = new Set([
  'Basic_Emoji',
  'Emoji_Keycap_Sequence',
  'RGI_Emoji',
  'RGI_Emoji_Flag_Sequence',
  'RGI_Emoji_Modifier_Sequence',
  'RGI_Emoji_Tag_Sequence',
  'RGI_Emoji_ZWJ_Sequence',
]);

export type GroupKind =
  | 'capture'
  | 'named'
  | 'noncapture'
  | 'lookahead'
  | 'negativeLookahead'
  | 'lookbehind'
  | 'negativeLookbehind'
  | 'modifiers';

export interface GroupNode extends BaseNode {
  type: 'group';
  kind: GroupKind;
  /** 1-based index for capturing groups. */
  index?: number;
  name?: string;
  /** Flags switched on / off by a `(?i-s:...)` modifier group. */
  add?: string;
  remove?: string;
  body: AlternationNode;
}

export interface QuantifierNode extends BaseNode {
  type: 'quantifier';
  min: number;
  max: number;
  greedy: boolean;
  body: Atom;
}

export type Atom =
  | CharNode
  | EscapeNode
  | DotNode
  | AnchorNode
  | BackrefNode
  | PropertyNode
  | ClassNode
  | GroupNode;

export type Term = Atom | QuantifierNode;

export interface SequenceNode extends BaseNode {
  type: 'sequence';
  items: Term[];
}

export interface AlternationNode extends BaseNode {
  type: 'alternation';
  alternatives: SequenceNode[];
}

export interface PatternNode extends BaseNode {
  type: 'pattern';
  body: AlternationNode;
  groupCount: number;
  groupNames: string[];
}

export type AnyNode =
  | PatternNode
  | AlternationNode
  | SequenceNode
  | Term
  | RangeNode
  | ClassOperatorNode
  | ClassStringsNode;

export function childrenOf(node: AnyNode): AnyNode[] {
  switch (node.type) {
    case 'pattern':
      return [node.body];
    case 'alternation':
      return node.alternatives;
    case 'sequence':
      return node.items;
    case 'group':
      return [node.body];
    case 'quantifier':
      return [node.body];
    case 'class':
      return node.items;
    case 'range':
      return [node.from, node.to];
    default:
      return [];
  }
}

/** Depth-first, parent-before-children traversal. */
export function walk(node: AnyNode, visit: (node: AnyNode, parent: AnyNode | null) => void, parent: AnyNode | null = null): void {
  visit(node, parent);
  for (const child of childrenOf(node)) walk(child, visit, node);
}

/** Maps capture group numbers to their names, for named groups only. */
export function captureNames(ast: PatternNode): Map<number, string> {
  const names = new Map<number, string>();
  walk(ast, (node) => {
    if (node.type === 'group' && node.kind === 'named' && node.index !== undefined && node.name !== undefined) {
      names.set(node.index, node.name);
    }
  });
  return names;
}
