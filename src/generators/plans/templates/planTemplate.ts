import { PlanTemplateContext, CodebaseSnapshot } from './types';
import { SemanticContext } from '../../../services/semantic';
import {
  createPlanFrontmatter,
  serializeFrontmatter,
} from '../../../types/scaffoldFrontmatter';
import { PrevcPhase } from '../../../workflow/types';
import { mergeSuggestionsIntoPhases } from '../../../workflow/plans/scaffoldSuggestions';

interface TemplateStep {
  order: number;
  description: string;
  assignee: string;
  deliverables: string[];
}

interface TemplatePhase {
  id: string;
  name: string;
  prevc: PrevcPhase;
  primaryAgent: string;
  objective: string;
  commitCheckpoint: string;
  steps: TemplateStep[];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function renderCodebaseSnapshot(snapshot?: CodebaseSnapshot): string {
  if (!snapshot) {
    return `- **Codebase analysis:** *No codebase insights available.*`;
  }

  const lines = [
    `- **Total files analyzed:** ${snapshot.totalFiles}`,
    `- **Total symbols discovered:** ${snapshot.totalSymbols}`,
  ];

  if (snapshot.layers.length > 0) {
    lines.push(`- **Architecture layers:** ${snapshot.layers.join(', ')}`);
  }

  if (snapshot.patterns.length > 0) {
    lines.push(`- **Detected patterns:** ${snapshot.patterns.join(', ')}`);
  }

  if (snapshot.entryPoints.length > 0) {
    lines.push(`- **Entry points:** ${snapshot.entryPoints.slice(0, 3).join(', ')}${snapshot.entryPoints.length > 3 ? ` (+${snapshot.entryPoints.length - 3} more)` : ''}`);
  }

  return lines.join('\n');
}

function renderKeyComponents(semantics?: SemanticContext): string {
  if (!semantics) {
    return '';
  }

  const { symbols } = semantics;
  const keyClasses = symbols.classes.filter((symbol) => symbol.exported).slice(0, 5);
  const keyInterfaces = symbols.interfaces.filter((symbol) => symbol.exported).slice(0, 5);

  if (keyClasses.length === 0 && keyInterfaces.length === 0) {
    return '';
  }

  const lines = ['### Key Components'];

  if (keyClasses.length > 0) {
    lines.push('**Core Classes:**');
    keyClasses.forEach((cls) => {
      lines.push(`- \`${cls.name}\` — ${cls.location.file}:${cls.location.line}`);
    });
  }

  if (keyInterfaces.length > 0) {
    lines.push('', '**Key Interfaces:**');
    keyInterfaces.forEach((iface) => {
      lines.push(`- \`${iface.name}\` — ${iface.location.file}:${iface.location.line}`);
    });
  }

  return `${lines.join('\n')}\n`;
}

function renderPhaseSection(phase: TemplatePhase, phaseNumber: number): string {
  const taskRows = phase.steps
    .map((step) => `| ${phaseNumber}.${step.order} | ${step.description} | \`${step.assignee}\` | pending | ${step.deliverables.join(', ')} |`)
    .join('\n');

  return `### Phase ${phaseNumber} — ${phase.name}
> **Primary Agent:** \`${phase.primaryAgent}\` - [Playbook](../agents/${phase.primaryAgent}.md)

**Objective:** ${phase.objective}

**Tasks**

| # | Task | Agent | Status | Deliverable |
|---|------|-------|--------|-------------|
${taskRows}

**Commit Checkpoint**
- ${phase.commitCheckpoint}`;
}

export function renderPlanTemplate(context: PlanTemplateContext): string {
  const { title, slug, summary, agents, docs, semantics, codebaseSnapshot, phaseSuggestions } = context;
  const planSummary = summary?.trim() || 'TODO: Summarize the desired outcome and the problem this plan addresses.';

  const phases: TemplatePhase[] = [
    {
      id: 'phase-1',
      name: 'Discovery & Alignment',
      prevc: 'P',
      primaryAgent: 'TODO-agent',
      objective: 'TODO: Define the goal for this phase.',
      commitCheckpoint: 'After completing this phase, capture the agreed context and create a commit (for example, `git commit -m "chore(plan): complete phase 1 discovery"`).',
      steps: [
        {
          order: 1,
          description: 'TODO: Outline discovery task',
          assignee: 'TODO: agent',
          deliverables: ['TODO: Expected output'],
        },
        {
          order: 2,
          description: 'TODO: Capture open questions',
          assignee: 'TODO: agent',
          deliverables: ['TODO: Expected output'],
        },
      ],
    },
    {
      id: 'phase-2',
      name: 'Implementation & Iteration',
      prevc: 'E',
      primaryAgent: 'TODO-agent',
      objective: 'TODO: Define the goal for this phase.',
      commitCheckpoint: 'Summarize progress, update cross-links, and create a commit documenting the outcomes of this phase (for example, `git commit -m "chore(plan): complete phase 2 implementation"`).',
      steps: [
        {
          order: 1,
          description: 'TODO: Build task description',
          assignee: 'TODO: agent',
          deliverables: ['TODO: Expected output'],
        },
        {
          order: 2,
          description: 'TODO: Reference docs or playbooks',
          assignee: 'TODO: agent',
          deliverables: ['TODO: Expected output'],
        },
      ],
    },
    {
      id: 'phase-3',
      name: 'Validation & Handoff',
      prevc: 'V',
      primaryAgent: 'TODO-agent',
      objective: 'TODO: Define the goal for this phase.',
      commitCheckpoint: 'Record the validation evidence and create a commit signalling the handoff completion (for example, `git commit -m "chore(plan): complete phase 3 validation"`).',
      steps: [
        {
          order: 1,
          description: 'TODO: Testing and verification',
          assignee: 'TODO: agent',
          deliverables: ['TODO: Expected output'],
        },
        {
          order: 2,
          description: 'TODO: Documentation updates',
          assignee: 'TODO: agent',
          deliverables: ['TODO: Expected output'],
        },
        {
          order: 3,
          description: 'TODO: Capture evidence for maintainers',
          assignee: 'TODO: agent',
          deliverables: ['TODO: Expected output'],
        },
      ],
    },
  ];

  const agentTableRows = agents.length
    ? agents
      .map((agent) => `| ${agent.title} | TODO: Describe why this agent is involved. | [${agent.title}](../agents/${agent.type}.md) | ${agent.responsibility} |`)
      .join('\n')
    : '| Documentation Writer | TODO: Describe why this agent is involved. | [Documentation Writer](../agents/documentation-writer.md) | Create clear, comprehensive documentation |';

  const docsTableRows = docs.length
    ? docs
      .map((doc) => `| ${doc.title} | [${doc.file}](../docs/${doc.file}) | ${doc.primaryInputs} |`)
      .join('\n')
    : '| Documentation Index | [README.md](../docs/README.md) | Current docs directory listing |';

  const content = `# ${title} Plan

> ${planSummary}

## Task Snapshot
- **Primary goal:** TODO: Describe the outcome to achieve.
- **Success signal:** TODO: Define how the team will know the plan worked.
- **Key references:**
  - [Documentation Index](../docs/README.md)
  - [Agent Handbook](../agents/README.md)
  - [Plans Index](./README.md)

## Codebase Context
${renderCodebaseSnapshot(codebaseSnapshot)}

${renderKeyComponents(semantics)}## Agent Lineup
| Agent | Role in this plan | Playbook | First responsibility focus |
| --- | --- | --- | --- |
${agentTableRows}

## Documentation Touchpoints
| Guide | File | Primary Inputs |
| --- | --- | --- |
${docsTableRows}

## Risk Assessment
Identify potential blockers, dependencies, and mitigation strategies before beginning work.

### Identified Risks
| Risk | Probability | Impact | Mitigation Strategy | Owner (Agent) |
| --- | --- | --- | --- | --- |
| TODO: Dependency on external team | Medium | High | Early coordination meeting, clear requirements | \`TODO: agent\` |
| TODO: Insufficient test coverage | Low | Medium | Allocate time for test writing in Phase 2 | \`test-writer\` |

### Dependencies
- **Internal:** TODO: List dependencies on other teams, services, or infrastructure
- **External:** TODO: List dependencies on third-party services, vendors, or partners
- **Technical:** TODO: List technical prerequisites or required upgrades

### Assumptions
- TODO: Document key assumptions being made (e.g., "Assume current API schema remains stable")
- TODO: Note what happens if assumptions prove false

## Resource Estimation

### Time Allocation
| Phase | Estimated Effort | Calendar Time | Team Size |
| --- | --- | --- | --- |
| Phase 1 - Discovery | TODO: e.g., 2 person-days | 3-5 days | 1-2 people |
| Phase 2 - Implementation | TODO: e.g., 5 person-days | 1-2 weeks | 2-3 people |
| Phase 3 - Validation | TODO: e.g., 2 person-days | 3-5 days | 1-2 people |
| **Total** | **TODO: total** | **TODO: total** | **-** |

### Required Skills
- TODO: List required expertise (e.g., "React experience", "Database optimization", "Infrastructure knowledge")
- TODO: Identify skill gaps and training needs

### Resource Availability
- **Available:** TODO: List team members and their availability
- **Blocked:** TODO: Note any team members with conflicting priorities
- **Escalation:** TODO: Name of person to contact if resources are insufficient

## Working Phases

${phases.map((phase, index) => renderPhaseSection(phase, index + 1)).join('\n\n---\n\n')}

## Rollback Plan
Document how to revert changes if issues arise during or after implementation.

### Rollback Triggers
When to initiate rollback:
- Critical bugs affecting core functionality
- Performance degradation beyond acceptable thresholds
- Data integrity issues detected
- Security vulnerabilities introduced
- User-facing errors exceeding alert thresholds

### Rollback Procedures
#### Phase 1 Rollback
- Action: Discard discovery branch, restore previous documentation state
- Data Impact: None (no production changes)
- Estimated Time: < 1 hour

#### Phase 2 Rollback
- Action: TODO: Revert commits, restore database to pre-migration snapshot
- Data Impact: TODO: Describe any data loss or consistency concerns
- Estimated Time: TODO: e.g., 2-4 hours

#### Phase 3 Rollback
- Action: TODO: Full deployment rollback, restore previous version
- Data Impact: TODO: Document data synchronization requirements
- Estimated Time: TODO: e.g., 1-2 hours

### Post-Rollback Actions
1. Document reason for rollback in incident report
2. Notify stakeholders of rollback and impact
3. Schedule post-mortem to analyze failure
4. Update plan with lessons learned before retry

## Evidence & Follow-up

### Artifacts to Collect
- TODO: List artifacts (logs, PR links, test runs, design notes)

### Success Metrics
- TODO: Define measurable success criteria

### Follow-up Actions
| Action | Owner (Agent) | Due |
|--------|---------------|-----|
| TODO: Action description | \`TODO: agent\` | TODO: Date/milestone |
`;

  const frontmatter = createPlanFrontmatter(
    title,
    planSummary,
    slug,
    {
      summary: planSummary,
      agents: agents.length > 0
        ? agents.map((agent) => ({ type: agent.type, role: agent.responsibility }))
        : [{ type: 'documentation-writer', role: 'Create clear, comprehensive documentation' }],
      docs: docs.length > 0 ? docs.map((doc) => doc.file) : ['README.md'],
      phases: mergeSuggestionsIntoPhases(
        phases.map((phase) => ({
          id: phase.id,
          name: phase.name,
          prevc: phase.prevc,
          summary: phase.objective,
          deliverables: uniqueStrings(phase.steps.flatMap((step) => step.deliverables)),
          steps: phase.steps.map((step) => ({
            order: step.order,
            description: step.description,
            assignee: step.assignee,
            deliverables: step.deliverables,
          })),
        })),
        phaseSuggestions ?? {}
      ),
    }
  );

  return `${serializeFrontmatter(frontmatter)}\n\n${content}`;
}
