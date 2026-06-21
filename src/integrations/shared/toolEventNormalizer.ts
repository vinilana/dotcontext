export interface NormalizedToolEvent {
  sessionId?: string;
  cwd?: string;
  hookEventName?: string;
  toolName?: string;
  toolInput?: unknown;
  raw: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

/**
 * Parse common stdin fields shared by Claude Code and Codex hook envelopes.
 */
export function normalizeToolEvent(input: unknown): NormalizedToolEvent {
  if (!isRecord(input)) {
    return { raw: {} };
  }

  return {
    sessionId: readString(input, 'session_id', 'sessionId'),
    cwd: readString(input, 'cwd', 'repoPath', 'repo_path'),
    hookEventName: readString(input, 'hook_event_name', 'hookEventName', 'event'),
    toolName: readString(input, 'tool_name', 'toolName'),
    toolInput: input.tool_input ?? input.toolInput,
    raw: input,
  };
}
