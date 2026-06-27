import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { recordHookTraceFailure } from '../../../harness';
import { buildCodexHooksDocument, buildCodexTomlHookBlocks } from '../../../integrations/codex';
import { HookDoctorService } from '../hookDoctorService';

describe('HookDoctorService', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-hook-doctor-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('returns a machine-readable Codex checklist for configured project hooks', async () => {
    await fs.outputJson(path.join(tempDir, '.codex', 'hooks.json'), buildCodexHooksDocument(), { spaces: 2 });
    await fs.ensureDir(path.join(tempDir, '.context'));

    const result = await new HookDoctorService().run({
      host: 'codex',
      repoPath: tempDir,
    });

    const report = result.reports[0];
    expect(result.exitCode).toBe(0);
    expect(report.host).toBe('codex');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'hook_config_found', status: 'pass' }),
      expect.objectContaining({ id: 'dotcontext_command_present', status: 'pass' }),
      expect.objectContaining({ id: 'dispatch_command_current', status: 'pass' }),
      expect.objectContaining({ id: 'context_initialized', status: 'pass' }),
    ]));
  });

  it('checks Codex TOML hooks feature flag', async () => {
    await fs.outputFile(
      path.join(tempDir, '.codex', 'config.toml'),
      buildCodexTomlHookBlocks({ includeFeatures: false }),
      'utf8'
    );
    await fs.ensureDir(path.join(tempDir, '.context'));

    const result = await new HookDoctorService().run({
      host: 'codex',
      repoPath: tempDir,
    });

    expect(result.exitCode).toBe(1);
    expect(result.reports[0].checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'codex_toml_hooks_feature',
        status: 'fail',
      }),
    ]));
  });

  it('reports trace append failures stored under .context/runtime/hooks', async () => {
    await fs.outputJson(path.join(tempDir, '.codex', 'hooks.json'), buildCodexHooksDocument(), { spaces: 2 });
    await fs.ensureDir(path.join(tempDir, '.context'));
    await recordHookTraceFailure({
      repoPath: tempDir,
      source: 'codex',
      reason: 'append_trace_failed',
      message: 'trace write failed',
    });

    const result = await new HookDoctorService().run({
      host: 'codex',
      repoPath: tempDir,
    });

    const traceFailureCheck = result.reports[0].checks.find((check) => check.id === 'trace_failures');
    expect(traceFailureCheck).toMatchObject({
      status: 'warn',
      path: path.join(tempDir, '.context', 'runtime', 'hooks', 'trace-failures.json'),
    });
    expect(traceFailureCheck?.details?.lastFailureAt).toBeDefined();
  });

  it('finds the latest Codex trace by reading the trace tail', async () => {
    await fs.outputJson(path.join(tempDir, '.codex', 'hooks.json'), buildCodexHooksDocument(), { spaces: 2 });
    const sessionDir = path.join(tempDir, '.context', 'runtime', 'sessions', 'session-codex');
    await fs.outputJson(path.join(sessionDir, 'session.json'), {
      name: 'hook:codex:host-session',
      metadata: { host: 'codex' },
      traceCount: 2,
    });
    await fs.outputFile(
      path.join(sessionDir, 'trace.jsonl'),
      `${'x'.repeat(70 * 1024)}\n${JSON.stringify({
        createdAt: new Date().toISOString(),
        event: 'tool.use',
      })}\n`
    );

    const result = await new HookDoctorService().run({
      host: 'codex',
      repoPath: tempDir,
    });

    expect(result.reports[0].checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'recent_trace',
        status: 'pass',
      }),
    ]));
  });

  it('marks unsupported doctor hosts as failed without throwing', async () => {
    const result = await new HookDoctorService().run({
      host: 'claude-code',
      repoPath: tempDir,
    });

    expect(result.exitCode).toBe(1);
    expect(result.reports[0].checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'doctor_available', status: 'fail' }),
    ]));
  });
});
