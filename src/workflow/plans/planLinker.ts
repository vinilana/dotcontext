/**
 * Plan Linker
 *
 * Links implementation plans to the PREVC workflow system.
 * Provides bidirectional sync between plan progress and workflow phases.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import {
  PlanReference,
  LinkedPlan,
  PlanPhase,
  PlanStep,
  PlanDecision,
  WorkflowPlans,
  PLAN_PHASE_TO_PREVC,
  StepExecution,
  PlanPhaseTracking,
  PlanExecutionTracking,
} from './types';
import { PrevcPhase, StatusType } from '../types';
import { AgentRegistry, AgentMetadata, createAgentRegistry } from '../agents';
import { PrevcStatusManager } from '../status/statusManager';
import { GitService } from '../../utils/gitService';
import { parseScaffoldFrontMatter } from '../../utils/frontMatter';

/**
 * Plan Linker class
 *
 * Responsible for:
 * - Linking plans to PREVC workflow
 * - Parsing plan frontmatter and content
 * - Tracking plan progress
 * - Recording decisions
 *
 * Agent discovery is delegated to AgentRegistry (SRP).
 */
export class PlanLinker {
  private readonly repoPath: string;
  private readonly contextPath: string;
  private readonly plansPath: string;
  private readonly workflowPath: string;
  private readonly agentRegistry: AgentRegistry;
  private readonly statusManager?: PrevcStatusManager;
  private readonly autoCommitOnPhaseComplete: boolean;

  constructor(repoPath: string, statusManager?: PrevcStatusManager, autoCommitOnPhaseComplete: boolean = true) {
    this.repoPath = repoPath;
    this.contextPath = path.join(repoPath, '.context');
    this.plansPath = path.join(this.contextPath, 'plans');
    this.workflowPath = path.join(this.contextPath, 'workflow');
    this.agentRegistry = createAgentRegistry(repoPath);
    this.statusManager = statusManager;
    this.autoCommitOnPhaseComplete = autoCommitOnPhaseComplete;
  }

  /**
   * Create a PlanLinker with the given repository path
   */
  static async create(
    repoPath: string = process.cwd(),
    statusManager?: PrevcStatusManager,
    autoCommitOnPhaseComplete: boolean = true
  ): Promise<PlanLinker> {
    return new PlanLinker(repoPath, statusManager, autoCommitOnPhaseComplete);
  }

  /**
   * Ensure workflow plan index exists
   */
  async ensureWorkflowPlanIndex(): Promise<void> {
    const plansFile = path.join(this.workflowPath, 'plans.json');

    if (await fs.pathExists(plansFile)) {
      return;
    }

    await fs.ensureDir(this.workflowPath);
    const initialPlans: WorkflowPlans = { active: [], completed: [] };
    await fs.writeFile(plansFile, JSON.stringify(initialPlans, null, 2), 'utf-8');
  }

  /**
   * Discover all available agents (built-in + custom)
   * Delegates to AgentRegistry
   */
  async discoverAgents(): Promise<Array<{ type: string; path: string; isCustom: boolean }>> {
    const discovered = await this.agentRegistry.discoverAll();
    return discovered.all.map(a => ({
      type: a.type,
      path: a.path,
      isCustom: a.isCustom,
    }));
  }

  /**
   * Get agent info including custom agents
   * Delegates to AgentRegistry
   */
  async getAgentInfo(agentType: string): Promise<AgentMetadata> {
    return this.agentRegistry.getAgentMetadata(agentType);
  }

  /**
   * Link a plan to the current workflow
   */
  async linkPlan(planSlug: string): Promise<PlanReference | null> {
    const planPath = path.join(this.plansPath, `${planSlug}.md`);

    if (!await fs.pathExists(planPath)) {
      return null;
    }

    const content = await fs.readFile(planPath, 'utf-8');
    const planInfo = this.parsePlanFile(content, planSlug);

    const ref: PlanReference = {
      slug: planSlug,
      path: `plans/${planSlug}.md`,
      title: planInfo.title,
      summary: planInfo.summary,
      linkedAt: new Date().toISOString(),
      status: 'active',
    };

    // Update workflow plans tracking
    await this.addPlanToWorkflow(ref);

    return ref;
  }

  /**
   * Get all linked plans for the current workflow
   */
  async getLinkedPlans(): Promise<WorkflowPlans> {
    const plansFile = path.join(this.workflowPath, 'plans.json');

    if (!await fs.pathExists(plansFile)) {
      return { active: [], completed: [] };
    }

    const content = await fs.readFile(plansFile, 'utf-8');
    try {
      return JSON.parse(content) || { active: [], completed: [] };
    } catch {
      return { active: [], completed: [] };
    }
  }

  /**
   * Update a linked plan reference in workflow tracking.
   */
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

  /**
   * Get detailed plan with workflow mapping
   */
  async getLinkedPlan(planSlug: string): Promise<LinkedPlan | null> {
    const plans = await this.getLinkedPlans();
    const ref = [...plans.active, ...plans.completed].find(p => p.slug === planSlug);

    if (!ref) {
      return null;
    }

    const planPath = path.join(this.contextPath, ref.path);
    if (!await fs.pathExists(planPath)) {
      return null;
    }

    const content = await fs.readFile(planPath, 'utf-8');
    return this.parsePlanToLinked(content, ref);
  }

  /**
   * Get plans for a specific PREVC phase
   */
  async getPlansForPhase(phase: PrevcPhase): Promise<LinkedPlan[]> {
    const plans = await this.getLinkedPlans();
    const linkedPlans: LinkedPlan[] = [];

    for (const ref of plans.active) {
      const plan = await this.getLinkedPlan(ref.slug);
      if (plan) {
        const hasPhase = plan.phases.some(p => p.prevcPhase === phase);
        if (hasPhase) {
          linkedPlans.push(plan);
        }
      }
    }

    return linkedPlans;
  }

