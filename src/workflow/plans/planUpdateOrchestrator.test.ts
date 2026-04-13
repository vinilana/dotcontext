import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createPlanLinker } from './planLinker';
import { PlanTrackingStore } from './planTrackingStore';
import { AcceptanceFailedError } from './acceptanceRunner';

const PLAN_SLUG = 'gates-mvp';

async function setupRepo(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-acceptance-'));
  await fs.mkdir(path.join(tempDir, '.context', 'plans'), { recursive: true });
  await fs.mkdir(path.join(tempDir, '.context', 'workflow'), { recursive: true });

  const planPath = path.join(tempDir, '.context', 'plans', `${PLAN_SLUG}.md`);
  await fs.writeFile(
    planPath,
    `---
type: plan
name: "Gates MVP"
description: "Acceptance gate test"
generated: "2026-04-13"
status: filled
scaffoldVersion: "2.0.0"
planSlug: "${PLAN_SLUG}"
summary: "Test plan"
agents:
  - type: "planner"
    role: "Define scope"
docs:
  - "README.md"
phases:
  - id: "phase-1"
    name: "Execute"
    prevc: "E"
    steps:
      - order: 1
        description: "Cobertura i18n 100%"
        deliverables:
          - "i18n-coverage"
---

# Gates MVP
`
  );
  return tempDir;
}

async function seedAcceptance(
  tempDir: string,
  command: string[]
): Promise<void> {
  const store = new PlanTrackingStore(path.join(tempDir, '.context', 'workflow'));
  const tracking =
    (await store.load(PLAN_SLUG)) ?? store.createEmpty(PLAN_SLUG);
  const now = new Date().toISOString();
  store.ensurePhase(tracking, 'phase-1', now);
  const step = store.ensureStep(tracking, 'phase-1', 1, 'Cobertura i18n 100%', now);
  step.acceptance = { kind: 'shell', command };
  step.status = 'in_progress';
  step.startedAt = now;
  await store.save(PLAN_SLUG, tracking);
}

describe('PlanUpdateOrchestrator acceptance gate', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupRepo();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('rejects done and preserves prior status when acceptance fails', async () => {
    const linker = await createPlanLinker(tempDir, undefined, false);
    await linker.linkPlan(PLAN_SLUG);
    await seedAcceptance(tempDir, ['node', '-e', 'process.exit(1)']);

    await expect(
      linker.updatePlanStep(PLAN_SLUG, 'phase-1', 1, 'completed')
    ).rejects.toBeInstanceOf(AcceptanceFailedError);

    const store = new PlanTrackingStore(path.join(tempDir, '.context', 'workflow'));
    const tracking = await store.load(PLAN_SLUG);
    const step = tracking!.phases['phase-1'].steps.find((s) => s.stepIndex === 1)!;
    expect(step.status).toBe('in_progress');
    expect(step.acceptanceRun?.passed).toBe(false);
    expect(step.acceptanceRun?.exitCode).toBe(1);
  });

  it('accepts done and records passing acceptance run', async () => {
    const linker = await createPlanLinker(tempDir, undefined, false);
    await linker.linkPlan(PLAN_SLUG);
    await seedAcceptance(tempDir, ['node', '-e', 'process.exit(0)']);

    const ok = await linker.updatePlanStep(PLAN_SLUG, 'phase-1', 1, 'completed');
    expect(ok).toBe(true);

    const store = new PlanTrackingStore(path.join(tempDir, '.context', 'workflow'));
    const tracking = await store.load(PLAN_SLUG);
    const step = tracking!.phases['phase-1'].steps.find((s) => s.stepIndex === 1)!;
    expect(step.status).toBe('completed');
    expect(step.acceptanceRun?.passed).toBe(true);
    expect(step.acceptanceRun?.exitCode).toBe(0);
  });

  it('skips acceptance when transitioning to non-completed status', async () => {
    const linker = await createPlanLinker(tempDir, undefined, false);
    await linker.linkPlan(PLAN_SLUG);
    await seedAcceptance(tempDir, ['node', '-e', 'process.exit(1)']);

    const ok = await linker.updatePlanStep(PLAN_SLUG, 'phase-1', 1, 'skipped');
    expect(ok).toBe(true);

    const store = new PlanTrackingStore(path.join(tempDir, '.context', 'workflow'));
    const tracking = await store.load(PLAN_SLUG);
    const step = tracking!.phases['phase-1'].steps.find((s) => s.stepIndex === 1)!;
    expect(step.status).toBe('skipped');
    // acceptance was not run
    expect(step.acceptanceRun).toBeUndefined();
  });
});
