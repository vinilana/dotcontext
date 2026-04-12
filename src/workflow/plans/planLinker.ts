import * as path from 'path';
import * as fs from 'fs-extra';
import {
  LinkedPlan,
  PlanDecision,
  PlanExecutionTracking,
  PlanPhase,
  PlanReference,
  PlanStep,
  WorkflowPlans,
} from './types';
import { PrevcPhase, StatusType } from '../types';
import { AgentMetadata, AgentRegistry, createAgentRegistry } from '../agents';
import { PrevcStatusManager } from '../status/statusManager';
import { PlanCommitService } from './planCommitService';
import { PlanLinkerParser } from './planLinkerParser';
import { PlanMarkdownProjector } from './planMarkdownProjector';
import { PlanTrackingStore } from './planTrackingStore';

export class PlanLinker {
  private readonly contextPath: string;
  private readonly plansPath: string;
  private readonly workflowPath: string;
  private readonly agentRegistry: AgentRegistry;
  private readonly parser: PlanLinkerParser;
  private readonly trackingStore: PlanTrackingStore;
  private readonly projector: PlanMarkdownProjector;
  private readonly commitService: PlanCommitService;

  constructor(
    private readonly repoPath: string,
    private readonly statusManager?: PrevcStatusManager,
    private readonly autoCommitOnPhaseComplete: boolean = true
  ) {
    this.contextPath = path.join(repoPath, '.context');
    this.plansPath = path.join(this.contextPath, 'plans');
    this.workflowPath = path.join(this.contextPath, 'workflow');
    this.agentRegistry = createAgentRegistry(repoPath);
    this.parser = new PlanLinkerParser();
    this.trackingStore = new PlanTrackingStore(this.workflowPath);
    this.projector = new PlanMarkdownProjector();
    this.commitService = new PlanCommitService(
      repoPath,
      (planSlug) => this.getLinkedPlan(planSlug),
      (planSlug, phaseId, commitInfo) => this.recordPhaseCommit(planSlug, phaseId, commitInfo)
    );
  }

  static async create(
    repoPath: string = process.cwd(),
    statusManager?: PrevcStatusManager,
    autoCommitOnPhaseComplete: boolean = true
  ): Promise<PlanLinker> {
    return new PlanLinker(repoPath, statusManager, autoCommitOnPhaseComplete);
  }

  async ensureWorkflowPlanIndex(): Promise<void> {
    const plansFile = path.join(this.workflowPath, 'plans.json');
    if (await fs.pathExists(plansFile)) {
      return;
    }

    await fs.ensureDir(this.workflowPath);
    await fs.writeJson(plansFile, { active: [], completed: [] } satisfies WorkflowPlans, { spaces: 2 });
  }

  async discoverAgents(): Promise<Array<{ type: string; path: string; isCustom: boolean }>> {
    const discovered = await this.agentRegistry.discoverAll();
    return discovered.all.map((agent) => ({
      type: agent.type,
      path: agent.path,
      isCustom: agent.isCustom,
    }));
  }

  async getAgentInfo(agentType: string): Promise<AgentMetadata> {
    return this.agentRegistry.getAgentMetadata(agentType);
  }

  async linkPlan(planSlug: string): Promise<PlanReference | null> {
    const planPath = path.join(this.plansPath, `${planSlug}.md`);
    if (!await fs.pathExists(planPath)) {
      return null;
    }

    const content = await fs.readFile(planPath, 'utf-8');
    const planInfo = this.parser.parsePlanFile(content, planSlug);
    const ref: PlanReference = {
      slug: planSlug,
      path: `plans/${planSlug}.md`,
      title: planInfo.title,
      summary: planInfo.summary,
      linkedAt: new Date().toISOString(),
      status: 'active',
    };

    await this.addPlanToWorkflow(ref);
    return ref;
  }

  async getLinkedPlans(): Promise<WorkflowPlans> {
    const plansFile = path.join(this.workflowPath, 'plans.json');
    if (!await fs.pathExists(plansFile)) {
      return { active: [], completed: [] };
    }

    try {
      return await fs.readJson(plansFile);
    } catch {
      return { active: [], completed: [] };
    }
  }