  /**
   * Update plan phase status and sync with workflow
   */
  async updatePlanPhase(
    planSlug: string,
    phaseId: string,
    status: StatusType
  ): Promise<boolean> {
    const trackingFile = path.join(this.workflowPath, 'plan-tracking', `${planSlug}.json`);

    let tracking: Record<string, unknown> = {};
    if (await fs.pathExists(trackingFile)) {
      const content = await fs.readFile(trackingFile, 'utf-8');
      try {
        tracking = JSON.parse(content) || {};
      } catch {
        tracking = {};
      }
    }

    // Update phase tracking
    if (!tracking.phases) {
      tracking.phases = {};
    }
    (tracking.phases as Record<string, unknown>)[phaseId] = {
      status,
      updatedAt: new Date().toISOString(),
    };

    // Calculate progress
    const plan = await this.getLinkedPlan(planSlug);
    if (plan) {
      const totalPhases = plan.phases.length;
      const completedPhases = plan.phases.filter(p =>
        (tracking.phases as Record<string, { status: string }>)?.[p.id]?.status === 'completed'
      ).length;
      tracking.progress = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0;
    }

    // Save tracking
    await fs.ensureDir(path.dirname(trackingFile));
    await fs.writeFile(trackingFile, JSON.stringify(tracking, null, 2), 'utf-8');

    // Log phase update to workflow execution history
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
   * Record a decision in the plan
   */
  async recordDecision(
    planSlug: string,
    decision: Omit<PlanDecision, 'id' | 'decidedAt'>
  ): Promise<PlanDecision> {
    const trackingFile = path.join(this.workflowPath, 'plan-tracking', `${planSlug}.json`);

    let tracking: Record<string, unknown> = {};
    if (await fs.pathExists(trackingFile)) {
      const content = await fs.readFile(trackingFile, 'utf-8');
      try {
        tracking = JSON.parse(content) || {};
      } catch {
        tracking = {};
      }
    }

    if (!tracking.decisions) {
      tracking.decisions = [];
    }

    const fullDecision: PlanDecision = {
      ...decision,
      id: `dec-${Date.now()}`,
      decidedAt: new Date().toISOString(),
    };

    (tracking.decisions as PlanDecision[]).push(fullDecision);

    await fs.ensureDir(path.dirname(trackingFile));
    await fs.writeFile(trackingFile, JSON.stringify(tracking, null, 2), 'utf-8');

    // Log decision to workflow execution history
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

  /**
   * Get current phase mapping for workflow
   */
  getPhaseMappingForWorkflow(plan: LinkedPlan, currentPrevcPhase: PrevcPhase): PlanPhase[] {
    return plan.phases.filter(p => p.prevcPhase === currentPrevcPhase);
  }

  /**
   * Check if plan has pending work for a PREVC phase
   */
  hasPendingWorkForPhase(plan: LinkedPlan, phase: PrevcPhase): boolean {
    const phasesInPrevc = plan.phases.filter(p => p.prevcPhase === phase);
    return phasesInPrevc.some(p => p.status === 'pending' || p.status === 'in_progress');
  }

  /**
   * Get plan progress summary
   */
  async getPlanProgress(planSlug: string): Promise<{
    overall: number;
    byPhase: Record<PrevcPhase, { total: number; completed: number; percentage: number }>;
  }> {
    const plan = await this.getLinkedPlan(planSlug);
    if (!plan) {
      return { overall: 0, byPhase: {} as Record<PrevcPhase, { total: number; completed: number; percentage: number }> };
    }

    const byPhase: Record<PrevcPhase, { total: number; completed: number; percentage: number }> = {
      P: { total: 0, completed: 0, percentage: 0 },
      R: { total: 0, completed: 0, percentage: 0 },
      E: { total: 0, completed: 0, percentage: 0 },
      V: { total: 0, completed: 0, percentage: 0 },
      C: { total: 0, completed: 0, percentage: 0 },
    };

    for (const phase of plan.phases) {
      byPhase[phase.prevcPhase].total++;
      if (phase.status === 'completed') {
        byPhase[phase.prevcPhase].completed++;
      }
    }

    // Calculate percentages
    for (const key of Object.keys(byPhase) as PrevcPhase[]) {
      const { total, completed } = byPhase[key];
      byPhase[key].percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    }

    return {
      overall: plan.progress,
      byPhase,
    };
  }

  /**
   * Update individual step status within a plan phase
   */
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
    const trackingFile = path.join(this.workflowPath, 'plan-tracking', `${planSlug}.json`);
    const now = new Date().toISOString();

    // Load existing tracking or create new
    let tracking = await this.loadPlanTracking(planSlug);
    if (!tracking) {
      tracking = {
        planSlug,
        progress: 0,
        phases: {},
        decisions: [],
        lastUpdated: now,
      };
    }

    // Ensure phase exists in tracking
    if (!tracking.phases[phaseId]) {
      tracking.phases[phaseId] = {
        phaseId,
        status: 'in_progress',
        startedAt: now,
        steps: [],
      };
    }

    // Find or create step entry
    let step = tracking.phases[phaseId].steps.find(s => s.stepIndex === stepIndex);
    if (!step) {
      // Get step description from the plan if possible
      const plan = await this.getLinkedPlan(planSlug);
      const planPhase = plan?.phases.find(p => p.id === phaseId);
      const planStep = planPhase?.steps.find(s => s.order === stepIndex);

      step = {
        stepIndex,
        description: planStep?.description || `Step ${stepIndex}`,
        status: 'pending',
      };
      tracking.phases[phaseId].steps.push(step);
    }

    // Update step status and timestamps
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

    // Update phase status based on steps
    const phaseSteps = tracking.phases[phaseId].steps;
    const allStepsCompleted = phaseSteps.length > 0 && phaseSteps.every(s => s.status === 'completed');
    const anyStepInProgress = phaseSteps.some(s => s.status === 'in_progress');

    if (allStepsCompleted) {
      tracking.phases[phaseId].status = 'completed';
      tracking.phases[phaseId].completedAt = now;

      // Auto-commit on phase completion
      if (this.autoCommitOnPhaseComplete) {
        await this.autoCommitPhase(planSlug, phaseId);
      }
    } else if (anyStepInProgress || phaseSteps.some(s => s.status === 'completed')) {
      tracking.phases[phaseId].status = 'in_progress';
    }

    // Recalculate overall progress
    tracking.progress = this.calculateStepProgress(tracking);
    tracking.lastUpdated = now;

    // Save tracking
    await fs.ensureDir(path.dirname(trackingFile));
    await fs.writeFile(trackingFile, JSON.stringify(tracking, null, 2), 'utf-8');

    // Log step to workflow execution history (breadcrumb trail)
    if (this.statusManager) {
      const action = status === 'completed' ? 'step_completed' :
                     status === 'in_progress' ? 'step_started' :
                     status === 'skipped' ? 'step_skipped' : null;
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

    // Auto-sync to markdown
    await this.syncPlanMarkdown(planSlug);

    return true;
  }

  /**
   * Update approval metadata for a linked plan.
   * Keeps the workflow plan index and plan tracking projection in sync.
   */
  async updatePlanApproval(
    planSlug: string,
    approval: {
      approvalStatus: 'pending' | 'approved' | 'rejected';
      approvedAt?: string;
      approvedBy?: string;
    }
  ): Promise<PlanReference | null> {
    const plansFile = path.join(this.workflowPath, 'plans.json');

    if (!await fs.pathExists(plansFile)) {
      return null;
    }

    const plans = await this.getLinkedPlans();
    let updatedRef: PlanReference | null = null;
    let found = false;

    const applyApproval = (ref: PlanReference): PlanReference => {
      found = true;
      const nextRef: PlanReference = {
        ...ref,
        approval_status: approval.approvalStatus,
        approved_at: approval.approvedAt,
        approved_by: approval.approvedBy,
      };
      updatedRef = nextRef;
      return nextRef;
    };

    plans.active = plans.active.map((ref) => (ref.slug === planSlug ? applyApproval(ref) : ref));
    plans.completed = plans.completed.map((ref) => (ref.slug === planSlug ? applyApproval(ref) : ref));

    if (!found || !updatedRef) {
      return null;
    }

    await fs.ensureDir(this.workflowPath);
    await fs.writeFile(plansFile, JSON.stringify(plans, null, 2), 'utf-8');

    const tracking = await this.loadPlanTracking(planSlug);
    if (tracking) {
      tracking.approvalStatus = approval.approvalStatus;
      tracking.approvedAt = approval.approvedAt;
      tracking.approvedBy = approval.approvedBy;
      tracking.lastUpdated = approval.approvedAt || new Date().toISOString();
      const trackingFile = path.join(this.workflowPath, 'plan-tracking', `${planSlug}.json`);
      await fs.ensureDir(path.dirname(trackingFile));
      await fs.writeFile(trackingFile, JSON.stringify(tracking, null, 2), 'utf-8');
    }

    return updatedRef;
  }

  /**
   * Get detailed execution status for a plan including all steps
   */
  async getPlanExecutionStatus(planSlug: string): Promise<PlanExecutionTracking | null> {
    return this.loadPlanTracking(planSlug);
  }

  /**
   * Sync tracking data back to the plan markdown file
   * Updates checkboxes, timestamps, and adds execution history section
   */
  async syncPlanMarkdown(planSlug: string): Promise<boolean> {
    const planPath = path.join(this.plansPath, `${planSlug}.md`);
    const tracking = await this.loadPlanTracking(planSlug);

    if (!tracking || !await fs.pathExists(planPath)) {
      return false;
    }

    let content = await fs.readFile(planPath, 'utf-8');

    // Update frontmatter with progress and phase statuses
    content = this.updateFrontmatterProgress(content, tracking);

    // Update step checkboxes in markdown body
    content = this.updateStepCheckboxes(content, tracking);

    // Add/update execution history section
    content = this.updateExecutionHistorySection(content, tracking);

    await fs.writeFile(planPath, content, 'utf-8');
    return true;
  }

  /**
   * Record commit information for a completed phase
   */
  async recordPhaseCommit(
    planSlug: string,
    phaseId: string,
    commitInfo: {
      hash: string;
      shortHash: string;
      committedBy?: string;
    }
  ): Promise<boolean> {
    const trackingFile = path.join(this.workflowPath, 'plan-tracking', `${planSlug}.json`);
    const now = new Date().toISOString();

    // Load existing tracking
    let tracking = await this.loadPlanTracking(planSlug);
    if (!tracking) {
      return false;
    }

    // Ensure phase exists in tracking
    if (!tracking.phases[phaseId]) {
      return false;
    }

    // Record commit info
    tracking.phases[phaseId].commitHash = commitInfo.hash;
    tracking.phases[phaseId].commitShortHash = commitInfo.shortHash;
    tracking.phases[phaseId].committedAt = now;
    if (commitInfo.committedBy) {
      tracking.phases[phaseId].committedBy = commitInfo.committedBy;
    }

    tracking.lastUpdated = now;

    // Save tracking
    await fs.ensureDir(path.dirname(trackingFile));
    await fs.writeFile(trackingFile, JSON.stringify(tracking, null, 2), 'utf-8');

    // Sync to markdown
    await this.syncPlanMarkdown(planSlug);

    return true;
  }

  /**
   * Load plan tracking from JSON file
   */
  private async loadPlanTracking(planSlug: string): Promise<PlanExecutionTracking | null> {
    const trackingFile = path.join(this.workflowPath, 'plan-tracking', `${planSlug}.json`);

    if (!await fs.pathExists(trackingFile)) {
      return null;
    }

    try {
      const content = await fs.readFile(trackingFile, 'utf-8');
      const data = JSON.parse(content);

      // Migrate old format to new format if needed
      if (!data.phases || typeof data.phases !== 'object') {
        // Old format had phases as simple status objects
        const migratedPhases: Record<string, PlanPhaseTracking> = {};
        if (data.phases) {
          for (const [phaseId, phaseData] of Object.entries(data.phases as Record<string, { status: string; updatedAt?: string }>)) {
            migratedPhases[phaseId] = {
              phaseId,
              status: phaseData.status as StatusType,
              startedAt: phaseData.updatedAt,
              completedAt: phaseData.status === 'completed' ? phaseData.updatedAt : undefined,
              steps: [],
            };
          }
        }
        return {
          planSlug,
          progress: data.progress || 0,
          phases: migratedPhases,
          decisions: data.decisions || [],
          lastUpdated: data.lastUpdated || new Date().toISOString(),
        };
      }

      return data as PlanExecutionTracking;
    } catch {
      return null;
    }
  }

  /**
   * Calculate progress based on completed steps across all phases
   */
  private calculateStepProgress(tracking: PlanExecutionTracking): number {
    let totalSteps = 0;
    let completedSteps = 0;

    for (const phase of Object.values(tracking.phases)) {
      totalSteps += phase.steps.length;
      completedSteps += phase.steps.filter(s => s.status === 'completed').length;
    }

    return totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  }

  /**
   * Update frontmatter with progress percentage
   */
  private updateFrontmatterProgress(content: string, tracking: PlanExecutionTracking): string {
    // Check if frontmatter exists
    if (!content.startsWith('---')) {
      return content;
    }

    const endIndex = content.indexOf('---', 3);
    if (endIndex === -1) {
      return content;
    }

    let frontmatter = content.slice(0, endIndex);
    const body = content.slice(endIndex);

    // Update or add progress field
    if (frontmatter.includes('progress:')) {
      frontmatter = frontmatter.replace(/progress:\s*\d+/, `progress: ${tracking.progress}`);
    } else {
      // Add progress after status line or at end of frontmatter
      if (frontmatter.includes('status:')) {
        frontmatter = frontmatter.replace(/(status:\s*\w+)/, `$1\nprogress: ${tracking.progress}`);
      } else {
        frontmatter = frontmatter.trimEnd() + `\nprogress: ${tracking.progress}\n`;
      }
    }

    // Update or add lastUpdated field
    if (frontmatter.includes('lastUpdated:')) {
      frontmatter = frontmatter.replace(/lastUpdated:\s*"[^"]*"/, `lastUpdated: "${tracking.lastUpdated}"`);
    } else {
      frontmatter = frontmatter.trimEnd() + `\nlastUpdated: "${tracking.lastUpdated}"\n`;
    }

    return frontmatter + body;
  }

  /**
   * Update step checkboxes in markdown body
   */
  private updateStepCheckboxes(content: string, tracking: PlanExecutionTracking): string {
    // Match numbered steps with optional existing checkboxes
    // Patterns like: "1. **Step text**" or "1. [ ] **Step text**" or "1. [x] **Step text**"
    const stepPattern = /^(\d+)\.\s*(?:\[[ x]\]\s*)?(.+?)(?:\s*\*\([^)]*\)\*)?$/gm;

    // Track which phase we're currently in by finding phase headers
    let currentPhaseId: string | null = null;

    // Split content into lines for processing
    const lines = content.split('\n');
    const updatedLines: string[] = [];

    for (const line of lines) {
      // Check for phase header
      const phaseMatch = line.match(/^###\s+Phase\s+(\d+)/);
      if (phaseMatch) {
        currentPhaseId = `phase-${phaseMatch[1]}`;
        updatedLines.push(line);
        continue;
      }

      // Check for numbered step
      const stepMatch = line.match(/^(\d+)\.\s*(?:\[[ x]\]\s*)?(.+?)(?:\s*\*\([^)]*\)\*)?$/);
      if (stepMatch && currentPhaseId) {
        const stepNum = parseInt(stepMatch[1], 10);
        const stepText = stepMatch[2].trim();

        // Find step in tracking
        const phaseTracking = tracking.phases[currentPhaseId];
        const stepTracking = phaseTracking?.steps.find(s => s.stepIndex === stepNum);

        if (stepTracking) {
          const checkMark = stepTracking.status === 'completed' ? '[x]' : '[ ]';
          let timestamp = '';
          if (stepTracking.completedAt) {
            timestamp = ` *(completed: ${stepTracking.completedAt})*`;
          } else if (stepTracking.startedAt && stepTracking.status === 'in_progress') {
            timestamp = ` *(in progress since: ${stepTracking.startedAt})*`;
          }
          updatedLines.push(`${stepNum}. ${checkMark} ${stepText}${timestamp}`);
          continue;
        }
      }

      updatedLines.push(line);
    }

    return updatedLines.join('\n');
  }

  /**
   * Add or update execution history section in markdown
   */
  private updateExecutionHistorySection(content: string, tracking: PlanExecutionTracking): string {
    const historySection = this.generateExecutionHistoryMarkdown(tracking);

    // Check if section exists
    const historyMarker = '## Execution History';
    const existingIndex = content.indexOf(historyMarker);

    if (existingIndex > -1) {
      // Find the end of the section (next ## header or end of file)
      const afterHistory = content.slice(existingIndex);
      const nextSectionMatch = afterHistory.match(/\n## [^E]/);
      if (nextSectionMatch && nextSectionMatch.index) {
        const endIndex = existingIndex + nextSectionMatch.index;
        content = content.slice(0, existingIndex) + historySection + content.slice(endIndex);
      } else {
        // History is the last section
        content = content.slice(0, existingIndex) + historySection;
      }
    } else {
      // Add before "## Evidence" or "## Rollback" or at end
      const insertPoints = ['## Evidence', '## Rollback'];
      let insertIndex = -1;

      for (const marker of insertPoints) {
        const idx = content.indexOf(marker);
        if (idx > -1) {
          insertIndex = idx;
          break;
        }
      }

      if (insertIndex > -1) {
        content = content.slice(0, insertIndex) + historySection + '\n\n' + content.slice(insertIndex);
      } else {
        content = content.trimEnd() + '\n\n' + historySection;
      }
    }

    return content;
  }

  /**
   * Generate execution history markdown section
   */
  private generateExecutionHistoryMarkdown(tracking: PlanExecutionTracking): string {
    const lines = [
      '## Execution History',
      '',
      `> Last updated: ${tracking.lastUpdated} | Progress: ${tracking.progress}%`,
      '',
    ];

    // Sort phases by ID
    const sortedPhases = Object.entries(tracking.phases).sort(([a], [b]) => a.localeCompare(b));

    for (const [phaseId, phase] of sortedPhases) {
      const statusIcon = phase.status === 'completed' ? '[DONE]' :
                         phase.status === 'in_progress' ? '[IN PROGRESS]' :
                         phase.status === 'skipped' ? '[SKIPPED]' :
                         '[PENDING]';

      lines.push(`### ${phaseId} ${statusIcon}`);

      if (phase.startedAt) {
        lines.push(`- Started: ${phase.startedAt}`);
      }
      if (phase.completedAt) {
        lines.push(`- Completed: ${phase.completedAt}`);
      }

      if (phase.steps.length > 0) {
        lines.push('');
        const sortedSteps = [...phase.steps].sort((a, b) => a.stepIndex - b.stepIndex);
        for (const step of sortedSteps) {
          const check = step.status === 'completed' ? 'x' : ' ';
          let line = `- [${check}] Step ${step.stepIndex}: ${step.description}`;

          if (step.completedAt) {
            line += ` *(${step.completedAt})*`;
          } else if (step.startedAt && step.status === 'in_progress') {
            line += ` *(in progress)*`;
          }

          lines.push(line);

          if (step.output) {
            lines.push(`  - Output: ${step.output}`);
          }
          if (step.notes) {
            lines.push(`  - Notes: ${step.notes}`);
          }
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Parse plan markdown file to extract info
   */
  private parsePlanFile(content: string, slug: string): { title: string; summary?: string } {
    const titleMatch = content.match(/^#\s+(.+?)(?:\s+Plan)?$/m);
    const summaryMatch = content.match(/^>\s*(.+)$/m);

    return {
      title: titleMatch?.[1] || slug,
      summary: summaryMatch?.[1],
    };
  }

  /**
   * Parse frontmatter from plan content
   */
  private parseLegacyPlanFrontMatter(content: string): {
    agents: Array<{ type: string; role?: string }>;
    docs: string[];
    phases: Array<{ id: string; name: string; prevc: string }>;
  } | null {
    // Check if content starts with frontmatter
    if (!content.startsWith('---')) {
      return null;
    }

    const endIndex = content.indexOf('---', 3);
    if (endIndex === -1) {
      return null;
    }

    const frontMatterContent = content.slice(3, endIndex).trim();
    const result: {
      agents: Array<{ type: string; role?: string }>;
      docs: string[];
      phases: Array<{ id: string; name: string; prevc: string }>;
    } = {
      agents: [],
      docs: [],
      phases: [],
    };

    // Parse agents section
    const agentsMatch = frontMatterContent.match(/agents:\s*\n((?:\s+-[^\n]+\n?)+)/);
    if (agentsMatch) {
      const agentLines = agentsMatch[1].split('\n').filter(l => l.trim());
      let currentAgent: { type: string; role?: string } | null = null;

      for (const line of agentLines) {
        const typeMatch = line.match(/type:\s*"([^"]+)"/);
        const roleMatch = line.match(/role:\s*"([^"]+)"/);

        if (typeMatch) {
          if (currentAgent) {
            result.agents.push(currentAgent);
          }
          currentAgent = { type: typeMatch[1] };
        }
        if (roleMatch && currentAgent) {
          currentAgent.role = roleMatch[1];
        }
      }
      if (currentAgent) {
        result.agents.push(currentAgent);
      }
    }

    // Parse docs section
    const docsMatch = frontMatterContent.match(/docs:\s*\n((?:\s+-[^\n]+\n?)+)/);
    if (docsMatch) {
      const docLines = docsMatch[1].split('\n').filter(l => l.trim());
      for (const line of docLines) {
        const docMatch = line.match(/-\s*"([^"]+)"/);
        if (docMatch) {
          result.docs.push(docMatch[1]);
        }
      }
    }

    // Parse phases section
    const phasesMatch = frontMatterContent.match(/phases:\s*\n((?:\s+-[^\n]+\n?)+)/);
    if (phasesMatch) {
      const phaseLines = phasesMatch[1].split('\n').filter(l => l.trim());
      let currentPhase: { id: string; name: string; prevc: string } | null = null;

      for (const line of phaseLines) {
        const idMatch = line.match(/id:\s*"([^"]+)"/);
        const nameMatch = line.match(/name:\s*"([^"]+)"/);
        const prevcMatch = line.match(/prevc:\s*"([^"]+)"/);

        if (idMatch) {
          if (currentPhase && currentPhase.id && currentPhase.name && currentPhase.prevc) {
            result.phases.push(currentPhase);
          }
          currentPhase = { id: idMatch[1], name: '', prevc: '' };
        }
        if (nameMatch && currentPhase) {
          currentPhase.name = nameMatch[1];
        }
        if (prevcMatch && currentPhase) {
          currentPhase.prevc = prevcMatch[1];
        }
      }
      if (currentPhase && currentPhase.id && currentPhase.name && currentPhase.prevc) {
        result.phases.push(currentPhase);
      }
    }

    return result;
  }

  /**
   * Parse plan file into LinkedPlan structure
   */
  private parsePlanToLinked(content: string, ref: PlanReference): LinkedPlan {
    const scaffoldFrontMatter = parseScaffoldFrontMatter(content).frontMatter;
    const hasCanonicalPlanFrontMatter = scaffoldFrontMatter?.type === 'plan' && !!scaffoldFrontMatter.planSlug;
    const legacyFrontMatter = hasCanonicalPlanFrontMatter ? null : this.parseLegacyPlanFrontMatter(content);

    const bodyPhases = this.extractPhasesFromBody(content);
    const phases = hasCanonicalPlanFrontMatter
      ? this.buildPhasesFromCanonicalFrontMatter(scaffoldFrontMatter!, bodyPhases)
      : legacyFrontMatter?.phases.length
        ? legacyFrontMatter.phases.map(p => ({
            id: p.id,
            name: p.name,
            prevcPhase: p.prevc as PrevcPhase,
            steps: bodyPhases.find(phase => phase.id === p.id)?.steps ?? [],
            deliverables: bodyPhases.find(phase => phase.id === p.id)?.deliverables,
            status: 'pending' as const,
          }))
        : bodyPhases;

    const agents = hasCanonicalPlanFrontMatter && scaffoldFrontMatter?.agents?.length
      ? scaffoldFrontMatter.agents.map(a => a.type)
      : legacyFrontMatter?.agents.length
        ? legacyFrontMatter.agents.map(a => a.type)
        : this.extractAgentsFromBody(content);

    const docs = hasCanonicalPlanFrontMatter && scaffoldFrontMatter?.docs?.length
      ? scaffoldFrontMatter.docs
      : legacyFrontMatter?.docs.length
        ? legacyFrontMatter.docs
        : this.extractDocsFromBody(content);

    const decisions = this.extractDecisions();

    const completedPhases = phases.filter(p => p.status === 'completed').length;
    const progress = phases.length > 0 ? Math.round((completedPhases / phases.length) * 100) : 0;

    const currentPhase = phases.find(p => p.status === 'in_progress')?.id;

    return {
      ref,
      phases,
      decisions,
      risks: [],
      agents,
      docs,
      progress,
      currentPhase,
      // Include full agent lineup with roles from frontmatter
      agentLineup: hasCanonicalPlanFrontMatter && scaffoldFrontMatter?.agents?.length
        ? scaffoldFrontMatter.agents.map(agent => ({
            type: agent.type,
            role: agent.role || undefined,
          }))
        : legacyFrontMatter?.agents.length
          ? legacyFrontMatter.agents
          : agents.map(a => ({ type: a })),
    };
  }

  /**
   * Extract phases from plan markdown body (fallback)
   */
  private extractPhasesFromBody(content: string): PlanPhase[] {
    const lines = content.split('\n');
    const phaseHeaders: Array<{ lineIndex: number; id: string; name: string; prevcPhase: PrevcPhase }> = [];

    lines.forEach((line, lineIndex) => {
      const phaseMatch = line.match(/^###\s+Phase\s+(\d+)\s*[—-]\s*(.+)$/);
      if (!phaseMatch) {
        return;
      }

      const phaseNum = phaseMatch[1];
      const phaseName = phaseMatch[2].trim();
      const phaseId = `phase-${phaseNum}`;
      phaseHeaders.push({
        lineIndex,
        id: phaseId,
        name: phaseName,
        prevcPhase: this.inferPrevcPhaseFromPhaseName(phaseName),
      });
    });

    if (phaseHeaders.length === 0) {
      return [
        { id: 'phase-1', name: 'Discovery & Alignment', prevcPhase: 'P', deliverables: [], steps: [], status: 'pending' },
        { id: 'phase-2', name: 'Implementation', prevcPhase: 'E', deliverables: [], steps: [], status: 'pending' },
        { id: 'phase-3', name: 'Validation & Handoff', prevcPhase: 'V', deliverables: [], steps: [], status: 'pending' }
      ];
    }

    return phaseHeaders.map((phaseHeader, index) => {
      const nextHeader = phaseHeaders[index + 1];
      const sectionLines = lines.slice(phaseHeader.lineIndex + 1, nextHeader?.lineIndex ?? lines.length);
      const steps = this.extractPlanStepsFromBodySection(sectionLines);
      const deliverables = this.uniqueStrings(
        steps.flatMap(step => [...(step.deliverables ?? []), ...(step.outputs ?? [])])
      );

      return {
        id: phaseHeader.id,
        name: phaseHeader.name,
        prevcPhase: phaseHeader.prevcPhase,
        deliverables: deliverables.length > 0 ? deliverables : undefined,
        steps,
        status: 'pending',
      };
    });
  }

  private buildPhasesFromCanonicalFrontMatter(
    frontMatter: NonNullable<ReturnType<typeof parseScaffoldFrontMatter>['frontMatter']>,
    bodyPhases: PlanPhase[]
  ): PlanPhase[] {
    const bodyPhaseMap = new Map(bodyPhases.map(phase => [phase.id, phase]));

    const phases = frontMatter.planPhases?.length
      ? frontMatter.planPhases.map((phase) => {
          const fallbackPhase = bodyPhaseMap.get(phase.id);
          const canonicalSteps = phase.steps ?? [];
          const hasCanonicalSteps = canonicalSteps.length > 0;
          const steps = hasCanonicalSteps
            ? canonicalSteps.map((step) => this.toPlanStep(step.order, step.description, step.assignee, step.deliverables))
            : fallbackPhase?.steps ?? [];
          const deliverables = this.uniqueStrings([
            ...(phase.deliverables ?? []),
            ...(hasCanonicalSteps ? [] : (fallbackPhase?.deliverables ?? [])),
            ...steps.flatMap(step => [...(step.deliverables ?? []), ...(step.outputs ?? [])]),
          ]);

          return {
            id: phase.id,
            name: phase.name,
            prevcPhase: phase.prevc as PrevcPhase,
            summary: phase.summary,
            deliverables: deliverables.length > 0 ? deliverables : undefined,
            steps,
            status: 'pending' as const,
          };
        })
      : bodyPhases;

    return phases.length > 0 ? phases : bodyPhases;
  }

  private toPlanStep(
    order: number,
    description: string,
    assignee?: string,
    deliverables?: string[]
  ): PlanStep {
    const normalizedDeliverables = this.uniqueStrings(deliverables ?? []);

    return {
      order,
      description,
      assignee,
      deliverables: normalizedDeliverables.length > 0 ? normalizedDeliverables : undefined,
      outputs: normalizedDeliverables.length > 0 ? normalizedDeliverables : undefined,
      status: 'pending',
    };
  }

  private extractPlanStepsFromBodySection(sectionLines: string[]): PlanStep[] {
    const tableSteps = this.extractPlanStepsFromTable(sectionLines);
    if (tableSteps.length > 0) {
      return tableSteps;
    }

    const numberedSteps = this.extractNumberedPlanSteps(sectionLines);
    if (numberedSteps.length > 0) {
      return numberedSteps;
    }

    return [];
  }

  private extractPlanStepsFromTable(sectionLines: string[]): PlanStep[] {
    const rows = sectionLines
      .map(line => this.parseMarkdownTableRow(line))
      .filter((row): row is string[] => row !== null);

    if (rows.length === 0) {
      return [];
    }

    let header: string[] | null = null;
    const steps: PlanStep[] = [];
    let nextOrder = 1;

    for (const row of rows) {
      if (this.isTableSeparatorRow(row)) {
        continue;
      }

      if (!header) {
        if (this.looksLikeTaskTableHeader(row)) {
          header = row;
        }
        continue;
      }

      const columnMap = this.buildColumnMap(header);
      const description = this.readTableColumn(row, columnMap, ['task', 'description', 'step']) ?? row[1] ?? row[0] ?? '';
      const assignee = this.stripMarkdownInline(this.readTableColumn(row, columnMap, ['agent', 'assignee', 'owner']));
      const deliverables = this.parseDeliverableCell(this.readTableColumn(row, columnMap, ['deliverable', 'deliverables', 'output', 'outputs']));

      steps.push(this.toPlanStep(nextOrder++, this.stripMarkdownInline(description), assignee || undefined, deliverables));
    }

    return steps;
  }

  private extractNumberedPlanSteps(sectionLines: string[]): PlanStep[] {
    const steps: PlanStep[] = [];
    let nextOrder = 1;

    for (const line of sectionLines) {
      const match = line.match(/^\s*(\d+)\.\s*(?:\[[ x]\]\s*)?(.+)$/);
      if (!match) {
        continue;
      }

      steps.push(this.toPlanStep(nextOrder++, this.stripMarkdownInline(match[2].trim())));
    }

    return steps;
  }

  private parseMarkdownTableRow(line: string): string[] | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      return null;
    }

    const cells = trimmed
      .slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split('|')
      .map(cell => cell.trim());

    if (cells.length === 0) {
      return null;
    }

    return cells;
  }

