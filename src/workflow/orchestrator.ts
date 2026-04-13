/**
 * PREVC Workflow Orchestrator
 *
 * Manages workflow progression, phase transitions, and role handoffs.
 */

import * as path from 'path';
import {
  PrevcStatus,
  PrevcPhase,
  PrevcRole,
  ProjectContext,
  ProjectScale,
  WorkflowSettings,
  PlanApproval,
  PhaseOrchestration,
} from './types';
import { PrevcStatusManager } from './status/statusManager';
import { detectProjectScale, getScaleRoute } from './scaling';
import { PREVC_PHASE_ORDER, getPhaseDefinition } from './phases';
import { WorkflowGateChecker, GateCheckResult, getDefaultSettings, ExecutionEvidence } from './gates';
import { PlanLinker } from './plans/planLinker';
import { assertPhaseStatusConverges } from './plans/invariants';
import { WorkflowGuidanceService } from './orchestration/workflowGuidanceService';
import { buildNextAgentSuggestion } from './guidance';
import type { WorkflowStatePort } from './status/workflowStatePort';
import { WorkflowSyncError } from './errors';

/**
 * Options for completing a phase
 */
export interface CompletePhaseOptions {
  /** Force advancement even if gates would block */
  force?: boolean;
  /** Execution evidence from the active task contract, consumed by the execution_evidence gate */
  executionEvidence?: ExecutionEvidence;
}

/**
 * Options for initializing a workflow with settings
 */
export interface InitWorkflowOptions {
  name: string;
  scale: ProjectScale;
  /** Override default settings */
  settings?: Partial<WorkflowSettings>;
}

/**
 * PREVC Workflow Orchestrator
 *
 * Coordinates the execution of the PREVC workflow.
 */
export class PrevcOrchestrator {
  private repoPath: string;
  private contextPath: string;
  private statusManager: PrevcStatusManager;
  private gateChecker: WorkflowGateChecker;
  private planLinker: PlanLinker;
  private guidanceService: WorkflowGuidanceService;

  constructor(contextPath: string, workflowState: WorkflowStatePort) {
    this.repoPath = path.dirname(contextPath);
    this.contextPath = contextPath;
    this.statusManager = new PrevcStatusManager(contextPath, workflowState);
    this.gateChecker = new WorkflowGateChecker();
    // Pass statusManager to PlanLinker for breadcrumb trail logging
    this.planLinker = new PlanLinker(path.dirname(contextPath), this.statusManager);
    this.guidanceService = new WorkflowGuidanceService(this.repoPath);
  }

  /**
   * Check if a workflow exists
   */
  async hasWorkflow(): Promise<boolean> {
    return this.statusManager.exists();
  }

  /**
   * Initialize a new workflow
   */
  async initWorkflow(context: ProjectContext): Promise<PrevcStatus> {
    const scale = detectProjectScale(context);
    const route = getScaleRoute(scale);

    const status = await this.statusManager.create({
      name: context.name,
      scale,
      phases: route.phases,
      roles: route.roles,
    });

    await this.planLinker.ensureWorkflowPlanIndex();

    return status;
  }

  /**
   * Initialize a workflow with explicit scale
   * @param archivePrevious - If undefined and workflow exists, throws error. If true, archives. If false, deletes.
   */
  async initWorkflowWithScale(
    name: string,
    scale: ProjectScale,
    settings?: Partial<WorkflowSettings>,
    archivePrevious?: boolean
  ): Promise<PrevcStatus> {
    // Check for existing workflow
    if (await this.hasWorkflow()) {
      if (archivePrevious === undefined) {
        throw new Error(
          'A workflow already exists. Use archivePrevious=true to archive or archivePrevious=false to delete the existing workflow.'
        );
      }
      await this.resetWorkflow(archivePrevious);
    }

    const route = getScaleRoute(scale);

    const status = await this.statusManager.create({
      name,
      scale,
      phases: route.phases,
      roles: route.roles,
    });

    await this.planLinker.ensureWorkflowPlanIndex();

    // Apply custom settings if provided
    if (settings) {
      await this.statusManager.setSettings(settings);
      return this.statusManager.load();
    }

    return status;
  }

