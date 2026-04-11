/**
 * Harness Plans Service
 *
 * Transport-agnostic plan management and execution tracking logic.
 */

import * as path from 'path';
import { WorkflowService } from '../workflow';
import {
  PHASE_NAMES_EN,
  createPlanLinker,
  PrevcStatusManager,
  type PrevcPhase,
} from '../../workflow';
import { GitService } from '../../utils/gitService';

export interface HarnessPlansServiceOptions {
  repoPath: string;
}

export class HarnessPlansService {
  private readonly linker;

  constructor(private readonly options: HarnessPlansServiceOptions) {
    const contextPath = path.join(this.repoPath, '.context');
    const statusManager = new PrevcStatusManager(contextPath);
    this.linker = createPlanLinker(this.repoPath, statusManager, true);
  }

  private get repoPath(): string {
    return this.options.repoPath;
  }

  async link(planSlug: string): Promise<Record<string, unknown>> {
    const ref = await this.linker.linkPlan(planSlug);

    if (!ref) {
      return {
        success: false,
        error: `Plan not found: ${planSlug}`,
      };
    }

    const service = new WorkflowService(this.repoPath);
    if (await service.hasWorkflow()) {
      await service.markPlanCreated(planSlug);
    }

    let canAdvanceToReview = false;
    if (await service.hasWorkflow()) {
      const gateResult = await service.checkGates();
      canAdvanceToReview = gateResult.gates.plan_required.passed;
    }

    return {
      success: true,
      plan: ref,
      planCreatedForGates: true,
      canAdvanceToReview,
    };
  }

  async getLinked(): Promise<Record<string, unknown>> {
    const plans = await this.linker.getLinkedPlans();
    return { success: true, plans };
  }

  async getDetails(planSlug: string): Promise<Record<string, unknown>> {
    const plan = await this.linker.getLinkedPlan(planSlug);

    if (!plan) {
      return {
        success: false,
        error: `Plan not found or not linked: ${planSlug}`,
      };
    }

    return {
      success: true,
      plan: {
        ...plan,
        phasesWithPrevc: plan.phases.map(p => ({
          ...p,
          prevcPhaseName: PHASE_NAMES_EN[p.prevcPhase],
        })),
      },
    };
  }

  async getForPhase(phase: PrevcPhase): Promise<Record<string, unknown>> {
    const plans = await this.linker.getPlansForPhase(phase);

    return {
      success: true,
      phase,
      phaseName: PHASE_NAMES_EN[phase],
      plans: plans.map(p => ({
        slug: p.ref.slug,
        title: p.ref.title,
        phasesInThisPrevc: p.phases
          .filter(ph => ph.prevcPhase === phase)
          .map(ph => ({ id: ph.id, name: ph.name, status: ph.status })),
        hasPendingWork: this.linker.hasPendingWorkForPhase(p, phase),
      })),
    };
  }

  async updatePhase(planSlug: string, phaseId: string, status: 'pending' | 'in_progress' | 'completed' | 'skipped'): Promise<Record<string, unknown>> {
    const success = await this.linker.updatePlanPhase(planSlug, phaseId, status);
    return { success, planSlug, phaseId, status };
  }

  async recordDecision(params: {
    planSlug: string;
    title: string;
    description: string;
    phase?: PrevcPhase;
    alternatives?: string[];
  }): Promise<Record<string, unknown>> {
    const decision = await this.linker.recordDecision(params.planSlug, {
      title: params.title,
      description: params.description,
      phase: params.phase,
      alternatives: params.alternatives,
      status: 'accepted',
    });

    return { success: true, decision };
  }

  async updateStep(params: {
    planSlug: string;
    phaseId: string;
    stepIndex: number;
    status: 'pending' | 'in_progress' | 'completed' | 'skipped';
    output?: string;
    notes?: string;
  }): Promise<Record<string, unknown>> {
    const success = await this.linker.updatePlanStep(
      params.planSlug,
      params.phaseId,
      params.stepIndex,
      params.status,
      { output: params.output, notes: params.notes }
    );

    return {
      success,
      planSlug: params.planSlug,
      phaseId: params.phaseId,
      stepIndex: params.stepIndex,
      status: params.status,
    };
  }

  async getStatus(planSlug: string): Promise<Record<string, unknown>> {
    const status = await this.linker.getPlanExecutionStatus(planSlug);

    if (!status) {
      return {
        success: false,
        error: 'Plan tracking not found. The plan may not have any execution data yet.',
      };
    }

    return { success: true, ...status };
  }

  async syncMarkdown(planSlug: string): Promise<Record<string, unknown>> {
    const success = await this.linker.syncPlanMarkdown(planSlug);

    return {
      success,
      planSlug,
      message: success ? 'Plan markdown synced successfully' : 'Failed to sync - plan or tracking not found',
    };
  }

  async commitPhase(params: {
    planSlug: string;
    phaseId: string;
    coAuthor?: string;
    stagePatterns?: string[];
    dryRun?: boolean;
  }): Promise<Record<string, unknown>> {
    const plan = await this.linker.getLinkedPlan(params.planSlug);
    if (!plan) {
      return { success: false, error: `Plan not found: ${params.planSlug}` };
    }

    const phase = plan.phases.find(p => p.id === params.phaseId);
    if (!phase) {
      return { success: false, error: `Phase not found: ${params.phaseId}` };
    }

    const commitMessage = phase.commitCheckpoint ||
      `chore(plan): complete ${phase.name} for ${params.planSlug}`;

    const stagePatterns = params.stagePatterns || ['.context/**'];
    const gitService = new GitService(this.repoPath);

    if (!gitService.isGitRepository()) {
      return { success: false, error: 'Not a git repository' };
    }

    if (params.dryRun) {
      const stagedFiles = gitService.stageFiles(stagePatterns);
      return {
        success: true,
        dryRun: true,
        planSlug: params.planSlug,
        phaseId: params.phaseId,
        commitMessage,
        coAuthor: params.coAuthor,
        filesWouldBeCommitted: stagedFiles,
      };
    }

    const stagedFiles = gitService.stageFiles(stagePatterns);
    if (stagedFiles.length === 0) {
      return {
        success: false,
        error: 'Nothing to commit: no files match the stage patterns or all files are already committed',
      };
    }

    const commitResult = gitService.commit(commitMessage, params.coAuthor);
    await this.linker.recordPhaseCommit(params.planSlug, params.phaseId, {
      hash: commitResult.hash,
      shortHash: commitResult.shortHash,
      committedBy: params.coAuthor,
    });

    return {
      success: true,
      planSlug: params.planSlug,
      phaseId: params.phaseId,
      commit: {
        hash: commitResult.hash,
        shortHash: commitResult.shortHash,
        message: commitMessage,
        filesCommitted: commitResult.filesCommitted,
        coAuthor: params.coAuthor,
      },
    };
  }
}
