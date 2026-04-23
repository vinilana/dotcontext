import * as path from 'path';
import * as fs from 'fs-extra';
import type {
  LinkedPlan,
  PlanDecision,
  PlanPhase,
  PlanReference,
  WorkflowPlans,
} from './types';
import type { PlanExecutionTracking } from './executionTypes';
import type { PrevcPhase, StatusType } from '../types';
import type { AgentMetadata } from '../agents';
import { AgentRegistry, createAgentRegistry } from '../agents';
import { PrevcStatusManager } from '../status/statusManager';
import { PlanExecutionResolver } from './planExecutionResolver';
import { PlanIndexProjector } from './planIndexProjector';
import { PlanLinkerParser } from './planLinkerParser';
import { PlanTrackingStore } from './planTrackingStore';
import { PlanUpdateOrchestrator, PlanStepUpdateOptions } from './planUpdateOrchestrator';

/**
 * PlanLinker is a query/setup facade over the plan-domain services.
 *
 * All mutations (phase/step updates, decisions, approvals, phase commits,
 * markdown sync) are delegated to `PlanUpdateOrchestrator`. PlanLinker itself
 * handles:
 *   - initial linking of a plan file into workflow tracking
 *   - document parsing (markdown → `LinkedPlan`)
 *   - index queries (active/completed plans, per-phase lookups)
 *
 * Tracking JSON under `.context/workflow/plan-tracking/{slug}.json` is the
 * canonical runtime source of truth. Markdown is a read-only projection.
 */
export class PlanLinker {
  private readonly contextPath: string;
  private readonly plansPath: string;
  private readonly workflowPath: string;
  private readonly agentRegistry: AgentRegistry;
  private readonly parser: PlanLinkerParser;
  private readonly trackingStore: PlanTrackingStore;
  private readonly indexProjector: PlanIndexProjector;
  private readonly executionResolver: PlanExecutionResolver;
  private readonly orchestrator: PlanUpdateOrchestrator;

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
    this.executionResolver = new PlanExecutionResolver();
    this.orchestrator = new PlanUpdateOrchestrator(
      repoPath,
      this.contextPath,
      this.trackingStore,
      this.indexProjector,
      (planSlug) => this.getLinkedPlan(planSlug),
      statusManager,
      autoCommitOnPhaseComplete
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

  // ---------------------------------------------------------------------------
  // Initial linking + queries
  // ---------------------------------------------------------------------------

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
      this.indexProjector.invalidateCache();
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

  async getPlanExecutionStatus(planSlug: string): Promise<PlanExecutionTracking | null> {
    return this.trackingStore.load(planSlug);
  }

  async refreshWorkflowPlanIndex(): Promise<WorkflowPlans> {
    return this.indexProjector.refreshIndex();
  }

  // ---------------------------------------------------------------------------
  // Mutation facade — delegates to PlanUpdateOrchestrator
  // ---------------------------------------------------------------------------

  updatePlanPhase(planSlug: string, phaseId: string, status: StatusType): Promise<boolean> {
    return this.orchestrator.updatePlanPhase(planSlug, phaseId, status);
  }

  updatePlanStep(
    planSlug: string,
    phaseId: string,
    stepIndex: number,
    status: StatusType,
    options?: PlanStepUpdateOptions
  ): Promise<boolean> {
    return this.orchestrator.updatePlanStep(planSlug, phaseId, stepIndex, status, options);
  }

  recordDecision(
    planSlug: string,
    decision: Omit<PlanDecision, 'id' | 'decidedAt'>
  ): Promise<PlanDecision> {
    return this.orchestrator.recordDecision(planSlug, decision);
  }

  updatePlanApproval(
    planSlug: string,
    approval: {
      approvalStatus: 'pending' | 'approved' | 'rejected';
      approvedAt?: string;
      approvedBy?: string;
    }
  ): Promise<PlanReference | null> {
    return this.orchestrator.updatePlanApproval(planSlug, approval);
  }

  recordPhaseCommit(
    planSlug: string,
    phaseId: string,
    commitInfo: { hash: string; shortHash: string; committedBy?: string }
  ): Promise<boolean> {
    return this.orchestrator.recordPhaseCommit(planSlug, phaseId, commitInfo);
  }

  syncPlanMarkdown(planSlug: string): Promise<boolean> {
    return this.orchestrator.syncPlanMarkdown(planSlug);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async clearAllPlans(): Promise<void> {
    const plansFile = path.join(this.workflowPath, 'plans.json');
    const trackingDir = path.join(this.workflowPath, 'plan-tracking');

    if (await fs.pathExists(plansFile)) {
      await fs.remove(plansFile);
    }
    if (await fs.pathExists(trackingDir)) {
      await fs.remove(trackingDir);
    }
    this.indexProjector.invalidateCache();
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
    this.indexProjector.invalidateCache();
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
