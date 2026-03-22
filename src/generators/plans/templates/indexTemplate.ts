import { PlanIndexEntry } from './types';

export function renderPlanIndex(entries: PlanIndexEntry[]): string {
  const planList = entries.length
    ? entries
        .map((entry, index) => `${index + 1}. [${entry.title}](./${entry.slug}.md)`)
        .join('\n')
    : '_No plans created yet. Use "dotcontext plan <name>" to create the first one._';

  return `# Collaboration Plans

This directory contains plans for coordinating work across documentation and playbooks.

## Plan Queue
${planList}

## How To Create Or Update Plans
- Run "dotcontext plan <name>" to scaffold a new plan template.
- Run "dotcontext plan <name> --fill" to have an LLM refresh the plan using the latest repository context.

## Related Resources
- [Agent Handbook](../agents/README.md)
- [Documentation Index](../docs/README.md)
- [Agent Knowledge Base](../../AGENTS.md)
- [Contributor Guidelines](../../CONTRIBUTING.md)
`;
}
