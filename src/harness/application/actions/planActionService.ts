import { AcceptanceFailedError, type PrevcPhase } from '../../domain/workflow';

import { HarnessPlansService, type HarnessPlansServiceOptions } from '../workflow/plansService';

export type HarnessPlanAction =
  | 'link'
  | 'getLinked'
  | 'getDetails'
  | 'getForPhase'
  | 'updatePhase'
  | 'recordDecision'
  | 'updateStep'
  | 'getStatus'
  | 'syncMarkdown'
  | 'commitPhase';

export interface HarnessPlanActionInput {
  action: HarnessPlanAction;
  planSlug?: string;
  phaseId?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'skipped';
  phase?: PrevcPhase;
  title?: string;
  description?: string;
  alternatives?: string[];
  stepIndex?: number;
  output?: string;
  notes?: string;
  coAuthor?: string;
  stagePatterns?: string[];
  dryRun?: boolean;
}

export type HarnessPlanActionResult = Record<string, unknown>;

export interface HarnessPlanActionServiceOptions extends HarnessPlansServiceOptions {
  plansService?: HarnessPlansService;
}

export class HarnessPlanActionService {
  private readonly plansService: HarnessPlansService;

  constructor(options: HarnessPlanActionServiceOptions) {
    this.plansService = options.plansService
      ?? new HarnessPlansService({ repoPath: options.repoPath });
  }

  async execute(params: HarnessPlanActionInput): Promise<HarnessPlanActionResult> {
    try {
      return await this.executeAction(params);
    } catch (error) {
      if (error instanceof AcceptanceFailedError) {
        return {
          success: false,
          error: error.message,
          acceptance: {
            planSlug: error.planSlug,
            phaseId: error.phaseId,
            stepIndex: error.stepIndex,
            run: error.run,
          },
        };
      }

      throw error;
    }
  }

  private async executeAction(params: HarnessPlanActionInput): Promise<HarnessPlanActionResult> {
    switch (params.action) {
      case 'link':
        return this.plansService.link(params.planSlug!);
      case 'getLinked':
        return this.plansService.getLinked();
      case 'getDetails':
        return this.plansService.getDetails(params.planSlug!);
      case 'getForPhase':
        return this.plansService.getForPhase(params.phase!);
      case 'updatePhase':
        return this.plansService.updatePhase(
          params.planSlug!,
          params.phaseId!,
          params.status!
        );
      case 'recordDecision':
        return this.plansService.recordDecision({
          planSlug: params.planSlug!,
          title: params.title!,
          description: params.description!,
          phase: params.phase,
          alternatives: params.alternatives,
        });
      case 'updateStep':
        return this.plansService.updateStep({
          planSlug: params.planSlug!,
          phaseId: params.phaseId!,
          stepIndex: params.stepIndex!,
          status: params.status!,
          output: params.output,
          notes: params.notes,
        });
      case 'getStatus':
        return this.plansService.getStatus(params.planSlug!);
      case 'syncMarkdown':
        return this.plansService.syncMarkdown(params.planSlug!);
      case 'commitPhase':
        if (!params.planSlug || !params.phaseId) {
          return {
            success: false,
            error: 'planSlug and phaseId are required for commitPhase action',
          };
        }

        return this.plansService.commitPhase({
          planSlug: params.planSlug,
          phaseId: params.phaseId,
          coAuthor: params.coAuthor,
          stagePatterns: params.stagePatterns,
          dryRun: params.dryRun,
        });
      default:
        throw new Error(`Unknown plan action: ${(params as HarnessPlanActionInput).action}`);
    }
  }
}
