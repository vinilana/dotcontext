import {
  HarnessWorkflowActionService,
  type HarnessWorkflowAdvanceInput,
} from '../../harness';

import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';

export type WorkflowAdvanceParams = HarnessWorkflowAdvanceInput;

export interface WorkflowAdvanceOptions {
  repoPath: string;
}

/**
 * Advance workflow to the next PREVC phase.
 */
export async function handleWorkflowAdvance(
  params: WorkflowAdvanceParams,
  options: WorkflowAdvanceOptions
): Promise<MCPToolResponse> {
  const service = new HarnessWorkflowActionService({ repoPath: options.repoPath });

  try {
    return createJsonResponse(await service.advance(params));
  } catch (error) {
    return createErrorResponse(error);
  }
}
