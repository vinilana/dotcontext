import {
  createClaudeCodeHookAdapter,
  createCodexHookAdapter,
  createPiDevHookAdapter,
} from '..';
import {
  postToolUseWriteFixture,
  sessionStartFixture,
} from '../fixtures/hostHookEvents';

describe('host hook integrations', () => {
  const runtime = {
    execute: jest.fn().mockResolvedValue({
      kind: 'json',
      data: { initialized: true, docs: true },
    }),
  };

  beforeEach(() => {
    runtime.execute.mockClear();
  });

  it.each([
    ['claude-code', createClaudeCodeHookAdapter, sessionStartFixture],
    ['codex', createCodexHookAdapter, sessionStartFixture],
    [
      'pi-dev',
      createPiDevHookAdapter,
      { type: 'session_start' as const, cwd: '/tmp/repo' },
    ],
  ])('creates a %s hook adapter with default mapEvent', async (source, createAdapter, event) => {
    const adapter = createAdapter({ runtime });
    const response = await adapter.handle(event);

    expect(runtime.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'context',
        params: expect.objectContaining({ action: 'check' }),
      })
    );
    expect(response.ok).toBe(true);
    expect(response.source).toBe(source);
  });

  it('rejects PostToolUse through the default Claude Code adapter without harness session binding', async () => {
    const adapter = createClaudeCodeHookAdapter({ runtime });

    await expect(adapter.handle(postToolUseWriteFixture)).rejects.toThrow(
      'Unsupported Claude Code hook event: PostToolUse'
    );
    expect(runtime.execute).not.toHaveBeenCalled();
  });

  it('forces the host source after mapping the event envelope', async () => {
    const adapter = createCodexHookAdapter({
      runtime,
      mapEvent: (event: { operation: string }) => ({
        tool: 'context',
        source: 'claude-code',
        requestId: event.operation,
        params: { action: 'check' },
      }),
    });

    const response = await adapter.handle({ operation: 'op-1' });

    expect(runtime.execute).toHaveBeenCalledWith({
      tool: 'context',
      params: { action: 'check' },
    });
    expect(response.ok).toBe(true);
    expect(response.source).toBe('codex');
    expect(response.requestId).toBe('op-1');
  });
});
