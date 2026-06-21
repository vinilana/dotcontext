import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';

import { runHookDispatch } from '../hookDispatchService';
import { getHookHarnessSessionId } from '../../../integrations/shared/hookSessionStore';

describe('HookDispatchService session lifecycle', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-hook-dispatch-'));
    await fs.ensureDir(path.join(tempDir, '.context', 'runtime', 'sessions'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

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
});
