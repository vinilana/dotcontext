import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createPlanLinker } from './planLinker';
import { PlanTrackingStore } from './planTrackingStore';

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

  it('projects the workflow index and markdown from canonical plan tracking', async () => {
    const planSlug = 'projection-canonical-state';
    const planPath = path.join(tempDir, '.context', 'plans', `${planSlug}.md`);
    const trackingPath = path.join(tempDir, '.context', 'workflow', 'plan-tracking', `${planSlug}.json`);
    const plansIndexPath = path.join(tempDir, '.context', 'workflow', 'plans.json');

    await fs.writeFile(
      planPath,
      `---
type: plan
name: "Projection Canonical State"
description: "Canonical tracking projection regression."
generated: "2026-04-12"
status: filled
scaffoldVersion: "2.0.0"
planSlug: "${planSlug}"
summary: "Verify tracking is canonical."
phases:
  - id: "phase-1"
    name: "Discovery & Alignment"
    prevc: "P"
    steps:
      - order: 1
        description: "Gather requirements"
        deliverables:
          - "discovery-note"
---

# Projection Canonical State

### Phase 1 — Discovery & Alignment

| # | Task | Agent | Status | Deliverable |
| --- | --- | --- | --- | --- |
| 1.1 | Gather requirements | \`planner\` | pending | discovery-note |
| 1.2 | Validate constraints | \`reviewer\` | pending | constraint-matrix |
`
    );

    const linker = await createPlanLinker(tempDir, undefined, false);
    await linker.linkPlan(planSlug);
    await linker.updatePlanStep(planSlug, 'phase-1', 1, 'completed', { output: 'discovery-note' });

    const tracking = JSON.parse(await fs.readFile(trackingPath, 'utf-8'));
    const plansIndex = JSON.parse(await fs.readFile(plansIndexPath, 'utf-8'));
    const projectedPlan = [...plansIndex.active, ...plansIndex.completed].find((plan: { slug: string }) => plan.slug === planSlug);
    const markdown = await fs.readFile(planPath, 'utf-8');

    expect(tracking.linkedAt).toBeDefined();
    expect(tracking.phases['phase-1'].steps[0]).toMatchObject({
      stepIndex: 1,
      status: 'completed',
      output: 'discovery-note',
    });
    expect(projectedPlan).toMatchObject({
      slug: planSlug,
      path: `plans/${planSlug}.md`,
      linkedAt: tracking.linkedAt,
    });
    expect(markdown).toContain('## Execution History');
    expect(markdown).toContain('| 1.1 | Gather requirements | `planner` | completed | discovery-note |');
  });

  it('hydrates linked plan execution state from tracking JSON instead of markdown defaults', async () => {
    const planSlug = 'tracked-plan';
    const planPath = path.join(tempDir, '.context', 'plans', `${planSlug}.md`);
    const workflowPath = path.join(tempDir, '.context', 'workflow');

    await fs.writeFile(
      planPath,
      `---
type: plan
name: "Tracked Plan"
description: "Plan with tracked execution"
generated: "2026-04-12"
status: filled
scaffoldVersion: "2.0.0"
planSlug: "${planSlug}"
summary: "Drive execution from tracking"
phases:
  - id: "phase-1"
    name: "Discovery & Alignment"
    prevc: "P"
    steps:
      - order: 1
        description: "Gather requirements"
      - order: 2
        description: "Validate constraints"
  - id: "phase-2"
    name: "Implementation"
    prevc: "E"
    steps:
      - order: 1
        description: "Build feature"
---

# Tracked Plan
`
    );

    const linker = await createPlanLinker(tempDir, undefined, false);
    await linker.linkPlan(planSlug);

    const trackingStore = new PlanTrackingStore(workflowPath);
    await trackingStore.save(planSlug, {
      planSlug,
      linkedAt: '2026-04-12T12:00:00.000Z',
      progress: 0,
      approvalStatus: 'approved',
      approvedAt: '2026-04-12T12:05:00.000Z',
      approvedBy: 'reviewer',
      lastUpdated: '2026-04-12T12:10:00.000Z',
      decisions: [
        {
          id: 'dec-1',
          title: 'Keep JSON canonical',
          description: 'Markdown is only a projection',
          status: 'accepted',
          decidedAt: '2026-04-12T12:09:00.000Z',
        },
      ],
      phases: {
        'phase-1': {
          phaseId: 'phase-1',
          status: 'completed',
          startedAt: '2026-04-12T12:00:00.000Z',
          completedAt: '2026-04-12T12:06:00.000Z',
          steps: [
            {
              stepIndex: 1,
              description: 'Gather requirements',
              status: 'completed',
              completedAt: '2026-04-12T12:02:00.000Z',
            },
            {
              stepIndex: 2,
              description: 'Validate constraints',
              status: 'completed',
              completedAt: '2026-04-12T12:06:00.000Z',
            },
          ],
        },
        'phase-2': {
          phaseId: 'phase-2',
          status: 'in_progress',
          startedAt: '2026-04-12T12:07:00.000Z',
          steps: [
            {
              stepIndex: 1,
              description: 'Build feature',
              status: 'in_progress',
              startedAt: '2026-04-12T12:08:00.000Z',
            },
          ],
        },
      },
    });

    const linked = await linker.getLinkedPlan(planSlug);
    const progress = await linker.getPlanProgress(planSlug);

    expect(linked).not.toBeNull();
    expect(linked?.progress).toBe(67);
    expect(linked?.currentPhase).toBe('phase-2');
    expect(linked?.ref).toMatchObject({
      approval_status: 'approved',
      approved_at: '2026-04-12T12:05:00.000Z',
      approved_by: 'reviewer',
    });
    expect(linked?.decisions).toEqual([
      expect.objectContaining({
        id: 'dec-1',
        title: 'Keep JSON canonical',
      }),
    ]);
    expect(linked?.phases.map((phase) => phase.status)).toEqual(['completed', 'in_progress']);
    expect(progress).toEqual({
      overall: 67,
      byPhase: {
        P: { total: 1, completed: 1, percentage: 100 },
        R: { total: 0, completed: 0, percentage: 0 },
        E: { total: 1, completed: 0, percentage: 0 },
        V: { total: 0, completed: 0, percentage: 0 },
        C: { total: 0, completed: 0, percentage: 0 },
      },
    });
  });

  it('persists progress against document step count when only part of a phase is tracked', async () => {
    const planSlug = 'partial-progress-plan';
    const planPath = path.join(tempDir, '.context', 'plans', `${planSlug}.md`);

    await fs.writeFile(
      planPath,
      `---
type: plan
name: "Partial Progress Plan"
description: "Plan for partial progress"
generated: "2026-04-12"
status: filled
scaffoldVersion: "2.0.0"
planSlug: "${planSlug}"
summary: "Measure progress against planned steps"
phases:
  - id: "phase-1"
    name: "Implementation"
    prevc: "E"
    steps:
      - order: 1
        description: "Implement first slice"
      - order: 2
        description: "Implement second slice"
---

# Partial Progress Plan
`
    );

    const linker = await createPlanLinker(tempDir, undefined, false);
    await linker.linkPlan(planSlug);
    await linker.updatePlanStep(planSlug, 'phase-1', 1, 'completed', { output: 'slice-1' });

    const linked = await linker.getLinkedPlan(planSlug);
    const tracking = await linker.getPlanExecutionStatus(planSlug);

    expect(linked?.progress).toBe(50);
    expect(tracking?.progress).toBe(50);
    expect(linked?.phases[0].steps).toEqual([
      expect.objectContaining({ order: 1, status: 'completed', outputs: ['slice-1'] }),
      expect.objectContaining({ order: 2, status: 'pending' }),
    ]);
  });
});
