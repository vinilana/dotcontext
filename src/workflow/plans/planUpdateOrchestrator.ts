/**
 * PlanUpdateOrchestrator
 *
 * Sequences the write path for plan execution tracking:
 *   load → apply → save → reindex → (optional) commit.
 *
 * Tracking JSON is the single canonical runtime source; markdown files are
 * read-only projections produced by `PlanMarkdownProjector`. `planLinker.ts`
 * is now a query/setup facade and delegates all updates here.
 */

import * as fs from 'fs-extra';
import * as path from 'path';

import { GitService } from '../../utils/gitService';
import { PrevcStatusManager } from '../status/statusManager';
import { StatusType } from '../types';
import { PlanExecutionResolver } from './planExecutionResolver';
import { PlanIndexProjector } from './planIndexProjector';
import { PlanMarkdownProjector } from './planMarkdownProjector';
import { PlanTrackingStore } from './planTrackingStore';
import type { LinkedPlan, PlanDecision, PlanReference } from './types';
import type { PlanExecutionTracking } from './executionTypes';

type LoadLinkedPlan = (planSlug: string) => Promise<LinkedPlan | null>;

export interface PlanStepUpdateOptions {
  output?: string;
  notes?: string;
}

export interface PlanApprovalUpdate {
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvedAt?: string;
  approvedBy?: string;
}

export class PlanUpdateOrchestrator {
  private readonly executionResolver = new PlanExecutionResolver();
  private readonly projector = new PlanMarkdownProjector();

  constructor(
    private readonly repoPath: string,
    private readonly contextPath: string,
    private readonly trackingStore: PlanTrackingStore,
    private readonly indexProjector: PlanIndexProjector,
    private readonly loadLinkedPlan: LoadLinkedPlan,
    private readonly statusManager?: PrevcStatusManager,
    private readonly autoCommitOnPhaseComplete: boolean = true
  ) {}

  /**
   * Update a phase's status and persist.
   */
  async updatePlanPhase(planSlug: string, phaseId: string, status: StatusType): Promise<boolean> {
    const now = new Date().toISOString();
    const planDocument = await this.loadLinkedPlan(planSlug);
    const tracking =
      (await this.trackingStore.load(planSlug)) ?? this.trackingStore.createEmpty(planSlug, now);
    const phase = this.trackingStore.ensurePhase(tracking, phaseId, now);

    phase.status = status;
    if (status === 'in_progress' && !phase.startedAt) {
      phase.startedAt = now;
    }
    if (status === 'completed') {
      phase.completedAt = now;
    }
    if (status === 'pending') {
      phase.completedAt = undefined;
    }

    tracking.progress = this.executionResolver.calculateProgress(planDocument, tracking);
    tracking.lastUpdated = now;

    await this.trackingStore.save(planSlug, tracking);
    this.indexProjector.invalidateCache();
    await this.indexProjector.refreshIndex();

    if (this.statusManager) {
      const currentPhase = await this.statusManager.getCurrentPhase();
      await this.statusManager.addHistoryEntry({
        phase: currentPhase,
        action: 'plan_phase_updated',
        plan: planSlug,
        description: `Plan phase ${phaseId} updated to ${status}`,
      });
    }

    return true;
  }

  /**
   * Update a step's status and persist. Auto-commits when the whole phase
   * is complete if configured.
   */
  async updatePlanStep(
    planSlug: string,
    phaseId: string,
    stepIndex: number,
    status: StatusType,
    options?: PlanStepUpdateOptions
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const planDocument = await this.loadLinkedPlan(planSlug);
    const planPhase = planDocument?.phases.find((p) => p.id === phaseId);
    const planStep = planPhase?.steps.find((s) => s.order === stepIndex);
    const tracking =
      (await this.trackingStore.load(planSlug)) ?? this.trackingStore.createEmpty(planSlug, now);

    const trackedStepDescription = tracking.phases[phaseId]?.steps.find((s) => s.stepIndex === stepIndex)?.description;
    const step = this.trackingStore.ensureStep(
      tracking,
      phaseId,
      stepIndex,
      planStep?.description || trackedStepDescription || `Step ${stepIndex}`,
      now
    );

    step.deliverables = planStep?.deliverables ?? step.deliverables;
    step.status = status;
    if (status === 'in_progress' && !step.startedAt) {
      step.startedAt = now;
    }
    if (status === 'completed') {
      step.completedAt = now;
    }
    if (options?.output) {
      step.output = options.output;
    }
    if (options?.notes) {
      step.notes = options.notes;
    }

    const phase = this.trackingStore.ensurePhase(tracking, phaseId, now);
    const allStepsCompleted =
      phase.steps.length > 0 && phase.steps.every((s) => s.status === 'completed');
    const anyStepStarted = phase.steps.some(
      (s) => s.status === 'in_progress' || s.status === 'completed'
    );

    if (allStepsCompleted) {
      phase.status = 'completed';
      phase.completedAt = now;
    } else if (anyStepStarted) {
      phase.status = 'in_progress';
    }

    tracking.progress = this.executionResolver.calculateProgress(planDocument, tracking);
    tracking.lastUpdated = now;

    await this.trackingStore.save(planSlug, tracking);
    this.indexProjector.invalidateCache();
    await this.indexProjector.refreshIndex();

    if (this.statusManager) {
      const action =
        status === 'completed'
          ? 'step_completed'
          : status === 'in_progress'
            ? 'step_started'
            : status === 'skipped'
              ? 'step_skipped'
              : null;

      if (action) {
        await this.statusManager.addStepHistoryEntry({
          action,
          plan: planSlug,
          planPhase: phaseId,
          stepIndex,
          stepDescription: step.description,
          output: options?.output,
          notes: options?.notes,
        });
      }
    }

    await this.syncPlanMarkdown(planSlug);

    if (allStepsCompleted && this.autoCommitOnPhaseComplete) {
      await this.autoCommitPhase(planSlug, phaseId);
    }

    return true;
  }