  /**
   * Reset the current workflow
   * @param archive - If true, archives the current workflow. If false, deletes it.
   */
  async resetWorkflow(archive: boolean): Promise<void> {
    if (archive) {
      await this.archiveCurrentWorkflow();
      await this.planLinker.archivePlans();
    } else {
      await this.planLinker.clearAllPlans();
      await this.statusManager.remove();
    }
  }

  /**
   * Archive the current workflow to .context/workflow/archive/
   */
  private async archiveCurrentWorkflow(): Promise<void> {
    if (!(await this.statusManager.exists())) {
      return;
    }

    // Get current workflow name for archive folder
    let archiveName = 'workflow';
    try {
      const status = await this.statusManager.load();
      archiveName = status.project.name.replace(/[^a-zA-Z0-9-_]/g, '-');
    } catch {
      // Use default name if can't load status
    }
    await this.statusManager.archive(archiveName);
  }

  /**
   * Initialize a workflow with full options
   */
  async initWorkflowWithOptions(options: InitWorkflowOptions): Promise<PrevcStatus> {
    return this.initWorkflowWithScale(options.name, options.scale, options.settings);
  }

  /**
   * Get the current workflow status
   */
  async getStatus(): Promise<PrevcStatus> {
    return this.statusManager.load();
  }

  /**
   * Get the current phase
   */
  async getCurrentPhase(): Promise<PrevcPhase> {
    return this.statusManager.getCurrentPhase();
  }

  /**
   * Get the current active role
   */
  async getCurrentRole(): Promise<PrevcRole | null> {
    return this.statusManager.getActiveRole();
  }

  /**
   * Get the phase definition for the current phase
   */
  async getCurrentPhaseDefinition() {
    const phase = await this.getCurrentPhase();
    return getPhaseDefinition(phase);
  }

  /**
   * Perform a handoff from one agent to another
   * @param from - Agent name handing off (e.g., 'feature-developer')
   * @param to - Agent name receiving (e.g., 'test-writer')
   * @param artifacts - Array of output file paths
   */
  async handoff(
    from: string,
    to: string,
    artifacts: string[]
  ): Promise<void> {
    // Update the outgoing agent
    await this.statusManager.updateAgent(from, {
      status: 'completed',
      outputs: artifacts,
    });

    // Update the incoming agent
    await this.statusManager.updateAgent(to, {
      status: 'in_progress',
    });
  }

  /**
   * Get the next agent suggestion after a handoff
   */
  getNextAgentSuggestion(currentAgent: string): { agent: string; reason: string } | null {
    return buildNextAgentSuggestion(currentAgent);
  }

  /**
   * Get orchestration guidance for a phase
   */
  async getPhaseOrchestration(phase: PrevcPhase): Promise<PhaseOrchestration> {
    return this.guidanceService.getPhaseOrchestration(phase);
  }

  /**
   * Complete the current phase and advance to the next
   */
  async completePhase(
    outputs?: string[],
    options: CompletePhaseOptions = {}
  ): Promise<PrevcPhase | null> {
    const status = await this.getStatus();
    const currentPhase = status.project.current_phase;
    const nextPhase = await this.getNextPhase();

    // Check gates before advancing (unless force is true)
    if (nextPhase) {
      this.gateChecker.enforceGates(status, {
        force: options.force,
        nextPhase,
        executionEvidence: options.executionEvidence,
      });
    }

    const advancedPhase = await this.statusManager.completePhaseTransition(outputs);

    // Auto-sync linked plan markdown with execution progress.
    // Previously this was a silent-fail catch — divergence between tracking
    // JSON, status YAML, and plan markdown then stayed invisible. Now we log
    // and propagate so callers can decide whether to retry or roll back.
    if (status.project.plan) {
      try {
        await this.planLinker.syncPlanMarkdown(status.project.plan);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(
          `[workflow] syncPlanMarkdown failed for plan "${status.project.plan}" ` +
            `after ${currentPhase} -> ${advancedPhase ?? 'end'}: ${err.message}`
        );
        throw new WorkflowSyncError(status.project.plan, err);
      }

      // Cross-source invariant: tracking JSON and status YAML must agree on
      // per-phase status for any phase id present in both. Reload status
      // because completePhaseTransition mutated it after the initial read.
      const tracking = await this.planLinker.getPlanExecutionStatus(status.project.plan);
      const postStatus = await this.statusManager.load();
      assertPhaseStatusConverges(tracking, postStatus);
    }

    return advancedPhase;
  }

