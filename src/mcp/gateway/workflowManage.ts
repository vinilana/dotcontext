import {
  HarnessPolicyBlockedError,
  HarnessWorkflowManageActionService,
  type HarnessWorkflowManageActionInput,
} from '../../harness';

import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';

export type WorkflowManageParams = HarnessWorkflowManageActionInput;

export interface WorkflowManageOptions {
  repoPath: string;
}

/**
 * Manage workflow operations: handoffs, collaboration, documents, gates, approvals.
 */
export async function handleWorkflowManage(
  params: WorkflowManageParams,
  options: WorkflowManageOptions
): Promise<MCPToolResponse> {
  const service = new HarnessWorkflowManageActionService({ repoPath: options.repoPath });

  try {
    return createJsonResponse(await service.execute(params));
  } catch (error) {
    const caughtError = error instanceof Error ? error : new Error(String(error));

    if (caughtError instanceof HarnessPolicyBlockedError) {
      return createJsonResponse({
        success: false,
        error: caughtError.message,
        blockedBy: 'policy',
        reasons: caughtError.decision.reasons,
        policy: caughtError.decision.policy,
      });
    }

    return createErrorResponse(caughtError);
  }
}
