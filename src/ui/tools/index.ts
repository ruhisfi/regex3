import type { Tool as ToolName } from '../../state/state';
import { byId, h } from '../dom';
import type { Context } from '../context';
import { createDetailsTool } from './details';
import { createExplainTool } from './explain';
import { createListTool } from './list';
import { createReplaceTool } from './replace';
import type { Tool, ToolFactory } from './tool';

const TOOLS: ReadonlyArray<{ name: ToolName; label: string; create: ToolFactory }> = [
  { name: 'explain', label: 'Explain', create: createExplainTool },
  { name: 'details', label: 'Details', create: createDetailsTool },
  { name: 'list', label: 'List', create: createListTool },
  { name: 'replace', label: 'Replace', create: createReplaceTool },
];

export function mountTools(ctx: Context): void {
  const { state, analyzer, highlights } = ctx;
  const tabs = byId('tool-tabs');
  const panels = byId('tool-panels');

  const instances = new Map<ToolName, { tool: Tool; tab: HTMLButtonElement; panel: HTMLElement }>();

  TOOLS.forEach(({ name, label, create }, index) => {
    const tab = h(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: `tab-${name}`,
        'aria-controls': `panel-${name}`,
        onclick: () => state.update({ tool: name }),
        onkeydown: (event) => {
          const key = (event as KeyboardEvent).key;
          const step = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
          if (step === 0) return;
          const target = TOOLS[(index + step + TOOLS.length) % TOOLS.length]!;
          state.update({ tool: target.name });
          instances.get(target.name)?.tab.focus();
        },
      },
      label,
    );
    const tool = create(ctx);
    const panel = h('div', { role: 'tabpanel', id: `panel-${name}`, 'aria-labelledby': `tab-${name}`, hidden: true }, tool.el);
    tabs.append(tab);
    panels.append(panel);
    instances.set(name, { tool, tab, panel });
  });

  function renderActive(): void {
    const active = state.get().tool;
    for (const [name, { tab, panel }] of instances) {
      const selected = name === active;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panel.hidden = !selected;
    }
    instances.get(active)?.tool.update();
  }

  const refresh = () => instances.get(state.get().tool)?.tool.update();

  state.subscribe((next, prev) => {
    if (next.tool !== prev.tool) renderActive();
    else if (
      next.pattern !== prev.pattern ||
      next.flavor !== prev.flavor ||
      next.listTemplate !== prev.listTemplate ||
      next.replacement !== prev.replacement ||
      next.flags !== prev.flags
    ) {
      refresh();
    }
  });
  analyzer.syntax.subscribe(refresh);
  analyzer.results.subscribe(refresh);

  // Leaving a tool must not leave a stale emphasis behind in the editor or text.
  state.subscribe((next, prev) => {
    if (next.tool !== prev.tool) highlights.update({ pattern: null, text: null });
  });

  renderActive();
}
