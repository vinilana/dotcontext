import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createPlanLinker } from '../planLinker';
import { PlanTrackingStore } from '../planTrackingStore';

const PLAN_SLUG = 'autocommit-stdio';

async function setupGitRepo(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-autocommit-stdio-'));
  await fs.mkdir(path.join(tempDir, '.context', 'plans'), { recursive: true });
  await fs.mkdir(path.join(tempDir, '.context', 'runtime', 'workflows'), { recursive: true });

  const planPath = path.join(tempDir, '.context', 'plans', `${PLAN_SLUG}.md`);
  await fs.writeFile(
    planPath,
    `---
type: plan
name: "AutoCommit stdio"
description: "Regression for MCP stdout pollution"
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
        description: "Finish"
        deliverables:
          - "done"
---

# AutoCommit stdio
`
  );

  execSync('git init', { cwd: tempDir, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'pipe' });
  execSync('git add -A', { cwd: tempDir, stdio: 'pipe' });
  execSync('git commit -m "init"', { cwd: tempDir, stdio: 'pipe' });

  return tempDir;
}

describe('PlanUpdateOrchestrator auto-commit stdio safety', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupGitRepo();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('does not log AutoCommit diagnostics via console.info when a phase auto-commits', async () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const stderrSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const linker = await createPlanLinker(tempDir, undefined, true);
    await linker.linkPlan(PLAN_SLUG);

    const store = new PlanTrackingStore(path.join(tempDir, '.context', 'runtime', 'workflows'));
    const tracking = (await store.load(PLAN_SLUG)) ?? store.createEmpty(PLAN_SLUG);
    const now = new Date().toISOString();
    store.ensurePhase(tracking, 'phase-1', now);
    const step = store.ensureStep(tracking, 'phase-1', 1, 'Finish', now);
    step.status = 'in_progress';
    step.startedAt = now;
    await store.save(PLAN_SLUG, tracking);

    const ok = await linker.updatePlanStep(PLAN_SLUG, 'phase-1', 1, 'completed');
    expect(ok).toBe(true);

    const autoCommitInfo = infoSpy.mock.calls.filter((args) =>
      String(args[0] ?? '').includes('[AutoCommit]')
    );
    expect(autoCommitInfo).toHaveLength(0);

    const autoCommitStderr = stderrSpy.mock.calls.filter((args) =>
      String(args[0] ?? '').includes('[AutoCommit] Created commit')
    );
    expect(autoCommitStderr.length).toBeGreaterThanOrEqual(1);
  });
});