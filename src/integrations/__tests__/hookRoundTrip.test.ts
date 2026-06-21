import {
  createClaudeCodeHookAdapter,
  createCodexHookAdapter,
  createPiDevHookAdapter,
  mapClaudeCodeEvent,
  mapClaudeCodeResponse,
  mapCodexEvent,
  mapCodexResponse,
  mapPiEvent,
  mapPiResponse,
  normalizeToolEvent,
  resolveHarnessHookFromHostEvent,
} from '..';
import type { HarnessHookResponse } from '../../harness';

import {
  codexPostToolUseFixture,
  codexSessionStartFixture,
  codexStopFixture,
  postToolUseWriteFixture,
  sessionStartFixture,
  stopFixture,
} from '../fixtures/hostHookEvents';

describe('hook mapper unit tests', () => {
  describe('mapClaudeCodeEvent', () => {
    it('maps SessionStart to context check', () => {
      expect(mapClaudeCodeEvent(sessionStartFixture)).toEqual({
        tool: 'context',
        params: {
          action: 'check',
          repoPath: sessionStartFixture.cwd,
        },
      });
    });

    it('maps PostToolUse to harness appendTrace when harness session is bound', () => {
      expect(mapClaudeCodeEvent(postToolUseWriteFixture, {
        harnessSessionId: 'harness-session-1',
      })).toEqual({
        tool: 'harness',
        params: {
          action: 'appendTrace',
          sessionId: 'harness-session-1',
          level: 'info',
          event: 'tool.use',
          message: 'Write',
          data: { tool_input: postToolUseWriteFixture.tool_input },
        },
      });
    });

    it('returns null for PostToolUse without harness session binding', () => {
      expect(resolveHarnessHookFromHostEvent(
        normalizeToolEvent(postToolUseWriteFixture)
      )).toBeNull();
    });

    it('maps Stop to workflow-guide', () => {
      expect(mapClaudeCodeEvent(stopFixture)).toEqual({
        tool: 'workflow-guide',
        params: {
          intent: 'session_end',
          repoPath: stopFixture.cwd,
        },
      });
    });
  });

  describe('mapCodexEvent', () => {
    it('maps SessionStart to context check', () => {
      expect(mapCodexEvent(codexSessionStartFixture)).toEqual({
        tool: 'context',
        params: {
          action: 'check',
          repoPath: codexSessionStartFixture.cwd,
        },
      });
    });

    it('maps PostToolUse to harness appendTrace when harness session is bound', () => {
      expect(mapCodexEvent(codexPostToolUseFixture, {
        harnessSessionId: 'harness-session-2',
      })).toEqual({
        tool: 'harness',
        params: {
          action: 'appendTrace',
          sessionId: 'harness-session-2',
          level: 'info',
          event: 'tool.use',
          message: 'Edit',
          data: { tool_input: codexPostToolUseFixture.tool_input },
        },
      });
    });

    it('maps Stop to workflow-guide', () => {
      expect(mapCodexEvent(codexStopFixture)).toEqual({
        tool: 'workflow-guide',
        params: {
          intent: 'session_end',
          repoPath: codexStopFixture.cwd,
        },
      });
    });
  });

  describe('mapClaudeCodeResponse', () => {
    it('injects SessionStart additionalContext when scaffold exists', () => {
      const response: HarnessHookResponse = {
        ok: true,
        tool: 'context',
        source: 'claude-code',
        result: {
          kind: 'json',
          data: {
            initialized: true,
            docs: true,
            agents: true,
          },
        },
      };

      const output = mapClaudeCodeResponse(sessionStartFixture, response);

      expect(output.source).toBe('claude-code');
      expect(output.hookSpecificOutput).toEqual({
        hookEventName: 'SessionStart',
        additionalContext: expect.stringContaining('scaffold ready'),
      });
    });

    it('returns continue on harness errors', () => {
      const output = mapClaudeCodeResponse(sessionStartFixture, {
        ok: false,
        source: 'claude-code',
        error: { message: 'boom' },
      });

      expect(output).toEqual({
        source: 'claude-code',
        continue: true,
      });
    });
  });

  describe('mapPiEvent', () => {
    it('maps session_start to context check', () => {
      expect(
        mapPiEvent({
          type: 'session_start',
          cwd: '/tmp/repo',
          sessionId: 'pi-1',
        })
      ).toEqual({
        tool: 'context',
        params: {
          action: 'check',
          repoPath: '/tmp/repo',
        },
      });
    });

    it('maps agent_end to workflow-guide', () => {
      expect(
        mapPiEvent({
          type: 'agent_end',
          cwd: '/tmp/repo',
          sessionId: 'pi-1',
        })
      ).toEqual({
        tool: 'workflow-guide',
        params: {
          intent: 'session_end',
          repoPath: '/tmp/repo',
        },
      });
    });
  });

  describe('mapPiResponse', () => {
    it('tags pi-dev source on outputs', () => {
      const output = mapPiResponse(
        { type: 'tool_execution_end', toolName: 'Write' },
        {
          ok: true,
          tool: 'harness',
          source: 'pi-dev',
          result: { kind: 'json', data: { success: true } },
        }
      );

      expect(output.source).toBe('pi-dev');
      expect(output.silent).toBe(true);
    });
  });
});

