import type { SemanticContextBuilder } from '../../adapters/out/semantic/contextBuilder';

import {
  HarnessActionService,
  type HarnessActionInput,
} from './actionService';
import {
  HarnessAgentActionService,
  type HarnessAgentActionInput,
} from './agentActionService';
import {
  HarnessContextActionService,
  type HarnessContextActionInput,
  type HarnessContextActionResult,
} from './contextActionService';
import {
  HarnessExploreActionService,
  type HarnessExploreActionInput,
} from './exploreActionService';
import {
  HarnessPlanActionService,
  type HarnessPlanActionInput,
} from './planActionService';
import {
  HarnessSkillActionService,
  type HarnessSkillActionInput,
} from './skillActionService';
import {
  HarnessSyncActionService,
  type HarnessSyncActionInput,
} from '../exchange/syncActionService';
import {
  HarnessWorkflowActionService,
  type HarnessWorkflowAdvanceInput,
  type HarnessWorkflowGuideInput,
  type HarnessWorkflowInitInput,
  type HarnessWorkflowStatusInput,
} from './workflowActionService';
import {
  HarnessWorkflowManageActionService,
  type HarnessWorkflowManageActionInput,
} from './workflowManageActionService';

export type HarnessAdapterToolName =
  | 'explore'
  | 'context'
  | 'sync'
  | 'plan'
  | 'agent'
  | 'skill'
  | 'harness'
  | 'workflow-init'
  | 'workflow-status'
  | 'workflow-guide'
  | 'workflow-advance'
  | 'workflow-manage';

export type HarnessAdapterInput =
  | HarnessExploreActionInput
  | HarnessContextActionInput
  | HarnessSyncActionInput
  | HarnessPlanActionInput
  | HarnessAgentActionInput
  | HarnessSkillActionInput
  | HarnessActionInput
  | HarnessWorkflowInitInput
  | HarnessWorkflowStatusInput
  | HarnessWorkflowGuideInput
  | HarnessWorkflowAdvanceInput
  | HarnessWorkflowManageActionInput;

export interface HarnessAdapterRequest {
  tool: HarnessAdapterToolName;
  params: HarnessAdapterInput;
}

export type HarnessAdapterRuntimeResult =
  | HarnessContextActionResult
  | {
      kind: 'json';
      data: unknown;
    };

export interface HarnessAdapterRuntimeOptions {
  repoPath: string;
  contextBuilder?: SemanticContextBuilder;
}

export class HarnessAdapterRuntime {
  constructor(private readonly options: HarnessAdapterRuntimeOptions) {}

  async execute(request: HarnessAdapterRequest): Promise<HarnessAdapterRuntimeResult> {
    switch (request.tool) {
      case 'explore':
        return {
          kind: 'json',
          data: await new HarnessExploreActionService(this.options)
            .execute(request.params as HarnessExploreActionInput),
        };
      case 'context':
        return new HarnessContextActionService(this.options)
          .execute(request.params as HarnessContextActionInput);
      case 'sync':
        return {
          kind: 'json',
          data: await new HarnessSyncActionService(this.options)
            .execute(request.params as HarnessSyncActionInput),
        };
      case 'plan':
        return {
          kind: 'json',
          data: await new HarnessPlanActionService(this.options)
            .execute(request.params as HarnessPlanActionInput),
        };
      case 'agent':
        return {
          kind: 'json',
          data: await new HarnessAgentActionService(this.options)
            .execute(request.params as HarnessAgentActionInput),
        };
      case 'skill':
        return {
          kind: 'json',
          data: await new HarnessSkillActionService(this.options)
            .execute(request.params as HarnessSkillActionInput),
        };
      case 'harness':
        return {
          kind: 'json',
          data: await new HarnessActionService(this.options)
            .execute(request.params as HarnessActionInput),
        };
      case 'workflow-init':
        return {
          kind: 'json',
          data: await new HarnessWorkflowActionService(this.options)
            .init(request.params as HarnessWorkflowInitInput),
        };
      case 'workflow-status':
        return {
          kind: 'json',
          data: await new HarnessWorkflowActionService(this.options)
            .status(request.params as HarnessWorkflowStatusInput),
        };
      case 'workflow-guide':
        return {
          kind: 'json',
          data: await new HarnessWorkflowActionService(this.options)
            .guide(request.params as HarnessWorkflowGuideInput),
        };
      case 'workflow-advance':
        return {
          kind: 'json',
          data: await new HarnessWorkflowActionService(this.options)
            .advance(request.params as HarnessWorkflowAdvanceInput),
        };
      case 'workflow-manage':
        return {
          kind: 'json',
          data: await new HarnessWorkflowManageActionService(this.options)
            .execute(request.params as HarnessWorkflowManageActionInput),
        };
      default:
        throw new Error(`Unknown harness adapter tool: ${(request as HarnessAdapterRequest).tool}`);
    }
  }
}