  async recordDecision(
    planSlug: string,
    decision: Omit<PlanDecision, 'id' | 'decidedAt'>
  ): Promise<PlanDecision> {
    const tracking =
      (await this.trackingStore.load(planSlug)) ?? this.trackingStore.createEmpty(planSlug);
    const fullDecision = this.trackingStore.recordDecision(tracking, decision);
    await this.trackingStore.save(planSlug, tracking);
    this.indexProjector.invalidateCache();
    await this.indexProjector.refreshIndex();

    if (this.statusManager) {
      const currentPhase = await this.statusManager.getCurrentPhase();
      await this.statusManager.addHistoryEntry({
        phase: decision.phase || currentPhase,
        action: 'decision_recorded',
        plan: planSlug,
        description: `Decision recorded: ${decision.title}`,
      });
    }

    return fullDecision;
  }

  async updatePlanApproval(
    planSlug: string,
    approval: PlanApprovalUpdate
  ): Promise<PlanReference | null> {
    const tracking =
      (await this.trackingStore.load(planSlug)) ?? this.trackingStore.createEmpty(planSlug);
    this.trackingStore.applyApproval(tracking, approval);
    await this.trackingStore.save(planSlug, tracking);
    this.indexProjector.invalidateCache();
    const plans = await this.indexProjector.refreshIndex();
    return [...plans.active, ...plans.completed].find((ref) => ref.slug === planSlug) || null;
  }

  async recordPhaseCommit(
    planSlug: string,
    phaseId: string,
    commitInfo: { hash: string; shortHash: string; committedBy?: string }
  ): Promise<boolean> {
    const tracking = await this.trackingStore.load(planSlug);
    if (!tracking) {
      return false;
    }

    const recorded = this.trackingStore.recordPhaseCommit(tracking, phaseId, commitInfo);
    if (!recorded) {
      return false;
    }

    await this.trackingStore.save(planSlug, tracking);
    this.indexProjector.invalidateCache();
    await this.indexProjector.refreshIndex();
    await this.syncPlanMarkdown(planSlug);
    return true;
  }

  async syncPlanMarkdown(planSlug: string): Promise<boolean> {
    const tracking = await this.trackingStore.load(planSlug);
    const plan = await this.loadLinkedPlan(planSlug);
    if (!tracking || !plan) {
      return false;
    }

    const planPath = path.join(this.contextPath, plan.ref.path);
    if (!(await fs.pathExists(planPath))) {
      return false;
    }

    const content = await fs.readFile(planPath, 'utf-8');
    const projected = this.projector.project(content, tracking);
    await fs.writeFile(planPath, projected, 'utf-8');
    return true;
  }

  /**
   * Stage `.context/**` and commit on phase completion. Inlined from the old
   * `PlanCommitService` wrapper — this was the only call site.
   */
  private async autoCommitPhase(planSlug: string, phaseId: string): Promise<boolean> {
    try {
      const plan = await this.loadLinkedPlan(planSlug);
      if (!plan) {
        console.warn(`[AutoCommit] Plan not found: ${planSlug}`);
        return false;
      }

      const phase = plan.phases.find((p) => p.id === phaseId);
      if (!phase) {
        console.warn(`[AutoCommit] Phase not found: ${phaseId} in plan ${planSlug}`);
        return false;
      }

      const gitService = new GitService(this.repoPath);
      if (!gitService.isGitRepository()) {
        console.warn('[AutoCommit] Not a git repository - skipping auto-commit');
        return false;
      }

      const commitMessage =
        phase.commitCheckpoint || `chore(plan): complete ${phase.name} for ${planSlug}`;

      try {
        const stagedFiles = gitService.stageFiles(['.context/**']);
        if (stagedFiles.length === 0) {
          console.info('[AutoCommit] No files to commit - skipping');
          return false;
        }

        const coAuthor = 'AI Context Agent';
        const commitResult = gitService.commit(commitMessage, coAuthor);

        await this.recordPhaseCommit(planSlug, phaseId, {
          hash: commitResult.hash,
          shortHash: commitResult.shortHash,
          committedBy: coAuthor,
        });

        console.info(`[AutoCommit] Created commit ${commitResult.shortHash} for phase ${phaseId}`);
        return true;
      } catch (error) {
        console.warn(`[AutoCommit] Failed to create commit for phase ${phaseId}:`, error);
        return false;
      }
    } catch (error) {
      console.error('[AutoCommit] Unexpected error in autoCommitPhase:', error);
      return false;
    }
  }

  /**
   * Re-resolve a plan document with its canonical tracking state.
   */
  async resolveLinkedPlan(document: LinkedPlan, tracking: PlanExecutionTracking | null): Promise<LinkedPlan> {
    return this.executionResolver.resolve(document, tracking);
  }
}
