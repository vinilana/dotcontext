/**
 * Hook Dispatch Service
 *
 * Reads host hook JSON from stdin, routes through integration adapters,
 * and writes host-specific JSON to stdout.
 */

import {
  createHarnessHookAdapter,
  recordHookTraceFailure,
  type HarnessHookResponse,
  WorkflowService,
} from '../../harness';
import { mapClaudeCodeResponse } from '../../integrations/claude-code/hooks/mapClaudeCodeResponse';
import type { ClaudeCodeHookInput } from '../../integrations/claude-code/hooks/mapClaudeCodeEvent';
import { mapCodexResponse } from '../../integrations/codex/hooks/mapCodexResponse';
import type { CodexHookInput } from '../../integrations/codex/hooks/mapCodexEvent';
import {
  ensureHookHarnessSession,
  extractHarnessSessionId,
  getHookHarnessSessionId,
  isSessionEndReentry,
  normalizeToolEvent,
  resolveHookRepoRoot,
  resolveHarnessHookFromHostEvent,
  saveHookHarnessSession,
  type HostHookOutput,
} from '../../integrations/shared';
import { formatNavigationExcerpt } from '../../integrations/shared/formatNavigationExcerpt';

export type HookDispatchSource = 'claude-code' | 'codex';

export interface HookDispatchOptions {
  source: HookDispatchSource;
  repoPath?: string;
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
}

export interface HookDispatchResult {
  exitCode: 0 | 1 | 2;
  output: unknown;
}

function isBlockingResponse(response: HarnessHookResponse): boolean {
  if (response.metadata?.block === true) {
    return true;
  }

  if (response.ok && response.result?.kind === 'json') {
    const data = response.result.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const record = data as Record<string, unknown>;
      return record.block === true || record.policyBlock === true;
    }
  }

  return false;
}

function resolveExitCode(response: HarnessHookResponse): 0 | 1 | 2 {
  if (isBlockingResponse(response)) {
    return 2;
  }

  if (!response.ok) {
    return 1;
  }

  return 0;
}

function isInitialized(response: HarnessHookResponse): boolean {
  if (!response.ok || response.result.kind !== 'json') {
    return false;
  }

  const data = response.result.data;
  return typeof data === 'object'
    && data !== null
    && 'initialized' in data
    && Boolean((data as { initialized?: boolean }).initialized);
}

function canonicalizeHookEventName(hookEventName?: string): string | undefined {
  if (!hookEventName) {
    return undefined;
  }

  const normalized = hookEventName.trim().toLowerCase().replace(/[-\s]/g, '_');
  switch (normalized) {
    case 'sessionstart':
    case 'session_start':
      return 'SessionStart';
    case 'posttooluse':
    case 'post_tool_use':
      return 'PostToolUse';
    case 'stop':
      return 'Stop';
    case 'subagentstop':
    case 'subagent_stop':
      return 'SubagentStop';
    default:
      return hookEventName;
  }
}

function appendNavigationContext(
  output: HostHookOutput,
  navigationResponse?: HarnessHookResponse
): HostHookOutput {
  if (!navigationResponse?.ok || navigationResponse.result.kind !== 'json') {
    return output;
  }

  const excerpt = formatNavigationExcerpt(navigationResponse.result.data);
  if (!excerpt || !output.hookSpecificOutput?.additionalContext) {
    return output;
  }

  return {
    ...output,
    hookSpecificOutput: {
      ...output.hookSpecificOutput,
      additionalContext: `${output.hookSpecificOutput.additionalContext}\n\ndotcontext navigation:\n${excerpt}`,
    },
  };
}

function mapShellHookOutput(
  source: HookDispatchSource,
  envelope: ClaudeCodeHookInput | CodexHookInput,
  response: HarnessHookResponse,
  hookEventName?: string,
  navigationResponse?: HarnessHookResponse
): HostHookOutput {
  const mappedEnvelope = hookEventName
    ? { ...envelope, hook_event_name: hookEventName }
    : envelope;
  const base = source === 'claude-code'
    ? mapClaudeCodeResponse(mappedEnvelope as ClaudeCodeHookInput, response)
    : mapCodexResponse(mappedEnvelope as CodexHookInput, response);

  const mappedHookEventName = hookEventName
    ?? (typeof envelope.hook_event_name === 'string' ? envelope.hook_event_name : 'unknown');

  if (mappedHookEventName === 'SessionStart') {
    return appendNavigationContext(base, navigationResponse);
  }

  return base;
}

