import { HarnessExploreActionService } from '../../harness';

import type { ExploreParams } from './types';
import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';

export interface ExploreOptions {
  repoPath: string;
}

/**
 * Handles explore gateway actions for file and code exploration.
 */
export async function handleExplore(
  params: ExploreParams,
  options: ExploreOptions
): Promise<MCPToolResponse> {
  const service = new HarnessExploreActionService({ repoPath: options.repoPath });

  try {
    return createJsonResponse(await service.execute(params));
  } catch (error) {
    return createErrorResponse(error);
  }
}