  private isTableSeparatorRow(row: string[]): boolean {
    return row.every(cell => /^:?-{3,}:?$/.test(cell));
  }

  private looksLikeTaskTableHeader(row: string[]): boolean {
    const lowered = row.map(cell => cell.toLowerCase());
    return lowered.some(cell => cell === '#' || cell.includes('task')) && lowered.some(cell => cell.includes('deliverable') || cell.includes('output'));
  }

  private buildColumnMap(header: string[]): Record<string, number> {
    const map: Record<string, number> = {};
    header.forEach((cell, index) => {
      const normalized = cell.toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (normalized) {
        map[normalized] = index;
      }
    });
    return map;
  }

  private readTableColumn(row: string[], columnMap: Record<string, number>, names: string[]): string | undefined {
    for (const name of names) {
      const index = columnMap[name.replace(/[^a-z0-9]+/g, '')];
      if (typeof index === 'number' && row[index] !== undefined) {
        return row[index];
      }
    }
    return undefined;
  }

  private parseDeliverableCell(value?: string): string[] | undefined {
    if (!value) {
      return undefined;
    }

    const normalized = this.stripMarkdownInline(value);
    const parts = normalized
      .split(/(?:<br\s*\/?>|\n|;)/i)
      .map(part => part.trim())
      .filter(Boolean);

    const unique = this.uniqueStrings(parts.length > 0 ? parts : [normalized]);
    return unique.length > 0 ? unique : undefined;
  }

