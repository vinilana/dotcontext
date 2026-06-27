import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';

import { runHookDispatch } from '../hookDispatchService';
import {
  getHookHarnessSessionId,
  saveHookHarnessSession,
} from '../../../integrations/shared/hookSessionStore';
import { WorkflowService } from '../../../harness';

describe('HookDispatchService session lifecycle', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-hook-dispatch-'));
    await fs.ensureDir(path.join(tempDir, '.context', 'runtime', 'sessions'));
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

  it('binds host session on SessionStart and appends trace on PostToolUse', async () => {
    const sessionId = 'host-session-abc';

    const startStdin = PassThrough.from([
      JSON.stringify({
        session_id: sessionId,
        cwd: tempDir,
        hook_event_name: 'SessionStart',
      }),
    ]);
    const startStdout = new PassThrough();
    startStdout.on('data', () => {});

    const startResult = await runHookDispatch({
      source: 'claude-code',
      repoPath: tempDir,
      stdin: startStdin,
      stdout: startStdout,
    });

    expect(startResult.exitCode).toBe(0);

    const harnessSessionId = await getHookHarnessSessionId({
      repoPath: tempDir,
      source: 'claude-code',
      hostSessionId: sessionId,
    });
    expect(harnessSessionId).toBeDefined();

    const postStdin = PassThrough.from([
      JSON.stringify({
        session_id: sessionId,
        cwd: tempDir,
        hook_event_name: 'PostToolUse',
        tool_name: 'Write',
        tool_input: { file_path: 'README.md' },
      }),
    ]);
    const postStdout = new PassThrough();
    postStdout.on('data', () => {});

    const postResult = await runHookDispatch({
      source: 'claude-code',
      repoPath: tempDir,
      stdin: postStdin,
      stdout: postStdout,
    });

    expect(postResult.exitCode).toBe(0);
    expect(postResult.output).toEqual({ continue: true });

    const tracePath = path.join(
      tempDir,
      '.context',
      'runtime',
      'sessions',
      harnessSessionId!,
      'trace.jsonl'
    );
    expect(await fs.pathExists(tracePath)).toBe(true);
    const traceContent = await fs.readFile(tracePath, 'utf8');
    expect(traceContent).toContain('tool.use');
  });

  it('runs context check before binding SessionStart sessions in uninitialized repos', async () => {
    await fs.remove(path.join(tempDir, '.context'));

    const sessionId = 'host-session-uninitialized';
    const startStdin = PassThrough.from([
      JSON.stringify({
        session_id: sessionId,
        cwd: tempDir,
        hook_event_name: 'SessionStart',
      }),
    ]);
    const startStdout = new PassThrough();
    startStdout.on('data', () => {});

    const startResult = await runHookDispatch({
      source: 'claude-code',
      repoPath: tempDir,
      stdin: startStdin,
      stdout: startStdout,
    });

    expect(startResult.exitCode).toBe(0);
    await expect(getHookHarnessSessionId({
      repoPath: tempDir,
      source: 'claude-code',
      hostSessionId: sessionId,
    })).resolves.toBeUndefined();
    expect(await fs.pathExists(path.join(tempDir, '.context', 'runtime'))).toBe(false);
  });

  it.each(['claude-code', 'codex'] as const)(
    'emits short SessionStart guidance for %s without creating .context',
    async (source) => {
      await fs.remove(path.join(tempDir, '.context'));

      const startStdin = PassThrough.from([
        JSON.stringify({
          session_id: `host-session-missing-${source}`,
          cwd: tempDir,
          hook_event_name: 'SessionStart',
        }),
      ]);
      const startStdout = new PassThrough();
      startStdout.on('data', () => {});

      const startResult = await runHookDispatch({
        source,
        repoPath: tempDir,
        stdin: startStdin,
        stdout: startStdout,
      });

      expect(startResult.exitCode).toBe(0);
      expect(startResult.output).toMatchObject({
        source,
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: expect.stringContaining('this repository does not have .context/ yet'),
        },
      });
      expect(JSON.stringify(startResult.output)).toContain('context init');
      expect(await fs.pathExists(path.join(tempDir, '.context'))).toBe(false);
      expect(await fs.pathExists(path.join(tempDir, '.context', 'runtime', 'logs'))).toBe(false);
    }
  );

  it('resolves hook cwd upward before binding SessionStart sessions', async () => {
    const nestedCwd = path.join(tempDir, 'packages', 'app');
    await fs.ensureDir(nestedCwd);

    const sessionId = 'host-session-subdir';
    const startStdin = PassThrough.from([
      JSON.stringify({
        session_id: sessionId,
        cwd: nestedCwd,
        hook_event_name: 'SessionStart',
      }),
    ]);
    const startStdout = new PassThrough();
    startStdout.on('data', () => {});

    const startResult = await runHookDispatch({
      source: 'codex',
      stdin: startStdin,
      stdout: startStdout,
    });

    expect(startResult.exitCode).toBe(0);
    await expect(getHookHarnessSessionId({
      repoPath: tempDir,
      source: 'codex',
      hostSessionId: sessionId,
    })).resolves.toBeDefined();
    await expect(getHookHarnessSessionId({
      repoPath: nestedCwd,
      source: 'codex',
      hostSessionId: sessionId,
    })).resolves.toBeUndefined();
  });

  it('keeps --repo-path precedence over hook cwd root discovery', async () => {
    const overrideRoot = path.join(tempDir, 'override-root');
    const nestedCwd = path.join(tempDir, 'packages', 'app');
    await fs.ensureDir(path.join(overrideRoot, '.context', 'runtime', 'sessions'));
    await fs.ensureDir(nestedCwd);

    const sessionId = 'host-session-override-root';
    const startStdin = PassThrough.from([
      JSON.stringify({
        session_id: sessionId,
        cwd: nestedCwd,
        hook_event_name: 'SessionStart',
      }),
    ]);
    const startStdout = new PassThrough();
    startStdout.on('data', () => {});

    const startResult = await runHookDispatch({
      source: 'codex',
      repoPath: overrideRoot,
      stdin: startStdin,
      stdout: startStdout,
    });

    expect(startResult.exitCode).toBe(0);
    await expect(getHookHarnessSessionId({
      repoPath: overrideRoot,
      source: 'codex',
      hostSessionId: sessionId,
    })).resolves.toBeDefined();
    await expect(getHookHarnessSessionId({
      repoPath: tempDir,
      source: 'codex',
      hostSessionId: sessionId,
    })).resolves.toBeUndefined();
  });

  it('recreates stale PostToolUse session bindings and keeps hooks non-blocking', async () => {
    const sessionId = 'host-session-stale';
    await saveHookHarnessSession({
      harnessSessionId: 'missing-harness-session',
      hostSessionId: sessionId,
      source: 'claude-code',
      repoPath: tempDir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const postStdin = PassThrough.from([
      JSON.stringify({
        session_id: sessionId,
        cwd: tempDir,
        hook_event_name: 'PostToolUse',
        tool_name: 'Write',
        tool_input: { file_path: 'README.md' },
      }),
    ]);
    const postStdout = new PassThrough();
    postStdout.on('data', () => {});

    const postResult = await runHookDispatch({
      source: 'claude-code',
      repoPath: tempDir,
      stdin: postStdin,
      stdout: postStdout,
    });

    expect(postResult.exitCode).toBe(0);
    expect(postResult.output).toEqual({ continue: true });

    const recreatedSessionId = await getHookHarnessSessionId({
      repoPath: tempDir,
      source: 'claude-code',
      hostSessionId: sessionId,
    });
    expect(recreatedSessionId).toBeDefined();
    expect(recreatedSessionId).not.toBe('missing-harness-session');

    const tracePath = path.join(
      tempDir,
      '.context',
      'runtime',
      'sessions',
      recreatedSessionId!,
      'trace.jsonl'
    );
    const traceContent = await fs.readFile(tracePath, 'utf8');
    expect(traceContent).toContain('tool.use');
  });

  it('records trace append failures without blocking PostToolUse', async () => {
    const sessionId = 'host-session-trace-failure';
    await saveHookHarnessSession({
      harnessSessionId: 'missing-harness-session',
      hostSessionId: sessionId,
      source: 'codex',
      repoPath: tempDir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await fs.remove(path.join(tempDir, '.context', 'runtime', 'sessions'));
    await fs.outputFile(path.join(tempDir, '.context', 'runtime', 'sessions'), 'not-a-directory');

    const postStdin = PassThrough.from([
      JSON.stringify({
        session_id: sessionId,
        cwd: tempDir,
        hook_event_name: 'PostToolUse',
        tool_name: 'Write',
        tool_input: { file_path: 'README.md' },
      }),
    ]);
    const postStdout = new PassThrough();
    postStdout.on('data', () => {});

    const postResult = await runHookDispatch({
      source: 'codex',
      repoPath: tempDir,
      stdin: postStdin,
      stdout: postStdout,
    });

    expect(postResult.exitCode).toBe(0);
    expect(postResult.output).toEqual({ continue: true });

    const failures = await fs.readJson(path.join(
      tempDir,
      '.context',
      'runtime',
      'hooks',
      'trace-failures.json'
    ));
    expect(failures.total).toBe(1);
    expect(failures.recent[0]).toMatchObject({
      source: 'codex',
      reason: 'stale_session_recovery_failed',
      hostSessionId: sessionId,
      harnessSessionId: 'missing-harness-session',
    });
  });

  it('maps accepted hook event aliases to canonical response event names', async () => {
    const startStdin = PassThrough.from([
      JSON.stringify({
        session_id: 'host-session-alias',
        cwd: tempDir,
        hook_event_name: 'session_start',
      }),
    ]);
    const startStdout = new PassThrough();
    startStdout.on('data', () => {});

    const startResult = await runHookDispatch({
      source: 'codex',
      repoPath: tempDir,
      stdin: startStdin,
      stdout: startStdout,
    });

    expect(startResult.exitCode).toBe(0);
    expect(startResult.output).toMatchObject({
      source: 'codex',
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
      },
    });
  });

  it('emits workflow missing reminder only once per cooldown on SessionStart', async () => {
    await createReadyContext();

    const runStart = (sessionId: string) => runHookDispatch({
      source: 'codex',
      repoPath: tempDir,
      stdin: PassThrough.from([
        JSON.stringify({
          session_id: sessionId,
          cwd: tempDir,
          hook_event_name: 'SessionStart',
        }),
      ]),
      stdout: new PassThrough().on('data', () => {}),
    });

    const first = await runStart('host-session-reminder-1');
    const second = await runStart('host-session-reminder-2');

    expect(JSON.stringify(first.output)).toContain('no PREVC workflow is active');
    expect(JSON.stringify(second.output)).not.toContain('no PREVC workflow is active');
    expect(await fs.pathExists(path.join(tempDir, '.context', 'runtime', 'hooks', 'reminders.json')))
      .toBe(true);
  });

  it('emits active workflow preflight on SessionStart', async () => {
    await createReadyContext();
    const workflowService = await WorkflowService.create(tempDir);
    await workflowService.init({
      name: 'feature-x',
      scale: 'SMALL',
    });

    const startResult = await runHookDispatch({
      source: 'codex',
      repoPath: tempDir,
      stdin: PassThrough.from([
        JSON.stringify({
          session_id: 'host-session-preflight',
          cwd: tempDir,
          hook_event_name: 'SessionStart',
        }),
      ]),
      stdout: new PassThrough().on('data', () => {}),
    });

    expect(startResult.exitCode).toBe(0);
    expect(JSON.stringify(startResult.output)).toContain('dotcontext workflow: phase P');
    expect(JSON.stringify(startResult.output)).toContain('Likely gate: linked plan');
  });

  it('classifies Bash commands in appended traces', async () => {
    const sessionId = 'host-session-bash-classification';

    await runHookDispatch({
      source: 'claude-code',
      repoPath: tempDir,
      stdin: PassThrough.from([
        JSON.stringify({
          session_id: sessionId,
          cwd: tempDir,
          hook_event_name: 'SessionStart',
        }),
      ]),
      stdout: new PassThrough().on('data', () => {}),
    });

    const harnessSessionId = await getHookHarnessSessionId({
      repoPath: tempDir,
      source: 'claude-code',
      hostSessionId: sessionId,
    });
    expect(harnessSessionId).toBeDefined();

    await runHookDispatch({
      source: 'claude-code',
      repoPath: tempDir,
      stdin: PassThrough.from([
        JSON.stringify({
          session_id: sessionId,
          cwd: tempDir,
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'npm test -- --runInBand' },
        }),
      ]),
      stdout: new PassThrough().on('data', () => {}),
    });

    const tracePath = path.join(
      tempDir,
      '.context',
      'runtime',
      'sessions',
      harnessSessionId!,
      'trace.jsonl'
    );
    const records = (await fs.readFile(tracePath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { event: string; data?: Record<string, unknown> });
    const toolTrace = records.find((record) => record.event === 'tool.use');
    expect(toolTrace?.data).toMatchObject({
      classification: 'test',
      tool_input: { command: 'npm test -- --runInBand' },
    });
  });

  it('keeps Stop hooks silent when no PREVC workflow is active', async () => {
    const stopStdin = PassThrough.from([
      JSON.stringify({
        session_id: 'host-session-no-workflow',
        cwd: tempDir,
        hook_event_name: 'Stop',
      }),
    ]);
    const stopStdout = new PassThrough();
    stopStdout.on('data', () => {});

    const stopResult = await runHookDispatch({
      source: 'claude-code',
      repoPath: tempDir,
      stdin: stopStdin,
      stdout: stopStdout,
    });

    expect(stopResult.exitCode).toBe(0);
    expect(stopResult.output).toEqual({ continue: true });
  });

  it('keeps Stop hooks silent when workflow state is malformed', async () => {
    const workflowPath = path.join(tempDir, '.context', 'runtime', 'workflows', 'prevc.json');
    await fs.ensureDir(path.dirname(workflowPath));
    await fs.writeFile(workflowPath, '{malformed', 'utf8');

    const stopStdin = PassThrough.from([
      JSON.stringify({
        session_id: 'host-session-malformed-workflow',
        cwd: tempDir,
        hook_event_name: 'Stop',
      }),
    ]);
    const stopStdout = new PassThrough();
    stopStdout.on('data', () => {});

    const stopResult = await runHookDispatch({
      source: 'claude-code',
      repoPath: tempDir,
      stdin: stopStdin,
      stdout: stopStdout,
    });

    expect(stopResult.exitCode).toBe(0);
    expect(stopResult.output).toEqual({ continue: true });
  });

  it('emits Stop workflow guidance when a PREVC workflow is active', async () => {
    const workflowService = await WorkflowService.create(tempDir);
    await workflowService.init({
      name: 'feature-x',
      scale: 'SMALL',
    });

    const stopStdin = PassThrough.from([
      JSON.stringify({
        session_id: 'host-session-active-workflow',
        cwd: tempDir,
        hook_event_name: 'Stop',
      }),
    ]);
    const stopStdout = new PassThrough();
    stopStdout.on('data', () => {});

    const stopResult = await runHookDispatch({
      source: 'codex',
      repoPath: tempDir,
      stdin: stopStdin,
      stdout: stopStdout,
    });

    expect(stopResult.exitCode).toBe(0);
    expect(stopResult.output).toMatchObject({
      source: 'codex',
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext: expect.stringContaining('feature-x'),
      },
    });
  });

  it.each(['Stop', 'SubagentStop'])(
    'keeps %s hooks silent during Claude Code stop hook reentry',
    async (hookEventName) => {
      const workflowService = await WorkflowService.create(tempDir);
      await workflowService.init({
        name: 'feature-x',
        scale: 'SMALL',
      });

      const stopStdin = PassThrough.from([
        JSON.stringify({
          session_id: 'host-session-stop-reentry',
          cwd: tempDir,
          hook_event_name: hookEventName,
          stop_hook_active: true,
        }),
      ]);
      const stopStdout = new PassThrough();
      stopStdout.on('data', () => {});

      const stopResult = await runHookDispatch({
        source: 'claude-code',
        repoPath: tempDir,
        stdin: stopStdin,
        stdout: stopStdout,
      });

      expect(stopResult.exitCode).toBe(0);
      expect(stopResult.output).toEqual({ continue: true });
    }
  );

  it('keeps Codex Stop hooks silent during session-end reentry', async () => {
    const workflowService = await WorkflowService.create(tempDir);
    await workflowService.init({
      name: 'feature-x',
      scale: 'SMALL',
    });

    const stopStdin = PassThrough.from([
      JSON.stringify({
        session_id: 'host-session-codex-stop-reentry',
        cwd: tempDir,
        hook_event_name: 'Stop',
        sessionEndActive: true,
      }),
    ]);
    const stopStdout = new PassThrough();
    stopStdout.on('data', () => {});

    const stopResult = await runHookDispatch({
      source: 'codex',
      repoPath: tempDir,
      stdin: stopStdin,
      stdout: stopStdout,
    });

    expect(stopResult.exitCode).toBe(0);
    expect(stopResult.output).toEqual({ continue: true });
  });
});
