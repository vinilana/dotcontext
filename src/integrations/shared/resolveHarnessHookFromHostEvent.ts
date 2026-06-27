import {
  buildHookTraceData,
  type HarnessHookEvent,
} from '../../harness';

import type { NormalizedToolEvent } from './toolEventNormalizer';

const TRACE_TOOL_NAMES = new Set(['write', 'edit', 'bash']);

export interface ResolveHarnessHookOptions {
  repoPath?: string;
  overrideTool?: string;
  harnessSessionId?: string;
}

function resolveRepoPath(event: NormalizedToolEvent, repoPath?: string): string | undefined {
  return repoPath ?? event.cwd;
}

function resolveOverrideTool(options?: ResolveHarnessHookOptions): string | undefined {
  const override = options?.overrideTool ?? process.env.DOTCONTEXT_HOOK_TOOL;
  return typeof override === 'string' && override.length > 0 ? override : undefined;
}

function buildExplicitDispatch(
  event: NormalizedToolEvent,
  tool: string,
  repoPath?: string
): Omit<HarnessHookEvent, 'source'> {
  const resolvedRepoPath = resolveRepoPath(event, repoPath);
  const params: Record<string, unknown> = {
    ...(resolvedRepoPath ? { repoPath: resolvedRepoPath } : {}),
  };

  if (event.sessionId) {
    params.sessionId = event.sessionId;
  }

  if (event.toolName) {
    params.message = event.toolName;
  }

  if (event.toolInput !== undefined) {
    params.data = { tool_input: event.toolInput };
  }

  return {
    tool: tool as HarnessHookEvent['tool'],
    params: params as HarnessHookEvent['params'],
  };
}

/**
 * Map SessionStart / PostToolUse / Stop host events to harness hook calls (INT-0).
 */
export function resolveHarnessHookFromHostEvent(
  event: NormalizedToolEvent,
  options?: ResolveHarnessHookOptions
): Omit<HarnessHookEvent, 'source'> | null {
  const overrideTool = resolveOverrideTool(options);
  if (overrideTool) {
    return buildExplicitDispatch(event, overrideTool, options?.repoPath);
  }

  const hookEventName = event.hookEventName;
  if (!hookEventName) {
    return null;
  }

  const repoPath = resolveRepoPath(event, options?.repoPath);

  switch (hookEventName) {
    case 'SessionStart':
      return {
        tool: 'context',
        params: {
          action: 'check',
          ...(repoPath ? { repoPath } : {}),
        },
      };
    case 'PostToolUse': {
      const toolName = event.toolName?.toLowerCase();
      if (toolName && !TRACE_TOOL_NAMES.has(toolName)) {
        return null;
      }

      const sessionId = options?.harnessSessionId;
      if (!sessionId) {
        return null;
      }

      return {
        tool: 'harness',
        params: {
          action: 'appendTrace',
          sessionId,
          level: 'info',
          event: 'tool.use',
          message: event.toolName ?? 'tool.use',
          data: buildHookTraceData(event.toolName, event.toolInput),
        },
      };
    }
    case 'Stop':
      return {
        tool: 'workflow-guide',
        params: {
          intent: 'session_end',
          ...(repoPath ? { repoPath } : {}),
        },
      };
    default:
      return null;
  }
}
