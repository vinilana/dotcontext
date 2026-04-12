import * as path from 'path';
import * as fs from 'fs-extra';
import type {
  LinkedPlan,
  PlanDecision,
  PlanExecutionTracking,
  PlanPhase,
  PlanReference,
  WorkflowPlans,
} from './types';
import type { PrevcPhase, StatusType } from '../types';
import type { AgentMetadata } from '../agents';
import { AgentRegistry, createAgentRegistry } from '../agents';
import { PrevcStatusManager } from '../status/statusManager';
import { PlanCommitService } from './planCommitService';
import { PlanExecutionResolver } from './planExecutionResolver';
import { PlanIndexProjector } from './planIndexProjector';
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
  private readonly indexProjector: PlanIndexProjector;
  private readonly projector: PlanMarkdownProjector;
  private readonly commitService: PlanCommitService;
  private readonly executionResolver: PlanExecutionResolver;

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
    this.indexProjector = new PlanIndexProjector(
      this.contextPath,
      this.workflowPath,
      this.plansPath,
      this.parser,
      () => this.trackingStore.loadAll()
    );
    this.projector = new PlanMarkdownProjector();
    this.executionResolver = new PlanExecutionResolver();
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
    await this.refreshWorkflowPlanIndex();
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

    const now = new Date().toISOString();
    const existingTracking = await this.trackingStore.load(planSlug);
    const tracking = existingTracking ?? this.trackingStore.createEmpty(planSlug, now);
    if (!existingTracking) {
      await this.trackingStore.save(planSlug, tracking);
    }

    const content = await fs.readFile(planPath, 'utf-8');
    const planInfo = this.parser.parsePlanFile(content, planSlug);
    const plans = await this.refreshWorkflowPlanIndex();
    const linkedRef = [...plans.active, ...plans.completed].find((plan) => plan.slug === planSlug);

    return linkedRef ?? {
      slug: planSlug,
      path: `plans/${planSlug}.md`,
      title: planInfo.title,
      summary: planInfo.summary,
      linkedAt: tracking.linkedAt,
      status: 'active',
    };
  }

  async getLinkedPlans(): Promise<WorkflowPlans> {
    return this.refreshWorkflowPlanIndex();
  }

  async getLinkedPlan(planSlug: string): Promise<LinkedPlan | null> {
    const plans = await this.getLinkedPlans();
    const ref = [...plans.active, ...plans.completed].find((plan) => plan.slug === planSlug);
    if (!ref) {
      return null;
    }

    const parsed = await this.loadPlanDocument(ref);
    if (!parsed) {
      return null;
    }

    const tracking = await this.trackingStore.load(planSlug);
    return this.executionResolver.resolve(parsed, tracking);
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
    const planDocument = await this.loadPlanDocumentBySlug(planSlug);
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

    tracking.progress = this.executionResolver.calculateProgress(planDocument, tracking);
    tracking.lastUpdated = now;
    await this.trackingStore.save(planSlug, tracking);
    await this.refreshWorkflowPlanIndex();

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
    await this.refreshWorkflowPlanIndex();

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
    const planDocument = await this.loadPlanDocumentBySlug(planSlug);
    const planPhase = planDocument?.phases.find((phase) => phase.id === phaseId);
    const planStep = planPhase?.steps.find((step) => step.order === stepIndex);
    const tracking = (await this.trackingStore.load(planSlug)) ?? this.trackingStore.createEmpty(planSlug, now);
    const trackedStepDescription = tracking.phases[phaseId]?.steps.find((step) => step.stepIndex === stepIndex)?.description;
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
    const allStepsCompleted = phase.steps.length > 0 && phase.steps.every((trackedStep) => trackedStep.status === 'completed');
    const anyStepStarted = phase.steps.some((trackedStep) => trackedStep.status === 'in_progress' || trackedStep.status === 'completed');

    if (allStepsCompleted) {
      phase.status = 'completed';
      phase.completedAt = now;
    } else if (anyStepStarted) {
      phase.status = 'in_progress';
    }

    tracking.progress = this.executionResolver.calculateProgress(planDocument, tracking);
    tracking.lastUpdated = now;
    await this.trackingStore.save(planSlug, tracking);
    await this.refreshWorkflowPlanIndex();

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
    const tracking = (await this.trackingStore.load(planSlug)) ?? this.trackingStore.createEmpty(planSlug);
    this.trackingStore.applyApproval(tracking, approval);
    await this.trackingStore.save(planSlug, tracking);
    const plans = await this.refreshWorkflowPlanIndex();
    return [...plans.active, ...plans.completed].find((ref) => ref.slug === planSlug) || null;
  }

  async getPlanExecutionStatus(planSlug: string): Promise<PlanExecutionTracking | null> {
    return this.trackingStore.load(planSlug);
  }

  async syncPlanMarkdown(planSlug: string): Promise<boolean> {
    const tracking = await this.trackingStore.load(planSlug);
    const plan = await this.getLinkedPlan(planSlug);
    if (!tracking || !plan) {
      return false;
    }

    const planPath = path.join(this.contextPath, plan.ref.path);
    if (!await fs.pathExists(planPath)) {
      return false;
    }

    const content = await fs.readFile(planPath, 'utf-8');
    const projected = this.projector.project(content, tracking);
    await fs.writeFile(planPath, projected, 'utf-8');
    return true;
  }

  async refreshWorkflowPlanIndex(): Promise<WorkflowPlans> {
    return this.indexProjector.refreshIndex();
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
    await this.refreshWorkflowPlanIndex();
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

  private async autoCommitPhase(planSlug: string, phaseId: string): Promise<boolean> {
    return this.commitService.autoCommitPhase(planSlug, phaseId);
  }

  private async loadPlanDocumentBySlug(planSlug: string): Promise<LinkedPlan | null> {
    const plans = await this.getLinkedPlans();
    const ref = [...plans.active, ...plans.completed].find((plan) => plan.slug === planSlug);
    if (!ref) {
      return null;
    }

    return this.loadPlanDocument(ref);
  }

  private async loadPlanDocument(ref: PlanReference): Promise<LinkedPlan | null> {
    const planPath = path.join(this.contextPath, ref.path);
    if (!await fs.pathExists(planPath)) {
      return null;
    }

    const content = await fs.readFile(planPath, 'utf-8');
    return this.parser.parsePlanToLinked(content, ref);
  }
}

export function createPlanLinker(
  repoPath: string,
  statusManager?: PrevcStatusManager,
  autoCommitOnPhaseComplete: boolean = true
): PlanLinker {
  return new PlanLinker(repoPath, statusManager, autoCommitOnPhaseComplete);
}
