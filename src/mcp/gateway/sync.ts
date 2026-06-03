import { HarnessSyncActionService } from '../../harness';

import type { SyncParams } from './types';
import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';

export interface SyncOptions {
  repoPath: string;
}

/**
 * Handles sync gateway actions for import/export operations.
 */
export async function handleSync(
  params: SyncParams,
  options: SyncOptions
): Promise<MCPToolResponse> {
  const service = new HarnessSyncActionService({ repoPath: options.repoPath });

  try {
    return createJsonResponse(await service.execute(params));
  } catch (error) {
    return createErrorResponse(error);
  }
}