describe('hook round-trip integrations', () => {
  const runtime = {
    execute: jest.fn(),
  };

  beforeEach(() => {
    runtime.execute.mockReset();
  });

  it.each([
    [
      'claude-code',
      createClaudeCodeHookAdapter,
      mapClaudeCodeResponse,
      sessionStartFixture,
      {
        kind: 'json',
        data: { initialized: true, docs: true },
      },
      (output: ReturnType<typeof mapClaudeCodeResponse>) => {
        expect(output.source).toBe('claude-code');
        expect(output.hookSpecificOutput?.hookEventName).toBe('SessionStart');
      },
    ],
    [
      'codex',
      createCodexHookAdapter,
      mapCodexResponse,
      codexStopFixture,
      {
        kind: 'json',
        data: {
          excerpt: 'dotcontext workflow guide:\nWorkflow "feature-x" - phase E.',
        },
      },
      (output: ReturnType<typeof mapCodexResponse>) => {
        expect(output.source).toBe('codex');
        expect(output.hookSpecificOutput?.hookEventName).toBe('Stop');
        expect(output.hookSpecificOutput?.additionalContext).toContain('feature-x');
      },
    ],
  ])('%s envelope round-trips through adapter and response mapper', async (
    source,
    createAdapter,
    mapResponse,
    fixture,
    runtimeResult,
    assertOutput
  ) => {
    runtime.execute.mockResolvedValue(runtimeResult);

    const adapter = createAdapter({ runtime });
    const harnessResponse = await adapter.handle(fixture);
    const hostOutput = mapResponse(fixture, harnessResponse);

    expect(harnessResponse.ok).toBe(true);
    expect(harnessResponse.source).toBe(source);
    assertOutput(hostOutput);
  });

  it('round-trips pi-dev events with default mapEvent', async () => {
    runtime.execute.mockResolvedValue({
      kind: 'json',
      data: { initialized: false },
    });

    const adapter = createPiDevHookAdapter({ runtime });
    const event = {
      type: 'session_start' as const,
      cwd: '/tmp/repo',
    };
    const harnessResponse = await adapter.handle(event);
    const hostOutput = mapPiResponse(event, harnessResponse);

    expect(runtime.execute).toHaveBeenCalledWith({
      tool: 'context',
      params: { action: 'check', repoPath: '/tmp/repo' },
    });
    expect(harnessResponse.source).toBe('pi-dev');
    expect(hostOutput.source).toBe('pi-dev');
    expect(hostOutput.additionalContext).toContain('no .context/');
  });
});
