/**
 * MCP Action Logger
 *
 * Records MCP tool activity into harness session traces instead of maintaining
 * a separate workflow-local actions.jsonl log.
 */

import * as fs from 'fs-extra';

import { HarnessRuntimeStateService } from '../harness/runtimeStateService';
import { HarnessWorkflowStateService } from '../harness/workflowStateService';
import { resolveContextRoot } from '../shared/contextRootResolver';

type ActionStatus = 'success' | 'error';

export interface MCPActionLogEntry {
  timestamp: string;
  tool: string;
  action: string;
  status: ActionStatus;
  details?: Record<string, unknown>;
  error?: string;
}

const SENSITIVE_KEYS = new Set([
  'apiKey',
  'token',
  'secret',
  'password',
  'authorization',
  'prompt',
  'content',
  'messages',
  'semanticContext',
]);

const MAX_DEPTH = 4;
const MAX_ARRAY = 20;
const MAX_STRING = 200;
const MCP_ACTIVITY_NAME = 'mcp-activity';

const sessionCache = new Map<string, string>();

async function resolveContextPath(repoPath: string): Promise<string> {
  const resolution = await resolveContextRoot({
    startPath: repoPath,
    validate: false,
  });
  return resolution.contextPath;
}

function sanitizeValue(value: unknown, depth: number = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth >= MAX_DEPTH) return '[truncated]';

  if (typeof value === 'string') {
    if (value.length <= MAX_STRING) return value;
    return `${value.slice(0, MAX_STRING)}...`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    const trimmed = value.slice(0, MAX_ARRAY).map((item) => sanitizeValue(item, depth + 1));
    if (value.length > MAX_ARRAY) {
      trimmed.push(`...(${value.length - MAX_ARRAY} more items)`);
    }
    return trimmed;
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key)) {
        result[key] = '[redacted]';
      } else {
        result[key] = sanitizeValue(entryValue, depth + 1);
      }
    }
    return result;
  }

  return String(value);
}

function sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details) return undefined;
  return sanitizeValue(details) as Record<string, unknown>;
}

async function resolveWorkflowSessionId(contextPath: string): Promise<string | null> {
  const workflowState = new HarnessWorkflowStateService({ contextPath });
  if (!(await workflowState.exists())) {
    return null;
  }

  try {
    const binding = await workflowState.getBinding();
    return binding?.sessionId ?? null;
  } catch {
    return null;
  }
}

async function resolveMcpActivitySessionId(
  repoPath: string,
  state: HarnessRuntimeStateService
): Promise<string> {
  const cached = sessionCache.get(repoPath);
  if (cached) {
    try {
      await state.getSession(cached);
      return cached;
    } catch {
      sessionCache.delete(repoPath);
    }
  }

  const existing = (await state.listSessions()).find((session) =>
    session.name === MCP_ACTIVITY_NAME &&
    session.metadata?.transport === 'mcp'
  );

  if (existing) {
    sessionCache.set(repoPath, existing.id);
    return existing.id;
  }

  const created = await state.createSession({
    name: MCP_ACTIVITY_NAME,
    metadata: {
      transport: 'mcp',
      purpose: 'tool-audit',
    },
  });
  sessionCache.set(repoPath, created.id);
  return created.id;
}

export async function logMcpAction(
  repoPath: string,
  entry: Omit<MCPActionLogEntry, 'timestamp'> & { timestamp?: string }
): Promise<void> {
  try {
    const contextPath = await resolveContextPath(repoPath);
    if (!(await fs.pathExists(contextPath))) {
      return;
    }

    const state = new HarnessRuntimeStateService({ repoPath });
    const workflowSessionId = await resolveWorkflowSessionId(contextPath);
    let sessionId = workflowSessionId;
    if (sessionId) {
      try {
        await state.getSession(sessionId);
      } catch {
        sessionId = null;
      }
    }
    if (!sessionId) {
      sessionId = await resolveMcpActivitySessionId(repoPath, state);
    }
    const timestamp = entry.timestamp || new Date().toISOString();

    await state.appendTrace(sessionId, {
      level: entry.status === 'error' ? 'error' : 'info',
      event: entry.status === 'error' ? 'mcp.tool.failed' : 'mcp.tool.succeeded',
      message: `${entry.tool}.${entry.action} ${entry.status}`,
      data: {
        transport: 'mcp',
        tool: entry.tool,
        action: entry.action,
        status: entry.status,
        timestamp,
        ...(entry.details ? { details: sanitizeDetails(entry.details) } : {}),
        ...(entry.error ? { error: entry.error } : {}),
      },
    });
  } catch {
    // Logging should never block tool execution.
  }
}
