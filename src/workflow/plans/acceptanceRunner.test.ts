import { runAcceptance } from './acceptanceRunner';

describe('runAcceptance', () => {
  const ctx = { repoPath: process.cwd() };

  it('passes when command exits 0', async () => {
    const result = await runAcceptance(
      { kind: 'shell', command: ['node', '-e', 'process.exit(0)'] },
      ctx
    );
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it('fails when command exits non-zero', async () => {
    const result = await runAcceptance(
      { kind: 'shell', command: ['node', '-e', 'process.exit(3)'] },
      ctx
    );
    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(3);
  });

  it('times out when command exceeds timeoutMs', async () => {
    const result = await runAcceptance(
      {
        kind: 'shell',
        command: ['node', '-e', 'setTimeout(()=>{}, 5000)'],
        timeoutMs: 100,
      },
      ctx
    );
    expect(result.passed).toBe(false);
    expect(result.timedOut).toBe(true);
  });

  it('returns a failure (no crash) for non-existent commands', async () => {
    const result = await runAcceptance(
      { kind: 'shell', command: ['definitely-not-a-real-binary-xyz'] },
      ctx
    );
    expect(result.passed).toBe(false);
    expect(result.tailStderr).toMatch(/spawn error/i);
  });

  it('captures stdout tail', async () => {
    const result = await runAcceptance(
      {
        kind: 'shell',
        command: ['node', '-e', 'process.stdout.write("hello-tail")'],
      },
      ctx
    );
    expect(result.tailStdout).toContain('hello-tail');
  });

  it('rejects an empty command array', async () => {
    await expect(
      runAcceptance({ kind: 'shell', command: [] }, ctx)
    ).rejects.toThrow(/non-empty/);
  });
});
