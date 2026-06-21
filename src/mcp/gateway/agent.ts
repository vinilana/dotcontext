import { HarnessAgentActionService } from '../../harness';

import type { AgentParams } from './types';
import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';

export interface AgentOptions {
  repoPath: string;
}

/**
 * Handles agent gateway actions for orchestration and discovery.
 */
export async function handleAgent(
  params: AgentParams,
  options: AgentOptions
): Promise<MCPToolResponse> {
  const service = new HarnessAgentActionService({ repoPath: options.repoPath });

  try {
    return createJsonResponse(await service.execute(params));
  } catch (error) {
    return createErrorResponse(error);
  }
}
