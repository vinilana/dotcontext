/**
 * Harness Agents Service
 *
 * Transport-agnostic agent discovery and orchestration logic.
 */

import {
  agentOrchestrator,
  documentLinker,
  AgentType,
  AGENT_TYPES,
} from '../../workflow/orchestration';
import { PHASE_NAMES_EN } from '../../workflow/phases';
import { createPlanLinker } from '../../workflow/plans';
import { ROLE_DISPLAY_NAMES } from '../../workflow/roles';
import type { PrevcPhase, PrevcRole } from '../../workflow/types';

export interface HarnessAgentsServiceOptions {
  repoPath: string;
}

export class HarnessAgentsService {
  constructor(private readonly options: HarnessAgentsServiceOptions) {}

  private get repoPath(): string {
    return this.options.repoPath || process.cwd();
  }

  async discover(): Promise<Record<string, unknown>> {
    const linker = createPlanLinker(this.repoPath);
    const agents = await linker.discoverAgents();

    const builtIn = agents.filter(a => !a.isCustom);
    const custom = agents.filter(a => a.isCustom);

    return {
      success: true,
      totalAgents: agents.length,
      builtInCount: builtIn.length,
      customCount: custom.length,
      agents: {
        builtIn: builtIn.map(a => a.type),
        custom: custom.map(a => ({ type: a.type, path: a.path })),
      },
    };
  }

  async getInfo(agentType: string): Promise<Record<string, unknown>> {
    const linker = createPlanLinker(this.repoPath);
    const info = await linker.getAgentInfo(agentType);

    return {
      success: true,
      agent: info,
    };
  }

  orchestrate(params: {
    task?: string;
    phase?: PrevcPhase;
    role?: PrevcRole;
  }): Record<string, unknown> {
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
      throw new Error('Provide task, phase, or role parameter');
    }

    return {
      source,
      agents: agents.map((agent) => ({
        type: agent,
        description: agentOrchestrator.getAgentDescription(agent),
        docs: documentLinker.getDocPathsForAgent(agent),
      })),
      count: agents.length,
    };
  }

  getSequence(params: {
    phases?: PrevcPhase[];
    task?: string;
    includeReview?: boolean;
  }): Record<string, unknown> {
    let sequence: AgentType[];

    if (params.phases && params.phases.length > 0) {
      sequence = agentOrchestrator.getAgentHandoffSequence(params.phases);
    } else {
      sequence = agentOrchestrator.getTaskAgentSequence(
        params.task!,
        params.includeReview !== false
      );
    }

    return {
      task: params.task,
      sequence: sequence.map((agent, index) => ({
        order: index + 1,
        agent,
        description: agentOrchestrator.getAgentDescription(agent),
        primaryDoc: documentLinker.getPrimaryDocForAgent(agent)?.path || null,
      })),
      totalAgents: sequence.length,
    };
  }

  getDocs(agent: AgentType): Record<string, unknown> {
    if (!agentOrchestrator.isValidAgentType(agent)) {
      throw new Error(`Invalid agent type "${agent}". Valid types: ${AGENT_TYPES.join(', ')}`);
    }

    const docs = documentLinker.getDocsForAgent(agent);

    return {
      agent,
      description: agentOrchestrator.getAgentDescription(agent),
      documentation: docs.map((doc) => ({
        type: doc.type,
        title: doc.title,
        path: doc.path,
        description: doc.description,
      })),
    };
  }

  getPhaseDocs(phase: PrevcPhase): Record<string, unknown> {
    const docs = documentLinker.getDocsForPhase(phase);
    const agents = agentOrchestrator.getAgentsForPhase(phase);

    return {
      phase,
      phaseName: PHASE_NAMES_EN[phase],
      documentation: docs.map((doc) => ({
        type: doc.type,
        title: doc.title,
        path: doc.path,
        description: doc.description,
      })),
      recommendedAgents: agents.map((agent) => ({
        type: agent,
        description: agentOrchestrator.getAgentDescription(agent),
      })),
    };
  }

  listTypes(): Record<string, unknown> {
    const agents = agentOrchestrator.getAllAgentTypes().map((agent) => ({
      type: agent,
      description: agentOrchestrator.getAgentDescription(agent),
      primaryDoc: documentLinker.getPrimaryDocForAgent(agent)?.title || null,
    }));

    return {
      agents,
      total: agents.length,
    };
  }
}