async function hasActivePrevcWorkflow(repoPath: string): Promise<boolean> {
  try {
    const workflowService = await WorkflowService.create(repoPath);
    if (!(await workflowService.hasWorkflow())) {
      return false;
    }

    return !(await workflowService.isComplete());
  } catch {
    return false;
  }
}

function createHookDispatchSuccessResponse(
  source: HookDispatchSource,
  data: Record<string, unknown>,
  tool: Extract<HarnessHookResponse, { ok: true }>['tool'] = 'harness'
): HarnessHookResponse {
  return {
    ok: true,
    tool,
    source,
    result: {
      kind: 'json',
      data,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAppendTraceRequest(mapped: { tool: string; params: unknown }): boolean {
  return mapped.tool === 'harness'
    && isRecord(mapped.params)
    && mapped.params.action === 'appendTrace';
}

function isMissingHarnessSessionResponse(
  response: HarnessHookResponse,
  harnessSessionId?: string
): boolean {
  if (response.ok) {
    return false;
  }

  const message = response.error.message;
  if (!message.includes('Harness session not found')) {
    return false;
  }

  return !harnessSessionId || message.includes(harnessSessionId);
}

async function recreateHookHarnessSession(
  adapter: Parameters<typeof ensureHookHarnessSession>[0],
  options: {
    repoPath: string;
    source: HookDispatchSource;
    hostSessionId: string;
  }
): Promise<string> {
  const now = new Date().toISOString();
  const response = await adapter.handle({
    tool: 'harness',
    params: {
      action: 'createSession',
      name: `hook:${options.source}:${options.hostSessionId.slice(0, 12)}`,
      metadata: {
        host: options.source,
        hostSessionId: options.hostSessionId,
        recoveredFromStaleBinding: true,
      },
    },
    source: options.source,
  });

  const harnessSessionId = extractHarnessSessionId(response);
  if (!response.ok || !harnessSessionId) {
    const message = !response.ok ? response.error.message : 'Harness session id missing from createSession response';
    throw new Error(message);
  }

  await saveHookHarnessSession({
    harnessSessionId,
    hostSessionId: options.hostSessionId,
    source: options.source,
    repoPath: options.repoPath,
    createdAt: now,
    updatedAt: now,
  });

  return harnessSessionId;
}

async function recordTraceAppendFailure(options: {
  repoPath: string;
  source: HookDispatchSource;
  reason: string;
  message?: string;
  hostSessionId?: string;
  harnessSessionId?: string;
}): Promise<void> {
  try {
    await recordHookTraceFailure(options);
  } catch {
    // Diagnostics must never make hook dispatch blocking.
  }
}

async function readStdin(stdin: NodeJS.ReadableStream = process.stdin): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks).toString('utf-8').trim();
}

async function dispatchShellHookEvent(
  source: HookDispatchSource,
  envelope: Record<string, unknown>,
  repoPath: string
): Promise<{ response: HarnessHookResponse; output: HostHookOutput; navigationResponse?: HarnessHookResponse }> {
  const normalized = normalizeToolEvent(envelope);
  const hookEventName = canonicalizeHookEventName(normalized.hookEventName);
  const normalizedEvent = {
    ...normalized,
    hookEventName,
  };
  const adapter = createHarnessHookAdapter({ repoPath, source });

  if (!hookEventName) {
    throw new Error('Hook dispatch requires hook_event_name');
  }

  if ((hookEventName === 'Stop' || hookEventName === 'SubagentStop') && isSessionEndReentry(envelope)) {
    return {
      response: {
        ok: true,
        tool: 'workflow-guide',
        source,
        result: {
          kind: 'json',
          data: {
            skipped: true,
            reason: 'stop_hook_reentry',
          },
        },
      },
      output: { continue: true },
    };
  }

  if (hookEventName === 'SessionStart') {
    const checkResponse = await adapter.handle({
      tool: 'context',
      params: {
        action: 'check',
        repoPath,
      },
      source,
    });

    let navigationResponse: HarnessHookResponse | undefined;
    if (isInitialized(checkResponse)) {
      if (normalizedEvent.sessionId) {
        await ensureHookHarnessSession(adapter, {
          repoPath,
          source,
          hostSessionId: normalizedEvent.sessionId,
        });
      }

      navigationResponse = await adapter.handle({
        tool: 'context',
        params: {
          action: 'getMap',
          repoPath,
          section: 'navigation',
        },
        source,
      });
    }

    const output = mapShellHookOutput(
      source,
      envelope as ClaudeCodeHookInput,
      checkResponse,
      hookEventName,
      navigationResponse
    );

    return {
      response: checkResponse,
      output,
      navigationResponse,
    };
  }

  if (hookEventName === 'PostToolUse') {
    const harnessSessionId = normalizedEvent.sessionId
      ? await getHookHarnessSessionId({
        repoPath,
        source,
        hostSessionId: normalizedEvent.sessionId,
      })
      : undefined;

    const mapped = resolveHarnessHookFromHostEvent(normalizedEvent, {
      repoPath,
      harnessSessionId,
    });

    if (!mapped) {
      return {
        response: {
          ok: true,
          tool: 'harness',
          source,
          result: { kind: 'json', data: { skipped: true } },
        },
        output: { continue: true },
      };
    }

    let response = await adapter.handle({
      ...mapped,
      source,
    });

    if (
      isAppendTraceRequest(mapped)
      && normalizedEvent.sessionId
      && isMissingHarnessSessionResponse(response, harnessSessionId)
    ) {
      try {
        const recreatedSessionId = await recreateHookHarnessSession(adapter, {
          repoPath,
          source,
          hostSessionId: normalizedEvent.sessionId,
        });
        const retryMapped = resolveHarnessHookFromHostEvent(normalizedEvent, {
          repoPath,
          harnessSessionId: recreatedSessionId,
        });
        if (retryMapped) {
          response = await adapter.handle({
            ...retryMapped,
            source,
          });
        }
      } catch {
        await recordTraceAppendFailure({
          repoPath,
          source,
          reason: 'stale_session_recovery_failed',
          hostSessionId: normalizedEvent.sessionId,
          harnessSessionId,
        });
        response = createHookDispatchSuccessResponse(source, {
          skipped: true,
          reason: 'trace_append_failed',
        });
      }
    }

    if (isAppendTraceRequest(mapped) && !response.ok) {
      await recordTraceAppendFailure({
        repoPath,
        source,
        reason: 'append_trace_failed',
        message: response.error.message,
        hostSessionId: normalizedEvent.sessionId,
        harnessSessionId,
      });
      response = createHookDispatchSuccessResponse(source, {
        skipped: true,
        reason: 'trace_append_failed',
      });
    }

    return {
      response,
      output: { continue: true },
    };
  }

  if (hookEventName === 'Stop') {
    if (!(await hasActivePrevcWorkflow(repoPath))) {
      return {
        response: {
          ok: true,
          tool: 'workflow-guide',
          source,
          result: {
            kind: 'json',
            data: {
              skipped: true,
              reason: 'no_active_workflow',
            },
          },
        },
        output: { continue: true },
      };
    }

    const mapped = resolveHarnessHookFromHostEvent(normalizedEvent, { repoPath });
    if (!mapped) {
      throw new Error(`Unsupported ${source} hook event: ${hookEventName}`);
    }

    const response = await adapter.handle({
      ...mapped,
      source,
    });

    return {
      response,
      output: mapShellHookOutput(source, envelope as ClaudeCodeHookInput, response, hookEventName),
    };
  }

  throw new Error(`Unsupported ${source} hook event: ${hookEventName}`);
}

export async function runHookDispatch(
  options: HookDispatchOptions
): Promise<HookDispatchResult> {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const rawInput = await readStdin(stdin);

  if (!rawInput) {
    throw new Error('Hook dispatch requires JSON input on stdin');
  }

  let envelope: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawInput) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Hook dispatch stdin must be a JSON object');
    }
    envelope = parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid hook dispatch JSON: ${(error as Error).message}`);
  }

  const rootResolution = await resolveHookRepoRoot({
    repoPath: options.repoPath,
    cwd: normalizeToolEvent(envelope).cwd,
  });
  const repoPath = rootResolution.repoPath;

  let response: HarnessHookResponse;
  let output: HostHookOutput;

  try {
    const result = await dispatchShellHookEvent(options.source, envelope, repoPath);
    response = result.response;
    output = result.output;
  } catch (error) {
    response = {
      ok: false,
      source: options.source,
      error: {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : undefined,
      },
    };
    output = { continue: true };
  }

  const exitCode = resolveExitCode(response);

  stdout.write(`${JSON.stringify(output)}\n`);

  return {
    exitCode,
    output,
  };
}

export class HookDispatchService {
  async dispatch(options: HookDispatchOptions): Promise<HookDispatchResult> {
    return runHookDispatch(options);
  }
}
