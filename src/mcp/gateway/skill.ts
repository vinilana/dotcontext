import { HarnessSkillActionService } from '../../harness';

import type { SkillParams } from './types';
import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';

export interface SkillOptions {
  repoPath: string;
}

/**
 * Handles skill gateway actions for skill management.
 */
export async function handleSkill(
  params: SkillParams,
  options: SkillOptions
): Promise<MCPToolResponse> {
  const service = new HarnessSkillActionService({ repoPath: options.repoPath });

  try {
    return createJsonResponse(await service.execute(params));
  } catch (error) {
    return createErrorResponse(error);
  }
}
