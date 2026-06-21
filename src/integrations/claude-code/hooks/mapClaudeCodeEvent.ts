import type { HarnessHookEvent } from '../../../harness';

import {
  normalizeToolEvent,
  resolveHarnessHookFromHostEvent,
  type ResolveHarnessHookOptions,
} from '../../shared';

export interface ClaudeCodeHookInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: unknown;
  [key: string]: unknown;
}

export function mapClaudeCodeEvent(
  event: ClaudeCodeHookInput,
  options?: ResolveHarnessHookOptions
): Omit<HarnessHookEvent, 'source'> {
  const normalized = normalizeToolEvent(event);
  const mapped = resolveHarnessHookFromHostEvent(normalized, options);

  if (!mapped) {
    throw new Error(
      `Unsupported Claude Code hook event: ${normalized.hookEventName ?? 'unknown'}`
    );
  }

  return mapped;
}
