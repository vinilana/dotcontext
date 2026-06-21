import {
  HarnessWorkflowActionService,
  type HarnessWorkflowGuideInput,
} from '../../harness';

import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';

export type WorkflowGuideParams = HarnessWorkflowGuideInput;

export interface WorkflowGuideOptions {
  repoPath: string;
}

/**
 * Get adapter-neutral PREVC workflow guidance.
 */
export async function handleWorkflowGuide(
  params: WorkflowGuideParams = {},
  options: WorkflowGuideOptions
): Promise<MCPToolResponse> {
  const service = new HarnessWorkflowActionService({ repoPath: options.repoPath });

  try {
    return createJsonResponse(await service.guide(params));
  } catch (error) {
    return createErrorResponse(error);
  }
}
