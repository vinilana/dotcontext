import type { HarnessHookSource } from '../../harness';

export interface HostHookOutput {
  continue?: boolean;
  source?: HarnessHookSource;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext?: string;
  };
}

type HostHookOutputField = keyof HostHookOutput;

const STRICT_COMMAND_HOOK_FIELDS = [
  'continue',
  'hookSpecificOutput',
] as const satisfies readonly HostHookOutputField[];

const HOST_HOOK_OUTPUT_FIELDS: Partial<Record<string, readonly HostHookOutputField[]>> = {
  'claude-code': [
    ...STRICT_COMMAND_HOOK_FIELDS,
    'source',
    'stopReason',
    'suppressOutput',
  ],
  codex: [
    ...STRICT_COMMAND_HOOK_FIELDS,
    'stopReason',
    'suppressOutput',
    'systemMessage',
  ],
};

export function getHostHookOutputFields(
  source: HarnessHookSource
): readonly HostHookOutputField[] {
  return HOST_HOOK_OUTPUT_FIELDS[source] ?? STRICT_COMMAND_HOOK_FIELDS;
}

export function finalizeHostHookOutput(
  source: HarnessHookSource,
  output: HostHookOutput
): HostHookOutput {
  const sanitized: HostHookOutput = {};
  const sanitizedRecord = sanitized as Record<string, unknown>;
  const outputRecord = output as Record<string, unknown>;
  for (const field of getHostHookOutputFields(source)) {
    if (outputRecord[field] !== undefined) {
      sanitizedRecord[field] = outputRecord[field];
    }
  }
  return sanitized;
}
