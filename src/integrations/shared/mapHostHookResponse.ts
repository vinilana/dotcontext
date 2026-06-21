import type { HarnessHookResponse, HarnessHookSource } from '../../harness';

export interface HostHookOutput {
  continue?: boolean;
  source?: HarnessHookSource;
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext?: string;
  };
}

const MISSING_CONTEXT_HINT =
  'dotcontext: no .context/ — run npx @dotcontext/mcp install and initialize context.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractResultData(response: Extract<HarnessHookResponse, { ok: true }>): unknown {
  if (response.result.kind === 'json') {
    return response.result.data;
  }
  return response.result;
}

function formatContextAdditionalContext(data: unknown): string {
  if (!isRecord(data) || !data.initialized) {
    return MISSING_CONTEXT_HINT;
  }

  const enabled: string[] = [];
  for (const key of ['docs', 'agents', 'skills', 'plans', 'workflow', 'harness'] as const) {
    if (data[key]) {
      enabled.push(key);
    }
  }

  if (enabled.length === 0) {
    return 'dotcontext: .context/ present. Run context init to populate scaffolding.';
  }

  return `dotcontext: scaffold ready (${enabled.join(', ')}). Use MCP context tools for navigation and workflow.`;
}

function formatWorkflowGuideAdditionalContext(data: unknown): string {
  if (!isRecord(data)) {
    return 'dotcontext: workflow guide unavailable.';
  }

  if (typeof data.excerpt === 'string' && data.excerpt.length > 0) {
    return data.excerpt;
  }

  return 'dotcontext: workflow guide unavailable.';
}

function mapSuccessResponse(
  hostEventName: string,
  response: Extract<HarnessHookResponse, { ok: true }>
): HostHookOutput {
  const data = extractResultData(response);

  if (hostEventName === 'SessionStart' && response.tool === 'context') {
    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: formatContextAdditionalContext(data),
      },
    };
  }

  if (hostEventName === 'Stop' && response.tool === 'workflow-guide') {
    return {
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext: formatWorkflowGuideAdditionalContext(data),
      },
    };
  }

  return { continue: true };
}

/**
 * Map HarnessHookResponse to Claude/Codex stdout JSON control fields.
 */
export function mapHostHookResponse(
  hostEventName: string,
  response: HarnessHookResponse,
  options?: { source?: HarnessHookSource }
): HostHookOutput {
  const output: HostHookOutput = options?.source ? { source: options.source } : {};

  if (!response.ok) {
    return { ...output, continue: true };
  }

  return {
    ...output,
    ...mapSuccessResponse(hostEventName, response),
  };
}
