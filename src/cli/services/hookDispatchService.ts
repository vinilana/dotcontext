/**
 * Hook Dispatch Service
 *
 * Reads host hook JSON from stdin, routes through integration adapters,
 * and writes host-specific JSON to stdout.
 */

import * as path from 'path';
import {
  createHarnessHookAdapter,
  type HarnessHookResponse,
} from '../../harness';
import { mapClaudeCodeResponse } from '../../integrations/claude-code/hooks/mapClaudeCodeResponse';
import type { ClaudeCodeHookInput } from '../../integrations/claude-code/hooks/mapClaudeCodeEvent';
import { mapCodexResponse } from '../../integrations/codex/hooks/mapCodexResponse';
import type { CodexHookInput } from '../../integrations/codex/hooks/mapCodexEvent';
import {
  ensureHookHarnessSession,
  getHookHarnessSessionId,
  normalizeToolEvent,
  resolveHarnessHookFromHostEvent,
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

function resolveRepoPath(
  envelope: Record<string, unknown>,
  repoPath?: string
): string {
  if (repoPath) {
    return path.resolve(repoPath);
  }

  if (typeof envelope.cwd === 'string' && envelope.cwd.length > 0) {
    return path.resolve(envelope.cwd);
  }

  return process.cwd();
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
  navigationResponse?: HarnessHookResponse
): HostHookOutput {
  const base = source === 'claude-code'
    ? mapClaudeCodeResponse(envelope as ClaudeCodeHookInput, response)
    : mapCodexResponse(envelope as CodexHookInput, response);

  const hookEventName = typeof envelope.hook_event_name === 'string'
    ? envelope.hook_event_name
    : 'unknown';

  if (hookEventName === 'SessionStart') {
    return appendNavigationContext(base, navigationResponse);
  }

  return base;
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
  const hookEventName = normalized.hookEventName;
  const adapter = createHarnessHookAdapter({ repoPath, source });

  if (!hookEventName) {
    throw new Error('Hook dispatch requires hook_event_name');
  }

  if (hookEventName === 'SessionStart') {
    if (normalized.sessionId) {
      await ensureHookHarnessSession(adapter, {
        repoPath,
        source,
        hostSessionId: normalized.sessionId,
      });
    }

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
      navigationResponse
    );

    return {
      response: checkResponse,
      output,
      navigationResponse,
    };
  }

  if (hookEventName === 'PostToolUse') {
    const harnessSessionId = normalized.sessionId
      ? await getHookHarnessSessionId({
        repoPath,
        source,
        hostSessionId: normalized.sessionId,
      })
      : undefined;

    const mapped = resolveHarnessHookFromHostEvent(normalized, {
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

    const response = await adapter.handle({
      ...mapped,
      source,
    });

    return {
      response,
      output: { continue: true },
    };
  }

  if (hookEventName === 'Stop') {
    const mapped = resolveHarnessHookFromHostEvent(normalized, { repoPath });
    if (!mapped) {
      throw new Error(`Unsupported ${source} hook event: ${hookEventName}`);
    }

    const response = await adapter.handle({
      ...mapped,
      source,
    });

    return {
      response,
      output: mapShellHookOutput(source, envelope as ClaudeCodeHookInput, response),
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

  const repoPath = resolveRepoPath(envelope, options.repoPath);

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
