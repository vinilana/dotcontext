import {
  HarnessWorkflowActionService,
  type HarnessWorkflowInitInput,
} from '../../harness';

import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';

export type WorkflowInitParams = HarnessWorkflowInitInput;

export interface WorkflowInitOptions {
  repoPath: string;
}

/**
 * Initialize a PREVC workflow.
 */
export async function handleWorkflowInit(
  params: WorkflowInitParams,
  options: WorkflowInitOptions
): Promise<MCPToolResponse> {
  const service = new HarnessWorkflowActionService({ repoPath: options.repoPath });

  try {
    return createJsonResponse(await service.init(params));
  } catch (error) {
    return createErrorResponse(error);
  }
}