  async updatePlanReference(
    planSlug: string,
    updater: (ref: PlanReference) => PlanReference
  ): Promise<PlanReference | null> {
    const plans = await this.getLinkedPlans();

    const updateBucket = (bucket: PlanReference[]) => {
      const index = bucket.findIndex((ref) => ref.slug === planSlug);
      if (index === -1) {
        return null;
      }

      const updated = updater({ ...bucket[index] });
      bucket[index] = updated;
      return updated;
    };

    const updatedRef = updateBucket(plans.active) ?? updateBucket(plans.completed);
    if (!updatedRef) {
      return null;
    }

    const plansFile = path.join(this.workflowPath, 'plans.json');
    await fs.ensureDir(path.dirname(plansFile));
    await fs.writeJson(plansFile, plans, { spaces: 2 });
    return updatedRef;
  }

  async getLinkedPlan(planSlug: string): Promise<LinkedPlan | null> {
    const plans = await this.getLinkedPlans();
    const ref = [...plans.active, ...plans.completed].find((plan) => plan.slug === planSlug);
    if (!ref) {
      return null;
    }

    const planPath = path.join(this.contextPath, ref.path);
    if (!await fs.pathExists(planPath)) {
      return null;
    }

    const content = await fs.readFile(planPath, 'utf-8');
    const parsed = this.parser.parsePlanToLinked(content, ref);
    const tracking = await this.trackingStore.load(planSlug);
    return tracking ? this.applyTracking(parsed, tracking) : parsed;
  }

  async getPlansForPhase(phase: PrevcPhase): Promise<LinkedPlan[]> {
    const plans = await this.getLinkedPlans();
    const linkedPlans: LinkedPlan[] = [];

    for (const ref of plans.active) {
      const plan = await this.getLinkedPlan(ref.slug);
      if (plan?.phases.some((planPhase) => planPhase.prevcPhase === phase)) {
        linkedPlans.push(plan);
      }
    }

    return linkedPlans;
  }

  getPhaseMappingForWorkflow(plan: LinkedPlan, currentPrevcPhase: PrevcPhase): PlanPhase[] {
    return plan.phases.filter((phase) => phase.prevcPhase === currentPrevcPhase);
  }

  hasPendingWorkForPhase(plan: LinkedPlan, phase: PrevcPhase): boolean {
    return plan.phases
      .filter((planPhase) => planPhase.prevcPhase === phase)
      .some((planPhase) => planPhase.status === 'pending' || planPhase.status === 'in_progress');
  }

  async getPlanProgress(planSlug: string): Promise<{
    overall: number;
    byPhase: Record<PrevcPhase, { total: number; completed: number; percentage: number }>;
  }> {
    const plan = await this.getLinkedPlan(planSlug);
    const byPhase: Record<PrevcPhase, { total: number; completed: number; percentage: number }> = {
      P: { total: 0, completed: 0, percentage: 0 },
      R: { total: 0, completed: 0, percentage: 0 },
      E: { total: 0, completed: 0, percentage: 0 },
      V: { total: 0, completed: 0, percentage: 0 },
      C: { total: 0, completed: 0, percentage: 0 },
    };

    if (!plan) {
      return { overall: 0, byPhase };
    }

    for (const phase of plan.phases) {
      byPhase[phase.prevcPhase].total++;
      if (phase.status === 'completed') {
        byPhase[phase.prevcPhase].completed++;
      }
    }

    for (const phase of Object.keys(byPhase) as PrevcPhase[]) {
      const entry = byPhase[phase];
      entry.percentage = entry.total > 0 ? Math.round((entry.completed / entry.total) * 100) : 0;
    }

    return {
      overall: plan.progress,
      byPhase,
    };
  }

