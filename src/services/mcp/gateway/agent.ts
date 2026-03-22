/**
 * Agent Gateway Handler
 *
 * Handles agent orchestration and discovery operations.
 * Replaces: discoverAgents, getAgentInfo, orchestrateAgents, getAgentSequence,
 *           getAgentDocs, getPhaseDocs, listAgentTypes
 */

import {
  PHASE_NAMES_EN,
  ROLE_DISPLAY_NAMES,
  agentOrchestrator,
  documentLinker,
  AgentType,
  AGENT_TYPES,
  createPlanLinker,
} from '../../../workflow';

import type { AgentParams } from './types';
import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';
import {
  executionStateCache,
  resolveResponsePreferences,
} from './runtime';

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
  const responsePrefs = resolveResponsePreferences(params);

  try {
    switch (params.action) {
      case 'discover': {
        const manifest = await executionStateCache.getAgentManifest(repoPath);
        const builtIn = manifest.items.filter((agent) => !agent.isCustom);
        const custom = manifest.items.filter((agent) => agent.isCustom);

        return createJsonResponse({
          success: true,
          totalAgents: manifest.items.length,
          builtInCount: builtIn.length,
          customCount: custom.length,
          agentIds: manifest.items.map((agent) => agent.id),
          ...(responsePrefs.includeLegacy || params.includeDocs ? {
            agents: {
              builtIn: builtIn.map((agent) => agent.id),
              custom: custom.map((agent) => ({ type: agent.id, path: agent.path })),
            },
          } : {}),
        });
      }

      case 'getInfo': {
        const linker = createPlanLinker(repoPath);
        const info = await linker.getAgentInfo(params.agentType!);

        return createJsonResponse({
          success: true,
          agent: info,
        });
      }

      case 'orchestrate': {
        let agents: AgentType[] = [];
        let source = '';

        if (params.task) {
          agents = agentOrchestrator.selectAgentsByTask(params.task);
          source = `task: "${params.task}"`;
        } else if (params.phase) {
          agents = agentOrchestrator.getAgentsForPhase(params.phase);
          source = `phase: ${params.phase} (${PHASE_NAMES_EN[params.phase]})`;
        } else if (params.role) {
          agents = agentOrchestrator.getAgentsForRole(params.role);
          source = `role: ${ROLE_DISPLAY_NAMES[params.role]}`;
        } else {
          return createErrorResponse('Provide task, phase, or role parameter');
        }

        const response: Record<string, unknown> = {
          source,
          agentIds: agents,
          count: agents.length,
          startWith: agents[0] || null,
        };

        if (params.includeDocs || responsePrefs.includeLegacy) {
          response.agents = agents.map((agent) => ({
            type: agent,
            description: agentOrchestrator.getAgentDescription(agent),
            docs: documentLinker.getDocPathsForAgent(agent),
          }));
        }

        return createJsonResponse(response);
      }

      case 'getSequence': {
        let sequence: AgentType[];

        if (params.phases && params.phases.length > 0) {
          sequence = agentOrchestrator.getAgentHandoffSequence(params.phases);
        } else {
          sequence = agentOrchestrator.getTaskAgentSequence(
            params.task!,
            params.includeReview !== false
          );
        }

        const response: Record<string, unknown> = {
          task: params.task,
          sequence,
          totalAgents: sequence.length,
          startWith: sequence[0] || null,
        };

        if (params.includeDocs || responsePrefs.includeLegacy) {
          response.sequenceDetails = sequence.map((agent, index) => ({
            order: index + 1,
            agent,
            description: agentOrchestrator.getAgentDescription(agent),
            primaryDoc: documentLinker.getPrimaryDocForAgent(agent)?.path || null,
          }));
        }

        return createJsonResponse(response);
      }

      case 'getDocs': {
        if (!agentOrchestrator.isValidAgentType(params.agent!)) {
          return createErrorResponse(`Invalid agent type "${params.agent}". Valid types: ${AGENT_TYPES.join(', ')}`);
        }

        const docs = documentLinker.getDocsForAgent(params.agent!);
        const agentDesc = agentOrchestrator.getAgentDescription(params.agent!);

        return createJsonResponse({
          agent: params.agent,
          description: agentDesc,
          documentation: docs.map((doc) => ({
            type: doc.type,
            title: doc.title,
            path: doc.path,
            description: doc.description,
          })),
        });
      }

      case 'getPhaseDocs': {
        const docs = documentLinker.getDocsForPhase(params.phase!);
        const agents = agentOrchestrator.getAgentsForPhase(params.phase!);

        return createJsonResponse({
          phase: params.phase,
          phaseName: PHASE_NAMES_EN[params.phase!],
          docRefs: docs.map((doc) => doc.path),
          recommendedAgents: agents,
          ...(responsePrefs.includeLegacy || params.includeDocs ? {
            documentation: docs.map((doc) => ({
              type: doc.type,
              title: doc.title,
              path: doc.path,
              description: doc.description,
            })),
            recommendedAgentDetails: agents.map((agent) => ({
              type: agent,
              description: agentOrchestrator.getAgentDescription(agent),
            })),
          } : {}),
        });
      }

      case 'listTypes': {
        const agentIds = agentOrchestrator.getAllAgentTypes();
        return createJsonResponse({
          agentIds,
          total: agentIds.length,
          ...(responsePrefs.includeLegacy ? {
            agents: agentIds.map((agent) => ({
              type: agent,
              description: agentOrchestrator.getAgentDescription(agent),
              primaryDoc: documentLinker.getPrimaryDocForAgent(agent)?.title || null,
            })),
          } : {}),
        });
      }

      default:
        return createErrorResponse(`Unknown agent action: ${params.action}`);
    }
  } catch (error) {
    return createErrorResponse(error);
  }
}