  /**
   * Check gates for the current phase transition
   */
  async checkGates(): Promise<GateCheckResult> {
    const status = await this.getStatus();
    return this.gateChecker.checkGates(status);
  }

  /**
   * Set workflow settings
   */
  async setSettings(settings: Partial<WorkflowSettings>): Promise<WorkflowSettings> {
    return this.statusManager.setSettings(settings);
  }

  /**
   * Get workflow settings
   */
  async getSettings(): Promise<WorkflowSettings> {
    return this.statusManager.getSettings();
  }

  /**
   * Mark that a plan has been created/linked
   */
  async markPlanCreated(planSlug: string): Promise<void> {
    return this.statusManager.markPlanCreated(planSlug);
  }

  /**
   * Approve the plan
   */
  async approvePlan(approver: PrevcRole | string, notes?: string): Promise<PlanApproval> {
    return this.statusManager.approvePlan(approver, notes);
  }

  /**
   * Get approval status
   */
  async getApproval(): Promise<PlanApproval | undefined> {
    return this.statusManager.getApproval();
  }

  /**
   * Advance to the next phase
   */
  async advanceToNextPhase(): Promise<PrevcPhase | null> {
    const nextPhase = await this.getNextPhase();
    if (nextPhase) {
      await this.statusManager.transitionToPhase(nextPhase);
    }
    return nextPhase;
  }

  /**
   * Get the next phase that should be executed
   */
  async getNextPhase(): Promise<PrevcPhase | null> {
    return this.statusManager.getNextPhase();
  }

  /**
   * Check if the workflow is complete
   */
  async isComplete(): Promise<boolean> {
    return this.statusManager.isComplete();
  }

  /**
   * Get recommended next actions for the current state
   */
  async getRecommendedActions(): Promise<string[]> {
    const status = await this.getStatus();
    return this.guidanceService.getRecommendedActions(status);
  }

  /**
   * Get a summary of the current workflow state
   */
  async getSummary(): Promise<WorkflowSummary> {
    const status = await this.getStatus();
    const isComplete = await this.isComplete();

    // Count completed phases
    let completedPhases = 0;
    let totalPhases = 0;

    for (const phase of PREVC_PHASE_ORDER) {
      if (status.phases[phase].status !== 'skipped') {
        totalPhases++;
        if (status.phases[phase].status === 'completed') {
          completedPhases++;
        }
      }
    }

    return {
      name: status.project.name,
      scale: status.project.scale,
      currentPhase: status.project.current_phase,
      progress: {
        completed: completedPhases,
        total: totalPhases,
        percentage: Math.round((completedPhases / totalPhases) * 100),
      },
      isComplete,
      startedAt: status.project.started,
    };
  }

  /**
   * Update the current task description
   */
  async updateCurrentTask(task: string): Promise<void> {
    const currentPhase = await this.getCurrentPhase();
    const activeRole = await this.getCurrentRole();

    await this.statusManager.updatePhase(currentPhase, {
      current_task: task,
      role: activeRole || undefined,
    });
  }

  /**
   * Start a specific role in the current phase
   */
  async startRole(role: PrevcRole): Promise<void> {
    const currentPhase = await this.getCurrentPhase();

    await this.statusManager.updateRole(role, {
      status: 'in_progress',
      phase: currentPhase,
    });

    await this.statusManager.updatePhase(currentPhase, {
      role,
    });
  }

  /**
   * Complete a role's work in the current phase
   */
  async completeRole(role: PrevcRole, outputs: string[]): Promise<void> {
    await this.statusManager.updateRole(role, {
      status: 'completed',
      outputs,
      last_active: new Date().toISOString(),
    });
  }
}

/**
 * Workflow summary for display
 */
export interface WorkflowSummary {
  name: string;
  scale: ProjectScale | keyof typeof ProjectScale;
  currentPhase: PrevcPhase;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  isComplete: boolean;
  startedAt: string;
}
