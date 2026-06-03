import { SemanticContextBuilder } from '../../harness/adapters/out/semantic/contextBuilder';
import { HarnessContextActionService } from '../../harness';

import type { ContextParams } from './types';
import type { MCPToolResponse } from './response';
import {
  createJsonResponse,
  createErrorResponse,
  createTextResponse,
  createScaffoldResponse,
} from './response';

export interface ContextOptions {
  repoPath: string;
  contextBuilder: SemanticContextBuilder;
}

/**
 * Handles context gateway actions for scaffolding and semantic context.
 */
export async function handleContext(
  params: ContextParams,
  options: ContextOptions
): Promise<MCPToolResponse> {
  const service = new HarnessContextActionService({
    repoPath: options.repoPath,
    contextBuilder: options.contextBuilder,
  });

  try {
    const result = await service.execute(params);

    switch (result.kind) {
      case 'json':
        return createJsonResponse(result.data);
      case 'text':
        return createTextResponse(result.text);
      case 'scaffold':
        return createScaffoldResponse(result.data, result.scaffold);
      default:
        return createErrorResponse(`Unknown context result kind: ${(result as { kind?: string }).kind}`);
    }
  } catch (error) {
    return createErrorResponse(error);
  }
}
