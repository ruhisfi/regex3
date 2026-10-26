import type { AnyNode, PatternNode } from '../regex/ast';
import type { Span } from './spans';

/** Decorations that color the pattern by syntax role. Plain literal characters are left undecorated. */
export function tokenSpans(ast: PatternNode): Span[] {
  const spans: Span[] = [];
  const add = (start: number, end: number, className: string) => {
    if (end > start) spans.push({ start, end, className });
  };

  const visit = (node: AnyNode, depth: number): void => {
    switch (node.type) {
      case 'pattern':
        visit(node.body, depth);
        break;
      case 'alternation':
        node.alternatives.forEach((alt, i) => {
          visit(alt, depth);
          // A sequence ends right before the `|` that separates it from the next one.
          if (i < node.alternatives.length - 1) add(alt.end, alt.end + 1, 'tk-alt');
        });
        break;
      case 'sequence':
        for (const item of node.items) visit(item, depth);
        break;
      case 'group': {
        const className = `tk-paren tk-d${depth % 3}`;
        add(node.start, node.body.start, className);
        add(node.end - 1, node.end, className);
        visit(node.body, depth + 1);
        break;
      }
      case 'quantifier':
        visit(node.body, depth);
        add(node.body.end, node.end, 'tk-quant');
        break;
      case 'class':
        add(node.start, node.start + (node.negated ? 2 : 1), 'tk-set');
        for (const item of node.items) visit(item, depth);
        add(node.end - 1, node.end, 'tk-set');
        break;
      case 'range':
        add(node.start, node.end, 'tk-range');
        break;
      case 'classOperator':
        add(node.start, node.end, 'tk-alt');
        break;
      case 'classStrings':
        add(node.start, node.end, 'tk-esc');
        break;
      case 'escape':
        add(node.start, node.end, 'tk-esc');
        break;
      case 'anchor':
        add(node.start, node.end, 'tk-anchor');
        break;
      case 'dot':
        add(node.start, node.end, 'tk-dot');
        break;
      case 'backref':
      case 'property':
        add(node.start, node.end, 'tk-ref');
        break;
      case 'char':
        break;
    }
  };

  visit(ast, 0);
  return spans.sort((a, b) => a.start - b.start);
}
