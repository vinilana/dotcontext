import type { SemanticContextBuilder } from '../../adapters/out/semantic/contextBuilder';

import {
  HarnessAdapterRuntime,
  type HarnessAdapterInput,
  type HarnessAdapterRequest,
  type HarnessAdapterRuntimeResult,
  type HarnessAdapterToolName,
} from '../actions/adapterRuntime';
import { getHookReadinessSummary } from './hookReadiness';

export const HARNESS_HOOK_SOURCES = [
  'generic',
  'claude-code',
  'codex',
  'pi-dev',
] as const;

export const HARNESS_ADAPTER_TOOL_NAMES = [
  'explore',
  'context',
  'sync',
  'plan',
  'agent',
  'skill',
  'harness',
  'workflow-init',
  'workflow-status',
  'workflow-guide',
  'workflow-advance',
  'workflow-manage',
] as const satisfies readonly HarnessAdapterToolName[];

export type HarnessHookSource =
  | typeof HARNESS_HOOK_SOURCES[number]
  | (string & {});

export interface HarnessHookEvent {
  tool: HarnessAdapterToolName;
  params: HarnessAdapterInput;
  requestId?: string;
  source?: HarnessHookSource;
  metadata?: Record<string, unknown>;
}

export interface HarnessHookSuccessResponse {
  ok: true;
  tool: HarnessAdapterToolName;
  source: HarnessHookSource;
  requestId?: string;
  metadata?: Record<string, unknown>;
  result: HarnessAdapterRuntimeResult;
}

export interface HarnessHookErrorResponse {
  ok: false;
  tool?: HarnessAdapterToolName;
  source: HarnessHookSource;
  requestId?: string;
  metadata?: Record<string, unknown>;
  error: {
    message: string;
    name?: string;
  };
}

export type HarnessHookResponse =
  | HarnessHookSuccessResponse
  | HarnessHookErrorResponse;

export interface HarnessHookAdapterOptions {
  repoPath?: string;
  contextBuilder?: SemanticContextBuilder;
  runtime?: Pick<HarnessAdapterRuntime, 'execute'>;
  source?: HarnessHookSource;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHarnessAdapterToolName(value: unknown): value is HarnessAdapterToolName {
  return typeof value === 'string'
    && (HARNESS_ADAPTER_TOOL_NAMES as readonly string[]).includes(value);
}

function normalizeMetadata(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function normalizeSource(value: unknown, fallback: HarnessHookSource): HarnessHookSource {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function getErrorMessage(error: unknown): { message: string; name?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  return {
    message: String(error),
  };
}

function createRuntime(options: HarnessHookAdapterOptions): Pick<HarnessAdapterRuntime, 'execute'> {
  if (options.runtime) {
    return options.runtime;
  }

  if (!options.repoPath) {
    throw new Error('repoPath is required when runtime is not provided');
  }

  return new HarnessAdapterRuntime({
    repoPath: options.repoPath,
    contextBuilder: options.contextBuilder,
  });
}

/**
 * Generic hook adapter for non-MCP callers.
 *
 * Claude Code hooks, Codex hooks, editor extensions, or HTTP handlers can map
 * their protocol envelope into HarnessHookEvent and receive a protocol-neutral
 * response without depending on the MCP gateway.
 */
export class HarnessHookAdapter {
  private readonly runtime: Pick<HarnessAdapterRuntime, 'execute'>;
  private readonly source: HarnessHookSource;
  private readonly repoPath?: string;

  constructor(options: HarnessHookAdapterOptions) {
    this.runtime = createRuntime(options);
    this.source = options.source ?? 'generic';
    this.repoPath = options.repoPath;
  }

  async handle(event: unknown): Promise<HarnessHookResponse> {
    const requestId = isRecord(event) && typeof event.requestId === 'string'
      ? event.requestId
      : undefined;
    const source = isRecord(event)
      ? normalizeSource(event.source, this.source)
      : this.source;
    const metadata = isRecord(event)
      ? normalizeMetadata(event.metadata)
      : undefined;

    try {
      const request = this.toRuntimeRequest(event);
      const result = await this.enrichRuntimeResult(
        request,
        await this.runtime.execute(request)
      );

      return {
        ok: true,
        tool: request.tool,
        source,
        requestId,
        metadata,
        result,
      };
    } catch (error) {
      return {
        ok: false,
        tool: isRecord(event) && isHarnessAdapterToolName(event.tool)
          ? event.tool
          : undefined,
        source,
        requestId,
        metadata,
        error: getErrorMessage(error),
      };
    }
  }

  private toRuntimeRequest(event: unknown): HarnessAdapterRequest {
    if (!isRecord(event)) {
      throw new Error('Hook event must be an object');
    }

    if (!isHarnessAdapterToolName(event.tool)) {
      throw new Error('Hook event tool must be a supported harness adapter tool');
    }

    if (!isRecord(event.params)) {
      throw new Error('Hook event params must be an object');
    }

    return {
      tool: event.tool,
      params: event.params as HarnessAdapterInput,
    };
  }

  private async enrichRuntimeResult(
    request: HarnessAdapterRequest,
    result: HarnessAdapterRuntimeResult
  ): Promise<HarnessAdapterRuntimeResult> {
    if (
      request.tool !== 'context' ||
      !isRecord(request.params) ||
      request.params.action !== 'check' ||
      result.kind !== 'json' ||
      !isRecord(result.data)
    ) {
      return result;
    }

    const repoPath = typeof request.params.repoPath === 'string'
      ? request.params.repoPath
      : this.repoPath;

    if (!repoPath) {
      return result;
    }

    try {
      return {
        ...result,
        data: {
          ...result.data,
          hookReadiness: await getHookReadinessSummary({
            repoPath,
            scaffoldStatus: result.data,
          }),
        },
      };
    } catch {
      return result;
    }
  }
}

export function createHarnessHookAdapter(
  options: HarnessHookAdapterOptions
): HarnessHookAdapter {
  return new HarnessHookAdapter(options);
}
