import type { PrevcPhase } from '../../domain/workflow';

import { HarnessSkillsService, type HarnessSkillsServiceOptions } from '../skills/skillsService';

export type HarnessSkillAction =
  | 'list'
  | 'getContent'
  | 'getForPhase'
  | 'scaffold'
  | 'export'
  | 'fill';

export interface HarnessSkillActionInput {
  action: HarnessSkillAction;
  skillSlug?: string;
  phase?: PrevcPhase;
  skills?: string[];
  includeContent?: boolean;
  includeBuiltIn?: boolean;
  preset?: string;
}

export type HarnessSkillActionResult = Record<string, unknown>;

export interface HarnessSkillActionServiceOptions extends HarnessSkillsServiceOptions {
  skillsService?: HarnessSkillsService;
}

export class HarnessSkillActionService {
  private readonly skillsService: HarnessSkillsService;

  constructor(options: HarnessSkillActionServiceOptions) {
    this.skillsService = options.skillsService
      ?? new HarnessSkillsService({ repoPath: options.repoPath });
  }

  async execute(params: HarnessSkillActionInput): Promise<HarnessSkillActionResult> {
    switch (params.action) {
      case 'list':
        return this.skillsService.list(params.includeContent);
      case 'getContent':
        return this.skillsService.getContent(params.skillSlug!);
      case 'getForPhase':
        return this.skillsService.getForPhase(params.phase!);
      case 'scaffold':
        return this.skillsService.scaffold({
          skills: params.skills,
          includeBuiltIn: params.includeBuiltIn,
        });
      case 'export':
        return this.skillsService.export({
          preset: params.preset,
          includeBuiltIn: params.includeBuiltIn,
        });
      case 'fill':
        return this.skillsService.fill({
          skills: params.skills,
          includeBuiltIn: params.includeBuiltIn,
        });
      default:
        throw new Error(`Unknown skill action: ${(params as HarnessSkillActionInput).action}`);
    }
  }
}
