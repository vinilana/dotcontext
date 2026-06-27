import {
  buildHookTraceData,
  type HarnessHookEvent,
} from '../../../harness';

export interface PiSessionStartEvent {
  type: 'session_start';
  cwd: string;
  sessionId?: string;
}

export interface PiToolExecutionEndEvent {
  type: 'tool_execution_end';
  toolName: string;
  toolInput?: unknown;
  sessionId?: string;
  cwd?: string;
}

export interface PiAgentEndEvent {
  type: 'agent_end';
  cwd?: string;
  sessionId?: string;
  agentEndActive?: boolean | string | number;
  sessionEndActive?: boolean | string | number;
  stopHookActive?: boolean | string | number;
  reentry?: boolean | string | number;
  reentrant?: boolean | string | number;
}

export interface PiHarnessCreateSessionEvent {
  type: 'harness_create_session';
  cwd: string;
  sessionName: string;
}

export interface PiSessionStartNavigationEvent {
  type: 'session_start_navigation';
  cwd: string;
}

export type PiDevHookEvent =
  | PiSessionStartEvent
  | PiSessionStartNavigationEvent
  | PiHarnessCreateSessionEvent
  | PiToolExecutionEndEvent
  | PiAgentEndEvent;

const TRACE_TOOL_NAMES = new Set(['write', 'edit', 'bash']);

export function isTracedPiTool(toolName: string): boolean {
  return TRACE_TOOL_NAMES.has(toolName.trim().toLowerCase());
}

export function mapPiEvent(
  event: PiDevHookEvent,
  options?: { repoPath?: string }
): Omit<HarnessHookEvent, 'source'> {
  const repoPath = options?.repoPath ?? ('cwd' in event ? event.cwd : undefined);

  switch (event.type) {
    case 'session_start':
      return {
        tool: 'context',
        params: {
          action: 'check',
          repoPath: event.cwd,
        },
      };
    case 'session_start_navigation':
      return {
        tool: 'context',
        params: {
          action: 'getMap',
          repoPath: event.cwd,
          section: 'navigation',
        },
      };
    case 'harness_create_session':
      return {
        tool: 'harness',
        params: {
          action: 'createSession',
          name: event.sessionName,
          metadata: {
            host: 'pi-dev',
            piSession: event.sessionName,
          },
        },
      };
    case 'tool_execution_end': {
      const toolName = event.toolName.toLowerCase();
      if (!TRACE_TOOL_NAMES.has(toolName)) {
        throw new Error(`Unsupported Pi tool for tracing: ${event.toolName}`);
      }

      if (!event.sessionId) {
        throw new Error('Pi trace event requires sessionId');
      }

      return {
        tool: 'harness',
        params: {
          action: 'appendTrace',
          sessionId: event.sessionId,
          level: 'info',
          event: 'tool.use',
          message: event.toolName,
          data: {
            ...buildHookTraceData(event.toolName, event.toolInput),
            host: 'pi-dev',
          },
        },
      };
    }
    case 'agent_end':
      return {
        tool: 'workflow-guide',
        params: {
          intent: 'session_end',
          ...(repoPath ? { repoPath } : {}),
        },
      };
    default: {
      const exhaustive: never = event;
      throw new Error(`Unsupported Pi hook event: ${(exhaustive as PiDevHookEvent).type}`);
    }
  }
}
