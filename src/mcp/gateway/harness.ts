import { HarnessActionService } from '../../harness';

import type { HarnessParams } from './types';
import type { MCPToolResponse } from './response';
import { createErrorResponse, createJsonResponse } from './response';

export interface HarnessOptions {
  repoPath: string;
}

export async function handleHarness(
  params: HarnessParams,
  options: HarnessOptions
): Promise<MCPToolResponse> {
  const service = new HarnessActionService({ repoPath: options.repoPath });

  try {
    return createJsonResponse(await service.execute(params));
  } catch (error) {
    return createErrorResponse(error);
  }
}