  async updatePlanPhase(planSlug: string, phaseId: string, status: StatusType): Promise<boolean> {
    const now = new Date().toISOString();
    const tracking = (await this.trackingStore.load(planSlug)) ?? this.trackingStore.createEmpty(planSlug, now);
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

    const plan = await this.getLinkedPlan(planSlug);
    tracking.progress = this.calculateTrackingProgress(plan, tracking);
    tracking.lastUpdated = now;
    await this.trackingStore.save(planSlug, tracking);

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

  async recordDecision(
    planSlug: string,
    decision: Omit<PlanDecision, 'id' | 'decidedAt'>
  ): Promise<PlanDecision> {
    const tracking = (await this.trackingStore.load(planSlug)) ?? this.trackingStore.createEmpty(planSlug);
    const fullDecision = this.trackingStore.recordDecision(tracking, decision);
    await this.trackingStore.save(planSlug, tracking);

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

  async updatePlanStep(
    planSlug: string,
    phaseId: string,
    stepIndex: number,
    status: StatusType,
    options?: {
      output?: string;
      notes?: string;
    }
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const plan = await this.getLinkedPlan(planSlug);
    const planPhase = plan?.phases.find((phase) => phase.id === phaseId);
    const planStep = planPhase?.steps.find((step) => step.order === stepIndex);
    const tracking = (await this.trackingStore.load(planSlug)) ?? this.trackingStore.createEmpty(planSlug, now);
    const step = this.trackingStore.ensureStep(
      tracking,
      phaseId,
      stepIndex,
      planStep?.description || `Step ${stepIndex}`,
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
    const allStepsCompleted = phase.steps.length > 0 && phase.steps.every((trackedStep) => trackedStep.status === 'completed');
    const anyStepStarted = phase.steps.some((trackedStep) => trackedStep.status === 'in_progress' || trackedStep.status === 'completed');

    if (allStepsCompleted) {
      phase.status = 'completed';
      phase.completedAt = now;
    } else if (anyStepStarted) {
      phase.status = 'in_progress';
    }

    tracking.progress = this.calculateTrackingProgress(plan, tracking);
    tracking.lastUpdated = now;
    await this.trackingStore.save(planSlug, tracking);

    if (this.statusManager) {
      const action = status === 'completed'
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

  async updatePlanApproval(
    planSlug: string,
    approval: {
      approvalStatus: 'pending' | 'approved' | 'rejected';
      approvedAt?: string;
      approvedBy?: string;
    }
  ): Promise<PlanReference | null> {
    const updatedRef = await this.updatePlanReference(planSlug, (ref) => ({
      ...ref,
      approval_status: approval.approvalStatus,
      approved_at: approval.approvedAt,
      approved_by: approval.approvedBy,
    }));

    if (!updatedRef) {
      return null;
    }

    const tracking = (await this.trackingStore.load(planSlug)) ?? this.trackingStore.createEmpty(planSlug);
    this.trackingStore.applyApproval(tracking, approval);
    await this.trackingStore.save(planSlug, tracking);
    return updatedRef;
  }

  async getPlanExecutionStatus(planSlug: string): Promise<PlanExecutionTracking | null> {
    return this.trackingStore.load(planSlug);
  }

  async syncPlanMarkdown(planSlug: string): Promise<boolean> {
    const tracking = await this.trackingStore.load(planSlug);
    const planPath = path.join(this.plansPath, `${planSlug}.md`);
    if (!tracking || !await fs.pathExists(planPath)) {
      return false;
    }

    const content = await fs.readFile(planPath, 'utf-8');
    const projected = this.projector.project(content, tracking);
    await fs.writeFile(planPath, projected, 'utf-8');
    return true;
  }

  async recordPhaseCommit(
    planSlug: string,
    phaseId: string,
    commitInfo: {
      hash: string;
      shortHash: string;
      committedBy?: string;
    }
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
    await this.syncPlanMarkdown(planSlug);
    return true;
  }

  async clearAllPlans(): Promise<void> {
    const plansFile = path.join(this.workflowPath, 'plans.json');
    const trackingDir = path.join(this.workflowPath, 'plan-tracking');

    if (await fs.pathExists(plansFile)) {
      await fs.remove(plansFile);
    }
    if (await fs.pathExists(trackingDir)) {
      await fs.remove(trackingDir);
    }
  }

  async archivePlans(): Promise<void> {
    const plansFile = path.join(this.workflowPath, 'plans.json');
    const trackingDir = path.join(this.workflowPath, 'plan-tracking');
    const hasPlans = await fs.pathExists(plansFile);
    const hasTracking = await fs.pathExists(trackingDir);

    if (!hasPlans && !hasTracking) {
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveDir = path.join(this.workflowPath, 'archive', `plans-${timestamp}`);
    await fs.ensureDir(archiveDir);

    if (hasPlans) {
      await fs.move(plansFile, path.join(archiveDir, 'plans.json'));
    }
    if (hasTracking) {
      await fs.move(trackingDir, path.join(archiveDir, 'plan-tracking'));
    }
  }

  private calculateTrackingProgress(plan: LinkedPlan | null, tracking: PlanExecutionTracking): number {
    const stepProgress = this.trackingStore.calculateStepProgress(tracking);
    if (stepProgress > 0) {
      return stepProgress;
    }

    if (!plan || plan.phases.length === 0) {
      return tracking.progress;
    }

    const completedPhases = plan.phases.filter((phase) => {
      const trackedPhase = tracking.phases[phase.id];
      return trackedPhase?.status === 'completed';
    }).length;

    return Math.round((completedPhases / plan.phases.length) * 100);
  }

  private applyTracking(plan: LinkedPlan, tracking: PlanExecutionTracking): LinkedPlan {
    const phases = plan.phases.map((phase) => {
      const trackedPhase = tracking.phases[phase.id];
      const trackedSteps = new Map((trackedPhase?.steps ?? []).map((step) => [step.stepIndex, step]));

      const steps = phase.steps.map((step) => {
        const trackedStep = trackedSteps.get(step.order);
        return trackedStep
          ? {
              ...step,
              status: trackedStep.status,
              completedAt: trackedStep.completedAt,
              outputs: trackedStep.output
                ? Array.from(new Set([...(step.outputs ?? []), trackedStep.output]))
                : step.outputs,
            }
          : step;
      });

      for (const trackedStep of trackedPhase?.steps ?? []) {
        if (!steps.some((step) => step.order === trackedStep.stepIndex)) {
          steps.push(this.toTrackedPlanStep(trackedStep.stepIndex, trackedStep));
        }
      }

      const inferredStatus = trackedPhase?.status || this.inferPhaseStatusFromSteps(steps, phase.status);

      return {
        ...phase,
        status: inferredStatus,
        startedAt: trackedPhase?.startedAt || phase.startedAt,
        completedAt: trackedPhase?.completedAt || phase.completedAt,
        steps: steps.sort((a, b) => a.order - b.order),
      };
    });

    const currentPhase = phases.find((phase) => phase.status === 'in_progress')?.id;

    return {
      ...plan,
      phases,
      progress: tracking.progress,
      currentPhase,
    };
  }

  private inferPhaseStatusFromSteps(steps: PlanStep[], fallback: StatusType): StatusType {
    if (steps.length === 0) {
      return fallback;
    }
    if (steps.every((step) => step.status === 'completed')) {
      return 'completed';
    }
    if (steps.some((step) => step.status === 'in_progress' || step.status === 'completed')) {
      return 'in_progress';
    }
    return fallback;
  }

  private toTrackedPlanStep(stepIndex: number, trackedStep: NonNullable<PlanExecutionTracking['phases'][string]>['steps'][number]): PlanStep {
    const outputs = trackedStep.output ? [trackedStep.output] : trackedStep.deliverables;
    return {
      order: stepIndex,
      description: trackedStep.description,
      deliverables: trackedStep.deliverables,
      outputs,
      status: trackedStep.status,
      completedAt: trackedStep.completedAt,
    };
  }

  private async addPlanToWorkflow(ref: PlanReference): Promise<void> {
    const plans = await this.getLinkedPlans();
    const existingRef = [...plans.active, ...plans.completed].find((plan) => plan.slug === ref.slug);
    const nextRef: PlanReference = existingRef
      ? {
          ...ref,
          approval_status: existingRef.approval_status,
          approved_at: existingRef.approved_at,
          approved_by: existingRef.approved_by,
        }
      : ref;

    plans.active = plans.active.filter((plan) => plan.slug !== ref.slug);
    plans.completed = plans.completed.filter((plan) => plan.slug !== ref.slug);
    plans.active.push(nextRef);
    if (!plans.primary) {
      plans.primary = nextRef.slug;
    }

    const plansFile = path.join(this.workflowPath, 'plans.json');
    await fs.ensureDir(this.workflowPath);
    await fs.writeJson(plansFile, plans, { spaces: 2 });
  }

  private async autoCommitPhase(planSlug: string, phaseId: string): Promise<boolean> {
    return this.commitService.autoCommitPhase(planSlug, phaseId);
  }
}

export function createPlanLinker(
  repoPath: string,
  statusManager?: PrevcStatusManager,
  autoCommitOnPhaseComplete: boolean = true
): PlanLinker {
  return new PlanLinker(repoPath, statusManager, autoCommitOnPhaseComplete);
}
