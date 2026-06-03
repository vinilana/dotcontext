import { HarnessPlanActionService } from '../../harness';

import type { PlanParams } from './types';
import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';

export interface PlanOptions {
  repoPath: string;
}

/**
 * Handles plan gateway actions for plan management and execution tracking.
 */
export async function handlePlan(
  params: PlanParams,
  options: PlanOptions
): Promise<MCPToolResponse> {
  const service = new HarnessPlanActionService({ repoPath: options.repoPath });

  try {
    return createJsonResponse(await service.execute(params));
  } catch (error) {
    return createErrorResponse(error);
  }
}
