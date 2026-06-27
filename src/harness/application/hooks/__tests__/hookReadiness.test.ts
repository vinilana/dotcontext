import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { WorkflowService } from '../../workflow';
import {
  buildHookReadinessSummary,
  buildHookTraceData,
  consumeWorkflowMissingReminder,
  formatHookReadinessAdditionalContext,
  getHookReadinessSummary,
  recordHookTraceFailure,
  readHookTraceFailures,
} from '../..';

describe('hook readiness runtime helpers', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-hook-readiness-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  async function createReadyContext(): Promise<void> {
    await fs.outputFile(path.join(tempDir, '.context', 'docs', 'overview.md'), '# Overview\n');
    await fs.outputFile(path.join(tempDir, '.context', 'agents', 'developer.md'), '# Developer\n');
    await fs.outputFile(path.join(tempDir, '.context', 'skills', 'feature', 'SKILL.md'), '# Skill\n');
    await fs.outputFile(
      path.join(tempDir, '.context', 'runtime', 'sessions', 'session-1', 'session.json'),
      '{}\n'
    );
  }

  it('reports missing context without creating .context runtime state', async () => {
    const summary = await getHookReadinessSummary({ repoPath: tempDir });
    const message = formatHookReadinessAdditionalContext(summary, { source: 'codex' });

    expect(summary).toMatchObject({
      context: 'missing',
      workflow: 'none',
      missing: ['.context'],
    });
    expect(message).toContain('Host: codex');
    expect(message).toContain('context init');
    expect(await fs.pathExists(path.join(tempDir, '.context'))).toBe(false);
  });

  it('distinguishes partial context and caps missing gaps at three', async () => {
    await fs.ensureDir(path.join(tempDir, '.context'));

    const summary = await getHookReadinessSummary({ repoPath: tempDir });
    const message = formatHookReadinessAdditionalContext(summary);

    expect(summary.context).toBe('partial');
    expect(summary.missing).toHaveLength(3);
    expect(summary.missing).toEqual(['docs', 'agents', 'skills']);
    expect(message).toContain('setup is still missing: docs, agents, skills');
  });

  it('reports ready context and emits workflow missing reminder only when requested', async () => {
    await createReadyContext();

    const summary = await buildHookReadinessSummary(tempDir);
    const quietMessage = formatHookReadinessAdditionalContext(summary);
    const reminderMessage = formatHookReadinessAdditionalContext(summary, {
      workflowMissingReminder: true,
    });

    expect(summary.context).toBe('ready');
    expect(summary.workflow).toBe('none');
    expect(quietMessage).not.toContain('no PREVC workflow is active');
    expect(reminderMessage).toContain('no PREVC workflow is active');
  });

  it('does not count hook runtime diagnostics as harness runtime readiness', async () => {
    await fs.outputFile(path.join(tempDir, '.context', 'docs', 'overview.md'), '# Overview\n');
    await fs.outputFile(path.join(tempDir, '.context', 'agents', 'developer.md'), '# Developer\n');
    await fs.outputFile(path.join(tempDir, '.context', 'skills', 'feature', 'SKILL.md'), '# Skill\n');
    await fs.outputJson(path.join(tempDir, '.context', 'runtime', 'hooks', 'reminders.json'), {
      workflowMissingReminder: {
        lastShownAt: '2026-06-26T10:00:00.000Z',
        cooldownHours: 24,
      },
    });

    const summary = await buildHookReadinessSummary(tempDir);

    expect(summary.context).toBe('partial');
    expect(summary.missing).toEqual(['workflow', 'plans', 'harness']);
  });

  it('adds a PREVC preflight summary when workflow is active', async () => {
    await createReadyContext();
    const workflowService = await WorkflowService.create(tempDir);
    await workflowService.init({
      name: 'feature-x',
      scale: 'SMALL',
    });

    const summary = await getHookReadinessSummary({ repoPath: tempDir });
    const message = formatHookReadinessAdditionalContext(summary);

    expect(summary.context).toBe('ready');
    expect(summary.workflow).toBe('active');
    expect(summary.preflight).toMatchObject({
      phase: 'P',
      nextGate: expect.stringContaining('plan'),
      planLinked: false,
    });
    expect(message).toContain('dotcontext workflow: phase P');
    expect(message).toContain('Likely gate: linked plan');
  });

  it('persists workflow missing reminder cooldown under runtime hooks', async () => {
    await fs.ensureDir(path.join(tempDir, '.context'));
    const now = new Date('2026-06-26T10:00:00.000Z');

    await expect(consumeWorkflowMissingReminder({ repoPath: tempDir, now })).resolves.toBe(true);
    await expect(consumeWorkflowMissingReminder({ repoPath: tempDir, now })).resolves.toBe(false);
    await expect(consumeWorkflowMissingReminder({
      repoPath: tempDir,
      now: new Date('2026-06-27T11:00:00.000Z'),
    })).resolves.toBe(true);

    expect(await fs.pathExists(path.join(tempDir, '.context', 'runtime', 'hooks', 'reminders.json')))
      .toBe(true);
  });

  it('does not persist reminder state before .context exists', async () => {
    await expect(consumeWorkflowMissingReminder({ repoPath: tempDir })).resolves.toBe(false);
    expect(await fs.pathExists(path.join(tempDir, '.context'))).toBe(false);
  });

  it('records trace failure counters in runtime hooks when .context exists', async () => {
    await fs.ensureDir(path.join(tempDir, '.context'));
    const now = new Date('2026-06-26T10:00:00.000Z');

    await expect(recordHookTraceFailure({ repoPath: tempDir, now, source: 'codex' }))
      .resolves.toMatchObject({ recorded: true, count: 1, shouldWarn: false });
    await recordHookTraceFailure({
      repoPath: tempDir,
      now: new Date('2026-06-26T10:01:00.000Z'),
      source: 'codex',
    });
    await expect(recordHookTraceFailure({
      repoPath: tempDir,
      now: new Date('2026-06-26T10:02:00.000Z'),
      source: 'codex',
      message: 'trace write failed',
      hostSessionId: 'host-session-1',
      harnessSessionId: 'harness-session-1',
    })).resolves.toMatchObject({ recorded: true, count: 3, shouldWarn: true });

    const state = await fs.readJson(path.join(tempDir, '.context', 'runtime', 'hooks', 'trace-failures.json'));
    expect(state).toMatchObject({
      version: 1,
      total: 3,
    });
    expect(state.recent).toHaveLength(3);

    await expect(readHookTraceFailures(tempDir)).resolves.toMatchObject({
      exists: true,
      total: 3,
      recent: expect.arrayContaining([
        expect.objectContaining({
          source: 'codex',
          message: 'trace write failed',
          hostSessionId: 'host-session-1',
          harnessSessionId: 'harness-session-1',
        }),
      ]),
    });
  });

  it('classifies Bash commands without running extra commands', () => {
    expect(buildHookTraceData('Bash', { command: 'npm test -- --runInBand' }))
      .toMatchObject({ classification: 'test' });
    expect(buildHookTraceData('Bash', { command: 'rm -r -f ./tmp' }))
      .toMatchObject({ classification: 'destructive' });
    expect(buildHookTraceData('Bash', { command: 'rm --recursive --force ./tmp' }))
      .toMatchObject({ classification: 'destructive' });
    expect(buildHookTraceData('Bash', { command: 'git diff -- src' }))
      .toMatchObject({ classification: 'inspection' });
    expect(buildHookTraceData('Write', { file_path: 'README.md' }))
      .toEqual({ tool_input: { file_path: 'README.md' } });
  });
});
