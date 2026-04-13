/**
 * End-to-end tests for the "LLM claims completion without evidence" scenario.
 *
 * Each scenario provokes an advance that should be blocked, then asserts that
 * tracking state (harness session, workflow status, task contracts) did not
 * drift into a post-transition state. This is the regression surface for
 * P0-1 (execution_evidence gate), P0-2 (autonomous_mode scope), and
 * P0-3 (no silent sync swallow).
 */

import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { WorkflowGateError } from '../../../workflow/errors';
import { HarnessPlansService } from '../../harness';
import { HarnessWorkflowBlockedError, WorkflowService } from '../workflowService';

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-false-completion-'));
  await fs.writeJson(
    path.join(dir, 'package.json'),
    {
      name: 'false-completion-test',
      version: '1.0.0',
      scripts: { build: 'node -e "process.exit(0)"' },
    },
    { spaces: 2 }
  );
  return dir;
}

describe('false completion e2e', () => {
  let tempDir: string;
  let service: WorkflowService;

  beforeEach(async () => {
    tempDir = await makeRepo();
    service = new WorkflowService(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('P -> R without a linked plan throws plan_required gate error', async () => {
    await service.init({ name: 'plan-gate', scale: 'MEDIUM' });

    await expect(service.advance()).rejects.toBeInstanceOf(WorkflowGateError);

    const status = await service.getStatus();
    expect(status.project.current_phase).toBe('P');
    expect(status.phases.P.status).toBe('in_progress');
    expect(status.phases.R.status).toBe('pending');
  });

  it('R -> E without plan approval throws approval_required gate error', async () => {
    await service.init({ name: 'approval-gate', scale: 'MEDIUM' });
    // Bypass plan gate by marking a plan as created directly.
    await service.markPlanCreated('stub-plan');
    await service.advance(); // P -> R

    expect((await service.getStatus()).project.current_phase).toBe('R');

    await expect(service.advance()).rejects.toBeInstanceOf(WorkflowGateError);

    const status = await service.getStatus();
    expect(status.project.current_phase).toBe('R');
    expect(status.phases.R.status).toBe('in_progress');
    expect(status.phases.E.status).toBe('pending');
  });

  it('E -> V with required sensors but zero sensor runs is blocked even in autonomous mode', async () => {
    await service.init({ name: 'evidence-gate', scale: 'MEDIUM', autonomous: true });

    // Autonomous suppresses plan/approval gates, so P -> R -> E should pass
    // without linking a plan.
    await service.advance(); // P -> R
    await service.advance(); // R -> E
    expect((await service.getStatus()).project.current_phase).toBe('E');

    // Define a task with evidence requirements; advance must not silently
    // complete without sensor runs / artifacts.
    await service.defineHarnessTask({
      title: 'Implement evidence gate',
      requiredSensors: ['build'],
      requiredArtifacts: ['handoff-summary'],
    });

    // Advance may surface the block via the harness backpressure layer
    // (HarnessWorkflowBlockedError) or via the execution_evidence gate
    // (WorkflowGateError). Both are acceptable outcomes — what matters is
    // that the transition is refused and no state drift occurs.
    const error = await service.advance().then(
      () => null,
      (e) => e
    );
    expect(error).toBeTruthy();
    expect(
      error instanceof WorkflowGateError || error instanceof HarnessWorkflowBlockedError
    ).toBe(true);

    const status = await service.getStatus();
    expect(status.project.current_phase).toBe('E');
    expect(status.phases.E.status).toBe('in_progress');
    expect(status.phases.V.status).toBe('pending');

    const harness = await service.getHarnessStatus();
    expect(harness?.binding.activeTaskId).toBeDefined();
    const activeTask = harness?.taskContracts.find(
      (t) => t.id === harness.binding.activeTaskId
    );
    expect(activeTask?.status).toBe('ready');
  });

  it('plan link rejects a plan whose E phase declares no required_sensors', async () => {
    await service.init({ name: 'link-rejects-empty', scale: 'MEDIUM' });

    const plansDir = path.join(tempDir, '.context', 'plans');
    await fs.ensureDir(plansDir);
    await fs.writeFile(
      path.join(plansDir, 'no-requirements.md'),
      [
        '---',
        'type: plan',
        'name: no-requirements',
        'description: "Plan missing execution evidence on E phase."',
        'planSlug: no-requirements',
        'generated: "2026-04-13"',
        'status: filled',
        'scaffoldVersion: "2.0.0"',
        'phases:',
        '  - id: phase-1',
        '    name: Planning',
        '    prevc: P',
        '  - id: phase-2',
        '    name: Implementation',
        '    prevc: E',
        '---',
        '',
        '# No Requirements',
        '',
        '> Missing execution evidence.',
        '',
      ].join('\n'),
      'utf-8'
    );

    const plans = new HarnessPlansService({ repoPath: tempDir });
    await expect(plans.link('no-requirements')).rejects.toThrow(
      /required_sensors/
    );
  });

  it('E -> V is blocked when glob spec minMatches is not satisfied (i18n scenario)', async () => {
    await service.init({ name: 'i18n-gate', scale: 'MEDIUM', autonomous: true });
    await service.advance(); // P -> R
    await service.advance(); // R -> E

    await service.defineHarnessTask({
      title: 'Translate all locales',
      requiredSensors: [],
      requiredArtifacts: [
        { kind: 'glob', glob: 'locales/**/*.json', minMatches: 5 },
      ],
    });

    // Record only 2 of 5 required locales.
    await service.recordHarnessArtifact({
      name: 'pt-BR.json', kind: 'text', path: 'locales/pt-BR.json', content: '{}',
    });
    await service.recordHarnessArtifact({
      name: 'en-US.json', kind: 'text', path: 'locales/en-US.json', content: '{}',
    });

    const error = await service.advance().then(() => null, (e) => e);
    expect(error).toBeTruthy();
    expect(
      error instanceof WorkflowGateError || error instanceof HarnessWorkflowBlockedError
    ).toBe(true);

    const reasons =
      error instanceof HarnessWorkflowBlockedError
        ? error.reasons.join(' | ')
        : String(error?.message ?? '');
    expect(reasons).toMatch(/locales\/\*\*\/\*\.json/);
    expect(reasons).toMatch(/got 2/);

    const status = await service.getStatus();
    expect(status.project.current_phase).toBe('E');
  });

  it('E -> V succeeds once required sensors pass and artifacts are recorded', async () => {
    await service.init({ name: 'evidence-ok', scale: 'MEDIUM', autonomous: true });

    await service.advance(); // P -> R
    await service.advance(); // R -> E

    await service.defineHarnessTask({
      title: 'Implement evidence ok',
      requiredSensors: ['build'],
      requiredArtifacts: ['handoff-summary'],
    });
    await service.recordHarnessArtifact({
      name: 'handoff-summary',
      kind: 'text',
      content: 'ready',
    });
    const sensorResult = await service.runHarnessSensors(['build']);
    expect(sensorResult.backpressure.blocked).toBe(false);

    const nextPhase = await service.advance();
    expect(nextPhase).toBe('V');

    const status = await service.getStatus();
    expect(status.project.current_phase).toBe('V');
    expect(status.phases.E.status).toBe('completed');
  });
});
