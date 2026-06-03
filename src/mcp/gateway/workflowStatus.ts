import {
  HarnessWorkflowActionService,
  type HarnessWorkflowStatusInput,
} from '../../harness';

import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';

export type WorkflowStatusParams = HarnessWorkflowStatusInput;

export interface WorkflowStatusOptions {
  repoPath: string;
}

/**
 * Get current PREVC workflow status including phase, gates, and linked plans.
 */
export async function handleWorkflowStatus(
  params: WorkflowStatusParams,
  options: WorkflowStatusOptions
): Promise<MCPToolResponse> {
  const service = new HarnessWorkflowActionService({ repoPath: options.repoPath });

  try {
    return createJsonResponse(await service.status(params));
  } catch (error) {
    return createErrorResponse(error);
  }
}