  private stripMarkdownInline(value?: string): string {
    if (!value) {
      return '';
    }

    return value
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .trim();
  }

  private uniqueStrings(values: string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
  }

  private inferPrevcPhaseFromPhaseName(phaseName: string): PrevcPhase {
    const lowerName = phaseName.toLowerCase();

    for (const [keyword, phase] of Object.entries(PLAN_PHASE_TO_PREVC)) {
      if (lowerName.includes(keyword)) {
        return phase;
      }
    }

    return 'E';
  }

  /**
   * Extract decisions from plan content
   */
  private extractDecisions(): PlanDecision[] {
    // Decisions are typically recorded during execution, start empty
    return [];
  }

  /**
   * Extract agents from plan body (fallback)
   */
  private extractAgentsFromBody(content: string): string[] {
    const agents: string[] = [];

    // Match agent references in table rows
    const agentRegex = /\[([^\]]+)\]\(\.\.\/agents\/([^)]+)\.md\)/g;
    let match;

    while ((match = agentRegex.exec(content)) !== null) {
      const agentType = match[2];
      if (!agents.includes(agentType)) {
        agents.push(agentType);
      }
    }

    return agents;
  }

  /**
   * Extract documentation references from plan body (fallback)
   */
  private extractDocsFromBody(content: string): string[] {
    const docs: string[] = [];

    // Match doc references
    const docRegex = /\[([^\]]+)\]\(\.\.\/docs\/([^)]+)\)/g;
    let match;

    while ((match = docRegex.exec(content)) !== null) {
      const docPath = match[2];
      if (!docs.includes(docPath)) {
        docs.push(docPath);
      }
    }

    return docs;
  }

  /**
   * Add plan reference to workflow tracking
   */
  private async addPlanToWorkflow(ref: PlanReference): Promise<void> {
    const plansFile = path.join(this.workflowPath, 'plans.json');

    let plans: WorkflowPlans = { active: [], completed: [] };
    if (await fs.pathExists(plansFile)) {
      const content = await fs.readFile(plansFile, 'utf-8');
      try {
        plans = JSON.parse(content) || { active: [], completed: [] };
      } catch {
        plans = { active: [], completed: [] };
      }
    }

    // Preserve approval metadata if the plan was already linked in another workflow
    const existingRef = [...plans.active, ...plans.completed].find((p) => p.slug === ref.slug);
    const nextRef: PlanReference = existingRef
      ? {
          ...ref,
          approval_status: existingRef.approval_status,
          approved_at: existingRef.approved_at,
          approved_by: existingRef.approved_by,
        }
      : ref;

    // Remove if already exists
    plans.active = plans.active.filter(p => p.slug !== ref.slug);
    plans.completed = plans.completed.filter(p => p.slug !== ref.slug);

    // Add to active
    plans.active.push(nextRef);

    // Set as primary if first plan
    if (!plans.primary) {
      plans.primary = nextRef.slug;
    }

    await fs.ensureDir(this.workflowPath);
    await fs.writeFile(plansFile, JSON.stringify(plans, null, 2), 'utf-8');
  }

  /**
   * Clear all plans and tracking data
   * Used when deleting/resetting a workflow
   */
  async clearAllPlans(): Promise<void> {
    const plansFile = path.join(this.workflowPath, 'plans.json');
    const trackingDir = path.join(this.workflowPath, 'plan-tracking');

    // Remove plans.json
    if (await fs.pathExists(plansFile)) {
      await fs.remove(plansFile);
    }

    // Remove plan-tracking directory
    if (await fs.pathExists(trackingDir)) {
      await fs.remove(trackingDir);
    }
  }

  /**
   * Archive all plans and tracking data
   * Moves files to .context/workflow/archive/{timestamp}/
   */
  async archivePlans(): Promise<void> {
    const plansFile = path.join(this.workflowPath, 'plans.json');
    const trackingDir = path.join(this.workflowPath, 'plan-tracking');

    // Check if there's anything to archive
    const hasPlans = await fs.pathExists(plansFile);
    const hasTracking = await fs.pathExists(trackingDir);

    if (!hasPlans && !hasTracking) {
      return;
    }

    // Create archive directory with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveDir = path.join(this.workflowPath, 'archive', `plans-${timestamp}`);

    await fs.ensureDir(archiveDir);

    // Move plans.json to archive
    if (hasPlans) {
      await fs.move(plansFile, path.join(archiveDir, 'plans.json'));
    }

    // Move plan-tracking directory to archive
    if (hasTracking) {
      await fs.move(trackingDir, path.join(archiveDir, 'plan-tracking'));
    }
  }

  /**
   * Automatically create a git commit when a phase completes
   * @param planSlug Plan identifier
   * @param phaseId Phase identifier
   * @returns true if commit was created, false if skipped or failed
   */
  private async autoCommitPhase(planSlug: string, phaseId: string): Promise<boolean> {
    try {
      // Load plan to get phase details
      const plan = await this.getLinkedPlan(planSlug);
      if (!plan) {
        console.warn(`[AutoCommit] Plan not found: ${planSlug}`);
        return false;
      }

      const phase = plan.phases.find(p => p.id === phaseId);
      if (!phase) {
        console.warn(`[AutoCommit] Phase not found: ${phaseId} in plan ${planSlug}`);
        return false;
      }

      // Initialize git service
      const gitService = new GitService(this.repoPath);

      // Check if this is a git repository
      if (!gitService.isGitRepository()) {
        console.warn('[AutoCommit] Not a git repository - skipping auto-commit');
        return false;
      }

      // Default commit message from phase's commitCheckpoint or generate one
      const commitMessage = phase.commitCheckpoint ||
        `chore(plan): complete ${phase.name} for ${planSlug}`;

      // Stage .context/** files (plan tracking and markdown updates)
      const stagePatterns = ['.context/**'];

      try {
        const stagedFiles = gitService.stageFiles(stagePatterns);

        if (stagedFiles.length === 0) {
          console.info('[AutoCommit] No files to commit - skipping');
          return false;
        }

        // Create the commit with AI Context Agent as co-author
        const coAuthor = 'AI Context Agent';
        const commitResult = gitService.commit(commitMessage, coAuthor);

        // Record the commit in plan tracking
        await this.recordPhaseCommit(planSlug, phaseId, {
          hash: commitResult.hash,
          shortHash: commitResult.shortHash,
          committedBy: coAuthor,
        });

        console.info(`[AutoCommit] Created commit ${commitResult.shortHash} for phase ${phaseId}`);
        return true;
      } catch (error) {
        // Non-critical failure - log but don't throw
        console.warn(`[AutoCommit] Failed to create commit for phase ${phaseId}:`, error);
        return false;
      }
    } catch (error) {
      // Catch-all to prevent breaking the main updatePlanStep flow
      console.error('[AutoCommit] Unexpected error in autoCommitPhase:', error);
      return false;
    }
  }
}

// Export singleton factory
export function createPlanLinker(repoPath: string, statusManager?: PrevcStatusManager, autoCommitOnPhaseComplete: boolean = true): PlanLinker {
  return new PlanLinker(repoPath, statusManager, autoCommitOnPhaseComplete);
}
