/**
 * Agent Gateway Handler
 *
 * Handles agent orchestration and discovery operations.
 * Replaces: discoverAgents, getAgentInfo, orchestrateAgents, getAgentSequence,
 *           getAgentDocs, getPhaseDocs, listAgentTypes
 */

import type { AgentType } from '../../../workflow';
import { HarnessAgentsService } from '../../harness';

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
  const repoPath = options.repoPath || process.cwd();
  const service = new HarnessAgentsService({ repoPath });

  try {
    switch (params.action) {
      case 'discover': {
        return createJsonResponse(await service.discover());
      }

      case 'getInfo': {
        return createJsonResponse(await service.getInfo(params.agentType!));
      }

      case 'orchestrate': {
        return createJsonResponse(service.orchestrate({
          task: params.task,
          phase: params.phase,
          role: params.role,
        }));
      }

      case 'getSequence': {
        return createJsonResponse(service.getSequence({
          phases: params.phases,
          task: params.task,
          includeReview: params.includeReview,
        }));
      }

      case 'getDocs': {
        return createJsonResponse(service.getDocs(params.agent! as AgentType));
      }

      case 'getPhaseDocs': {
        return createJsonResponse(service.getPhaseDocs(params.phase!));
      }

      case 'listTypes': {
        return createJsonResponse(service.listTypes());
      }

      default:
        return createErrorResponse(`Unknown agent action: ${params.action}`);
    }
  } catch (error) {
    return createErrorResponse(error);
  }
}
