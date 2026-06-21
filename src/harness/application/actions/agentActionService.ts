import type { AgentType, PrevcPhase, PrevcRole } from '../../domain/workflow';

import { HarnessAgentsService, type HarnessAgentsServiceOptions } from '../agents/agentsService';

export type HarnessAgentAction =
  | 'discover'
  | 'getInfo'
  | 'orchestrate'
  | 'getSequence'
  | 'getDocs'
  | 'getPhaseDocs'
  | 'listTypes';

export interface HarnessAgentActionInput {
  action: HarnessAgentAction;
  agentType?: string;
  task?: string;
  phase?: PrevcPhase;
  role?: PrevcRole;
  includeReview?: boolean;
  phases?: PrevcPhase[];
  agent?: AgentType;
}

export type HarnessAgentActionResult = Record<string, unknown>;

export interface HarnessAgentActionServiceOptions extends HarnessAgentsServiceOptions {
  agentsService?: HarnessAgentsService;
}

export class HarnessAgentActionService {
  private readonly agentsService: HarnessAgentsService;

  constructor(options: HarnessAgentActionServiceOptions) {
    this.agentsService = options.agentsService
      ?? new HarnessAgentsService({ repoPath: options.repoPath });
  }

  async execute(params: HarnessAgentActionInput): Promise<HarnessAgentActionResult> {
    switch (params.action) {
      case 'discover':
        return this.agentsService.discover();
      case 'getInfo':
        return this.agentsService.getInfo(params.agentType!);
      case 'orchestrate':
        return this.agentsService.orchestrate({
          task: params.task,
          phase: params.phase,
          role: params.role,
        });
      case 'getSequence':
        return this.agentsService.getSequence({
          phases: params.phases,
          task: params.task,
          includeReview: params.includeReview,
        });
      case 'getDocs':
        return this.agentsService.getDocs(params.agent!);
      case 'getPhaseDocs':
        return this.agentsService.getPhaseDocs(params.phase!);
      case 'listTypes':
        return this.agentsService.listTypes();
      default:
        throw new Error(`Unknown agent action: ${(params as HarnessAgentActionInput).action}`);
    }
  }
}
