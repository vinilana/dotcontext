import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createPlanLinker } from './planLinker';

describe('PlanLinker plan parsing', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-linker-test-'));
    await fs.mkdir(path.join(tempDir, '.context', 'plans'), { recursive: true });
    await fs.mkdir(path.join(tempDir, '.context', 'workflow'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('prefers canonical frontmatter phases and steps over body content', async () => {
    const planSlug = 'structured-delivery';
    const planPath = path.join(tempDir, '.context', 'plans', `${planSlug}.md`);

    await fs.writeFile(
      planPath,
      `---
type: plan
name: "Structured Delivery"
description: "Plan for structured delivery"
generated: "2026-04-12"
status: filled
scaffoldVersion: "2.0.0"
planSlug: "${planSlug}"
summary: "Ship structured metadata"
agents:
  - type: "planner"
    role: "Define scope"
docs:
  - "README.md"
phases:
  - id: "phase-1"
    name: "Discovery & Alignment"
    prevc: "P"
    deliverables:
      - "discovery-note"
    steps:
      - order: 1
        description: "Gather requirements"
        assignee: "planner"
        deliverables:
          - "requirements-summary"
      - order: 2
        description: "Validate constraints"
        deliverables:
          - "constraint-matrix"
  - id: "phase-2"
    name: "Implementation"
    prevc: "E"
    steps:
      - order: 1
        description: "Build feature"
        deliverables:
          - "code-changes"
---

# Structured Delivery Plan

### Phase 1 — Discovery & Alignment

| # | Task | Agent | Status | Deliverable |
| --- | --- | --- | --- | --- |
| 1.1 | Body fallback should be ignored | \`fallback\` | pending | should-not-win |
`
    );

    const linker = await createPlanLinker(tempDir, undefined, false);
    await linker.linkPlan(planSlug);
    const linked = await linker.getLinkedPlan(planSlug);

    expect(linked).not.toBeNull();
    expect(linked?.phases).toHaveLength(2);
    expect(linked?.phases[0]).toMatchObject({
      id: 'phase-1',
      name: 'Discovery & Alignment',
      prevcPhase: 'P',
      deliverables: ['discovery-note', 'requirements-summary', 'constraint-matrix'],
      steps: [
        {
          order: 1,
          description: 'Gather requirements',
          assignee: 'planner',
          deliverables: ['requirements-summary'],
          outputs: ['requirements-summary'],
          status: 'pending',
        },
        {
          order: 2,
          description: 'Validate constraints',
          deliverables: ['constraint-matrix'],
          outputs: ['constraint-matrix'],
          status: 'pending',
        },
      ],
    });
    expect(linked?.agents).toEqual(['planner']);
    expect(linked?.docs).toEqual(['README.md']);
  });

  it('falls back to task tables in the markdown body when structured frontmatter is absent', async () => {
    const planSlug = 'legacy-table-plan';
    const planPath = path.join(tempDir, '.context', 'plans', `${planSlug}.md`);

    await fs.writeFile(
      planPath,
      `# Legacy Table Plan

> Legacy plan with body task tables

### Phase 1 — Discovery & Alignment

**Tasks**

| # | Task | Agent | Status | Deliverable |
| --- | --- | --- | --- | --- |
| 1.1 | Gather requirements | \`planner\` | pending | requirements summary |
| 1.2 | Validate constraints | \`reviewer\` | pending | constraint matrix |

### Phase 2 — Implementation

**Tasks**

| # | Task | Agent | Status | Deliverable |
| --- | --- | --- | --- | --- |
| 2.1 | Build feature | \`developer\` | pending | code changes |
`
    );

    const linker = await createPlanLinker(tempDir, undefined, false);
    await linker.linkPlan(planSlug);
    const linked = await linker.getLinkedPlan(planSlug);

    expect(linked).not.toBeNull();
    expect(linked?.phases).toHaveLength(2);
    expect(linked?.phases[0].steps).toHaveLength(2);
    expect(linked?.phases[0].steps[0]).toMatchObject({
      order: 1,
      description: 'Gather requirements',
      assignee: 'planner',
      deliverables: ['requirements summary'],
      outputs: ['requirements summary'],
      status: 'pending',
    });
    expect(linked?.phases[1].steps[0]).toMatchObject({
      order: 1,
      description: 'Build feature',
      assignee: 'developer',
      deliverables: ['code changes'],
      outputs: ['code changes'],
      status: 'pending',
    });
  });
});
