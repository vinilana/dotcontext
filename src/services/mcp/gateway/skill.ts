/**
 * Skill Gateway Handler
 *
 * Handles skill management operations.
 * Replaces: listSkills, getSkillContent, getSkillsForPhase, scaffoldSkills,
 *           exportSkills, fillSkills
 */

import { HarnessSkillsService } from '../../harness';

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
  const repoPath = options.repoPath || process.cwd();
  const service = new HarnessSkillsService({ repoPath });

  try {
    switch (params.action) {
      case 'list': {
        return createJsonResponse(await service.list(params.includeContent));
      }

      case 'getContent': {
        return createJsonResponse(await service.getContent(params.skillSlug!));
      }

      case 'getForPhase': {
        return createJsonResponse(await service.getForPhase(params.phase!));
      }

      case 'scaffold': {
        return createJsonResponse(await service.scaffold({
          skills: params.skills,
          includeBuiltIn: params.includeBuiltIn,
        }));
      }

      case 'export': {
        return createJsonResponse(await service.export({
          preset: params.preset,
          includeBuiltIn: params.includeBuiltIn,
        }));
      }

      case 'fill': {
        return createJsonResponse(await service.fill({
          skills: params.skills,
          includeBuiltIn: params.includeBuiltIn,
        }));
      }

      default:
        return createErrorResponse(`Unknown skill action: ${params.action}`);
    }
  } catch (error) {
    return createErrorResponse(error);
  }
}
