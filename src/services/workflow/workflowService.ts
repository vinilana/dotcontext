/**
 * PREVC Workflow Service
 *
 * High-level service for managing PREVC workflows via CLI and MCP.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { CollaborationSession, CollaborationManager } from '../../workflow/collaboration';
import { GateCheckResult } from '../../workflow/gates';
import { getPhaseDefinition, PHASE_NAMES_PT } from '../../workflow/phases';
import { createPlanLinker, type LinkedPlan, type PlanPhase, type PlanStep } from '../../workflow/plans';
import { ROLE_DISPLAY_NAMES } from '../../workflow/roles';
import { getScaleName, getScaleFromName } from '../../workflow/scaling';
import { PrevcOrchestrator, type WorkflowSummary } from '../../workflow/orchestrator';
import {
  PrevcStatus,
  PrevcPhase,
  PrevcRole,
  ProjectScale,
  ProjectContext,
  WorkflowSettings,
  PlanApproval,
  PhaseOrchestration,
} from '../../workflow/types';
import type { CollaborationSynthesis } from '../../workflow/types';
import {
  FileCollaborationStore,
} from './fileCollaborationStore';
import {
  HarnessRuntimeStateService,
  HarnessSensorCatalogService,
  HarnessSensorsService,
  HarnessTaskContractsService,
  HarnessPolicyService,
  HarnessWorkflowStateService,
  type HarnessArtifactKind,
  type HarnessTaskContract,
  type HarnessHandoffContract,
  type HarnessSensorRun,
  type HarnessSessionRecord,
  type HarnessSensorDefinition,
  type WorkflowHarnessBinding,
} from '../harness';

const exec = promisify(execCallback);

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(
    values
      .map((value) => typeof value === 'string' ? value.trim() : '')
      .filter((value) => value.length > 0)
  ));
}

export interface WorkflowHarnessStatus {
  binding: WorkflowHarnessBinding;
  session: HarnessSessionRecord;
  availableSensors: Array<Pick<HarnessSensorDefinition, 'id' | 'name' | 'description'>>;
  sensorRuns: HarnessSensorRun[];
  taskContracts: HarnessTaskContract[];
  handoffs: HarnessHandoffContract[];
  policyRules: number;
  completionCheck: {
    blocked: boolean;
    reasons: string[];
    taskCompletion: {
      canComplete: boolean;
      missingSensors: string[];
      missingArtifacts: string[];
      blockingFindings: string[];
    } | null;
  };
}

export class HarnessWorkflowBlockedError extends Error {
  constructor(
    message: string,
    public readonly reasons: string[],
    public readonly harnessStatus: WorkflowHarnessStatus
  ) {
    super(message);
    this.name = 'HarnessWorkflowBlockedError';
  }
}

interface DerivedTaskContractInput {
  title: string;
  description?: string;
  owner?: string;
  inputs: string[];
  expectedOutputs: string[];
  acceptanceCriteria: string[];
  requiredSensors: string[];
  requiredArtifacts: string[];
  metadata: Record<string, unknown>;
}

interface WorkflowPlanLinkResult {
  workflowActive: boolean;
  planCreatedForGates: boolean;
  taskContract: HarnessTaskContract | null;
}

/**
 * Workflow service dependencies
 * Uses loose typing to be compatible with CLI and MCP contexts
 */
export interface WorkflowServiceDependencies {
  ui?: {
    displaySuccess: (message: string) => void;
    displayError: (message: string, error?: Error) => void;
    displayInfo: (message: string, detail?: string) => void;
  };
  t?: (key: string, params?: Record<string, unknown>) => string;
}

/**
 * Options for initializing a workflow
 */
export interface WorkflowInitOptions {
  name: string;
  description?: string;
  scale?: string | ProjectScale;
  files?: string[];
  /** Enable autonomous mode (bypasses all gates) */
  autonomous?: boolean;
  /** Require a linked plan before advancing P → R */
  requirePlan?: boolean;
  /** Require plan approval before advancing R → E */
  requireApproval?: boolean;
  /** How to handle existing workflow: true = archive, false = delete, undefined = error if exists */
  archivePrevious?: boolean;
}

/**
 * PREVC Workflow Service
 */
export class WorkflowService {
  private readonly repoPath: string;
  private contextPath: string;
  private orchestrator: PrevcOrchestrator;
  private collaborationManager: CollaborationManager;
  private runtimeStateService: HarnessRuntimeStateService;
  private sensorCatalogService: HarnessSensorCatalogService;
  private sensorsService: HarnessSensorsService;
  private taskContractsService: HarnessTaskContractsService;
  private policyService: HarnessPolicyService;
  private workflowStateService: HarnessWorkflowStateService;
  private deps: WorkflowServiceDependencies;

  constructor(
    repoPath: string,
    deps: WorkflowServiceDependencies = {}
  ) {
    const resolvedPath = path.resolve(repoPath);
    this.repoPath = path.basename(resolvedPath) === '.context'
      ? path.dirname(resolvedPath)
      : resolvedPath;
    this.contextPath = path.basename(resolvedPath) === '.context'
      ? resolvedPath
      : path.join(resolvedPath, '.context');
    this.runtimeStateService = new HarnessRuntimeStateService({ repoPath: this.repoPath });
    this.sensorCatalogService = new HarnessSensorCatalogService({
      repoPath: this.repoPath,
      contextPath: this.contextPath,
    });
    this.sensorsService = new HarnessSensorsService({ stateService: this.runtimeStateService });
    this.taskContractsService = new HarnessTaskContractsService({
      repoPath: this.repoPath,
      stateService: this.runtimeStateService,
    });
    this.policyService = new HarnessPolicyService({ repoPath: this.repoPath });
    this.workflowStateService = new HarnessWorkflowStateService({ contextPath: this.contextPath });
    this.orchestrator = new PrevcOrchestrator(this.contextPath, this.workflowStateService);
    this.collaborationManager = new CollaborationManager(
      new FileCollaborationStore(this.contextPath)
    );
    this.deps = deps;
    this.registerDefaultSensors();
  }

  /**
   * Create a WorkflowService with the given repository path
   */
  static async create(
    repoPath: string = process.cwd(),
    deps: WorkflowServiceDependencies = {}
  ): Promise<WorkflowService> {
    return new WorkflowService(repoPath, deps);
  }

  /**
   * Check if a workflow exists
   */
  async hasWorkflow(): Promise<boolean> {
    return this.orchestrator.hasWorkflow();
  }

  /**
   * Initialize a new workflow
   */
  async init(options: WorkflowInitOptions): Promise<PrevcStatus> {
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'init',
      risk: options.archivePrevious ? 'high' : 'medium',
      metadata: {
        name: options.name,
        scale: options.scale,
      },
    });

    // Ensure .context directory exists
    await fs.ensureDir(this.contextPath);
    await fs.ensureDir(path.join(this.contextPath, 'workflow'));

    // Determine scale
    let scale: ProjectScale;
    if (typeof options.scale === 'string') {
      scale = getScaleFromName(options.scale) ?? ProjectScale.MEDIUM;
    } else if (typeof options.scale === 'number') {
      scale = options.scale;
    } else {
      // Auto-detect based on context
      const context: ProjectContext = {
        name: options.name,
        description: options.description || options.name,
        files: options.files,
      };
      const { detectProjectScale } = await import('../../workflow');
      scale = detectProjectScale(context);
    }

    // Build settings overrides
    const settings: Partial<WorkflowSettings> | undefined =
      options.autonomous !== undefined ||
      options.requirePlan !== undefined ||
      options.requireApproval !== undefined
        ? {
            autonomous_mode: options.autonomous,
            require_plan: options.requirePlan,
            require_approval: options.requireApproval,
          }
        : undefined;

    // Initialize workflow
    const status = await this.orchestrator.initWorkflowWithScale(
      options.name,
      scale,
      settings,
      options.archivePrevious
    );

    await this.ensureHarnessSession(options.name, options.description);

    this.deps.ui?.displaySuccess(
      `Workflow PREVC initialized: ${options.name} (Scale: ${getScaleName(scale)})`
    );

    return status;
  }

  /**
   * Get current workflow status
   */
  async getStatus(): Promise<PrevcStatus> {
    return this.orchestrator.getStatus();
  }

  /**
   * Get workflow summary for display
   */
  async getSummary(): Promise<WorkflowSummary> {
    return this.orchestrator.getSummary();
  }

  /**
   * Get formatted status for CLI display
   */
  async getFormattedStatus(): Promise<string> {
    const summary = await this.getSummary();
    const status = await this.getStatus();
    const harness = await this.getHarnessStatus();

    const lines: string[] = [];

    lines.push(`📋 Workflow: ${summary.name}`);
    lines.push(`📊 Scale: ${getScaleName(summary.scale as ProjectScale)}`);
    lines.push(`📍 Current Phase: ${PHASE_NAMES_PT[summary.currentPhase as PrevcPhase]} (${summary.currentPhase})`);
    lines.push(`📈 Progress: ${summary.progress.percentage}% (${summary.progress.completed}/${summary.progress.total} phases)`);
    lines.push('');
    lines.push('Phases:');

    for (const [phase, phaseStatus] of Object.entries(status.phases)) {
      const emoji = phaseStatus.status === 'completed' ? '✅' :
                    phaseStatus.status === 'in_progress' ? '🔄' :
                    phaseStatus.status === 'skipped' ? '⏭️' : '⏸️';
      const phaseName = PHASE_NAMES_PT[phase as PrevcPhase];
      lines.push(`  ${emoji} ${phase}: ${phaseName} - ${phaseStatus.status}`);
    }

    if (harness) {
      const activeTask = harness.binding.activeTaskId
        ? harness.taskContracts.find((task) => task.id === harness.binding.activeTaskId) || null
        : null;

      lines.push('');
      lines.push('Harness:');
      lines.push(`  🧵 Session: ${harness.session.name} (${harness.session.status})`);
      lines.push(`  📌 Tasks: ${harness.taskContracts.length}`);
      lines.push(`  🤝 Handoffs: ${harness.handoffs.length}`);
      lines.push(`  🧪 Sensors: ${harness.sensorRuns.length}`);

      if (activeTask) {
        lines.push(`  🎯 Active Task: ${activeTask.title} (${activeTask.status})`);
      } else if (harness.taskContracts.length > 0) {
        lines.push('  🎯 Active Task: none');
      }

      if (harness.completionCheck.blocked) {
        lines.push('  🚫 Completion checks blocked');
        for (const reason of harness.completionCheck.reasons) {
          lines.push(`    - ${reason}`);
        }
      }
    }

    if (summary.isComplete) {
      lines.push('');
      lines.push('✨ Workflow complete!');
    }

    return lines.join('\n');
  }

  /**
   * Advance to the next phase
   */
  async advance(outputs?: string[], options?: { force?: boolean }): Promise<PrevcPhase | null> {
    const currentPhase = await this.orchestrator.getCurrentPhase();
    if (!options?.force) {
      const approval = await this.getApproval();
      await this.policyService.authorize({
        tool: 'workflow',
        action: 'advance',
        risk: 'high',
        approval: approval?.plan_approved
          ? { approvedBy: approval.approved_by, note: approval.approval_notes }
          : undefined,
      });

      const harnessStatus = await this.getHarnessStatus();
      if (harnessStatus?.completionCheck.blocked) {
        throw new HarnessWorkflowBlockedError(
          'Harness completion checks blocked workflow advance.',
          harnessStatus.completionCheck.reasons,
          harnessStatus
        );
      }
    }

    const binding = await this.requireHarnessBinding();
    const activeTaskBeforeAdvance = binding.activeTaskId
      ? await this.taskContractsService.getTaskContract(binding.activeTaskId)
      : null;
    const plannedNextPhase = await this.orchestrator.getNextPhase();
    const nextContract = plannedNextPhase
      ? await this.createDerivedPlanTaskContract({
          phase: plannedNextPhase,
          sessionId: binding.sessionId,
        })
      : null;
    const nextPhase = await this.orchestrator.completePhase(outputs, options);

    if (nextPhase) {
      binding.activeTaskId = nextContract?.id;
      const session = await this.runtimeStateService.checkpointSession(binding.sessionId, {
        note: `Advanced workflow phase ${currentPhase} -> ${nextPhase}`,
        data: {
          from: currentPhase,
          to: nextPhase,
          outputs,
          nextTaskContractId: nextContract?.id,
        },
      });
      binding.updatedAt = session.updatedAt;
      await this.saveHarnessBinding(binding);

      if (activeTaskBeforeAdvance && !['completed', 'failed'].includes(activeTaskBeforeAdvance.status)) {
        await this.taskContractsService.updateTaskContract(activeTaskBeforeAdvance.id, {
          status: 'completed',
          metadata: {
            ...activeTaskBeforeAdvance.metadata,
            completionReason: `Workflow advanced from ${currentPhase} to ${nextPhase}`,
          },
        });
      }

      this.deps.ui?.displaySuccess(
        `Advanced from ${PHASE_NAMES_PT[currentPhase]} to ${PHASE_NAMES_PT[nextPhase]}`
      );
    } else {
      const session = await this.runtimeStateService.completeSession(binding.sessionId, 'Workflow completed');
      binding.activeTaskId = undefined;
      binding.updatedAt = session.updatedAt;
      await this.saveHarnessBinding(binding);

      if (activeTaskBeforeAdvance && !['completed', 'failed'].includes(activeTaskBeforeAdvance.status)) {
        await this.taskContractsService.updateTaskContract(activeTaskBeforeAdvance.id, {
          status: 'completed',
          metadata: {
            ...activeTaskBeforeAdvance.metadata,
            completionReason: 'Workflow completed',
          },
        });
      }

      this.deps.ui?.displaySuccess('Workflow completed!');
    }

    return nextPhase;
  }

  /**
   * Check workflow gates for the current phase transition
   */
  async checkGates(): Promise<GateCheckResult> {
    return this.orchestrator.checkGates();
  }

  /**
   * Set workflow settings
   */
  async setSettings(settings: Partial<WorkflowSettings>): Promise<WorkflowSettings> {
    const isHighRisk =
      typeof settings.autonomous_mode === 'boolean' ||
      typeof settings.require_approval === 'boolean';
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'setSettings',
      risk: isHighRisk ? 'high' : 'medium',
      metadata: settings as Record<string, unknown>,
    });
    return this.orchestrator.setSettings(settings);
  }

  /**
   * Get workflow settings
   */
  async getSettings(): Promise<WorkflowSettings> {
    return this.orchestrator.getSettings();
  }

  listAvailableSensors(): Array<Pick<HarnessSensorDefinition, 'id' | 'name' | 'description'>> {
    return this.sensorsService.listSensors().map((sensor) => ({
      id: sensor.id,
      name: sensor.name,
      description: sensor.description,
    }));
  }

  /**
   * Enable or disable autonomous mode
   */
  async setAutonomousMode(enabled: boolean): Promise<WorkflowSettings> {
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'setAutonomousMode',
      risk: 'high',
      metadata: { enabled },
    });
    return this.orchestrator.setSettings({ autonomous_mode: enabled });
  }

  /**
   * Mark that a plan has been created/linked
   */
  async markPlanCreated(planSlug: string): Promise<void> {
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'markPlanCreated',
      risk: 'medium',
      metadata: { planSlug },
    });
    return this.orchestrator.markPlanCreated(planSlug);
  }

  async linkPlanToActiveWorkflow(planSlug: string): Promise<WorkflowPlanLinkResult> {
    const workflowActive = await this.hasWorkflow();
    if (!workflowActive) {
      return {
        workflowActive: false,
        planCreatedForGates: false,
        taskContract: null,
      };
    }

    const taskContract = await this.syncActivePlanTaskContract(planSlug);
    await this.markPlanCreated(planSlug);

    return {
      workflowActive: true,
      planCreatedForGates: true,
      taskContract,
    };
  }

  async syncActivePlanTaskContract(
    planSlug?: string,
    phase?: PrevcPhase
  ): Promise<HarnessTaskContract | null> {
    const binding = await this.requireHarnessBinding();
    const resolvedPhase = phase || await this.orchestrator.getCurrentPhase();
    const activeTask = binding.activeTaskId
      ? await this.taskContractsService.getTaskContract(binding.activeTaskId)
      : null;
    const contract = await this.upsertDerivedPlanTaskContract({
      planSlug,
      phase: resolvedPhase,
      sessionId: binding.sessionId,
      activeTask,
    });

    if (!contract) {
      return null;
    }

    binding.activeTaskId = contract.id;
    binding.updatedAt = contract.updatedAt;
    await this.saveHarnessBinding(binding);
    return contract;
  }

  private async upsertDerivedPlanTaskContract(params: {
    planSlug?: string;
    phase: PrevcPhase;
    sessionId: string;
    activeTask?: HarnessTaskContract | null;
  }): Promise<HarnessTaskContract | null> {
    const linkedPlan = await this.resolveLinkedPlan(params.planSlug);
    if (!linkedPlan) {
      return null;
    }

    const contractInput = this.buildDerivedTaskContract(linkedPlan, params.phase);
    if (this.isSameDerivedPlanTask(params.activeTask, linkedPlan.ref.slug, params.phase)) {
      return this.taskContractsService.updateTaskContract(params.activeTask.id, {
        title: contractInput.title,
        description: contractInput.description,
        owner: contractInput.owner,
        inputs: contractInput.inputs,
        expectedOutputs: contractInput.expectedOutputs,
        acceptanceCriteria: contractInput.acceptanceCriteria,
        requiredSensors: contractInput.requiredSensors,
        requiredArtifacts: contractInput.requiredArtifacts,
        status: params.activeTask.status === 'completed' || params.activeTask.status === 'failed'
          ? 'ready'
          : params.activeTask.status,
        metadata: contractInput.metadata,
      });
    }

    return this.taskContractsService.createTaskContract({
      ...contractInput,
      sessionId: params.sessionId,
      status: 'ready',
    });
  }

  private async createDerivedPlanTaskContract(params: {
    planSlug?: string;
    phase: PrevcPhase;
    sessionId: string;
  }): Promise<HarnessTaskContract | null> {
    const linkedPlan = await this.resolveLinkedPlan(params.planSlug);
    if (!linkedPlan) {
      return null;
    }

    const contractInput = this.buildDerivedTaskContract(linkedPlan, params.phase);
    return this.taskContractsService.createTaskContract({
      ...contractInput,
      sessionId: params.sessionId,
      status: 'ready',
    });
  }

  private isSameDerivedPlanTask(
    activeTask: HarnessTaskContract | null | undefined,
    planSlug: string,
    phase: PrevcPhase
  ): activeTask is HarnessTaskContract {
    return Boolean(
      activeTask &&
      activeTask.metadata?.source === 'workflow.plan' &&
      activeTask.metadata?.planSlug === planSlug &&
      activeTask.metadata?.prevcPhase === phase
    );
  }

  /**
   * Approve the plan
   */
  async approvePlan(approver: PrevcRole | string, notes?: string): Promise<PlanApproval> {
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'approvePlan',
      risk: 'high',
      approval: { approvedBy: String(approver), note: notes },
      metadata: { approver, notes },
    });
    return this.orchestrator.approvePlan(approver, notes);
  }

  /**
   * Get approval status
   */
  async getApproval(): Promise<PlanApproval | undefined> {
    return this.orchestrator.getApproval();
  }

  /**
   * Perform a handoff between agents
   */
  async handoff(
    from: string,
    to: string,
    artifacts: string[]
  ): Promise<void> {
    const handoffRisk = artifacts.some((artifactPath) => /secret|token|key|password/i.test(artifactPath))
      ? 'high'
      : 'medium';
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'handoff',
      paths: artifacts,
      risk: handoffRisk,
      metadata: {
        from,
        to,
        artifactCount: artifacts.length,
      },
    });

    await this.orchestrator.handoff(from, to, artifacts);
    const binding = await this.requireHarnessBinding();

    for (const artifactPath of artifacts) {
      await this.runtimeStateService.addArtifact(binding.sessionId, {
        name: artifactPath,
        kind: 'file',
        path: artifactPath,
        metadata: { from, to, source: 'workflow.handoff' },
      });
    }

    await this.taskContractsService.createHandoffContract({
      from,
      to,
      sessionId: binding.sessionId,
      taskId: binding.activeTaskId,
      artifacts,
      evidence: [],
    });

    binding.updatedAt = new Date().toISOString();
    await this.saveHarnessBinding(binding);

    this.deps.ui?.displaySuccess(
      `Handoff: ${from} → ${to}`
    );
  }

  /**
   * Get orchestration guidance for a phase
   */
  async getPhaseOrchestration(phase: PrevcPhase): Promise<PhaseOrchestration> {
    return this.orchestrator.getPhaseOrchestration(phase);
  }

  /**
   * Get next agent suggestion after a handoff
   */
  getNextAgentSuggestion(currentAgent: string): { agent: string; reason: string } | null {
    return this.orchestrator.getNextAgentSuggestion(currentAgent);
  }

  /**
   * Start a collaboration session
   */
  async startCollaboration(
    topic: string,
    participants?: PrevcRole[]
  ): Promise<CollaborationSession> {
    const session = await this.collaborationManager.startSession(topic, participants);

    this.deps.ui?.displaySuccess(
      `Collaboration started: ${topic}`
    );
    this.deps.ui?.displayInfo(
      `Participants: ${session.getParticipantNames().join(', ')}`
    );

    return session;
  }

  /**
   * Add a contribution to a collaboration session
   */
  contributeToCollaboration(
    sessionId: string,
    role: PrevcRole,
    message: string
  ): void {
    this.collaborationManager.contribute(sessionId, role, message);
  }

  /**
   * End a collaboration session and get synthesis
   */
  async endCollaboration(sessionId: string): Promise<CollaborationSynthesis | null> {
    return this.collaborationManager.endSession(sessionId);
  }

  /**
   * Get recommended next actions
   */
  async getRecommendedActions(): Promise<string[]> {
    return this.orchestrator.getRecommendedActions();
  }

  /**
   * Check if workflow is complete
   */
  async isComplete(): Promise<boolean> {
    return this.orchestrator.isComplete();
  }

  /**
   * Update the current task
   */
  async updateTask(task: string): Promise<void> {
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'updateTask',
      risk: 'medium',
      metadata: { task },
    });
    await this.orchestrator.updateCurrentTask(task);
  }

  /**
   * Start a role in the current phase
   */
  async startRole(role: PrevcRole): Promise<void> {
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'startRole',
      risk: 'medium',
      metadata: { role },
    });
    await this.orchestrator.startRole(role);
    this.deps.ui?.displaySuccess(
      `Started role: ${ROLE_DISPLAY_NAMES[role]}`
    );
  }

  /**
   * Complete a role's work
   */
  async completeRole(role: PrevcRole, outputs: string[]): Promise<void> {
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'completeRole',
      paths: outputs,
      risk: outputs.some((output) => /secret|token|key|password/i.test(output)) ? 'high' : 'medium',
      metadata: {
        role,
        outputCount: outputs.length,
      },
    });
    await this.orchestrator.completeRole(role, outputs);
    this.deps.ui?.displaySuccess(
      `Completed role: ${ROLE_DISPLAY_NAMES[role]}`
    );
  }

  async getHarnessStatus(): Promise<WorkflowHarnessStatus | null> {
    if (!(await this.hasWorkflow())) {
      return null;
    }

    const summary = await this.getSummary();
    const binding = await this.ensureHarnessSession(summary.name);

    const session = await this.runtimeStateService.getSession(binding.sessionId);
    const allSensorRuns = await this.sensorsService.getSessionSensorRuns(binding.sessionId);
    const policyRules = await this.policyService.listRules();
    const latestRuns = new Map<string, HarnessSensorRun>();
    for (const run of allSensorRuns) {
      const current = latestRuns.get(run.sensorId);
      if (!current || current.createdAt < run.createdAt) {
        latestRuns.set(run.sensorId, run);
      }
    }
    const sensorRuns = Array.from(latestRuns.values()).sort((a, b) => a.sensorId.localeCompare(b.sensorId));
    const taskContracts = (await this.taskContractsService.listTaskContracts())
      .filter((contract) => contract.sessionId === binding.sessionId);
    const handoffs = (await this.taskContractsService.listHandoffContracts())
      .filter((handoff) => handoff.sessionId === binding.sessionId);
    const activeTask = binding.activeTaskId
      ? taskContracts.find((contract) => contract.id === binding.activeTaskId) ?? null
      : null;
    const taskCompletion = activeTask
      ? await this.taskContractsService.evaluateTaskCompletion(activeTask.id, binding.sessionId)
      : null;
    const backpressure = this.sensorsService.evaluateBackpressure(sensorRuns, { requireEvidence: true });
    const reasons = [
      ...backpressure.reasons,
      ...(taskCompletion?.blockingFindings || []),
    ];

    return {
      binding,
      session,
      availableSensors: this.listAvailableSensors(),
      sensorRuns,
      taskContracts,
      handoffs,
      policyRules: policyRules.length,
      completionCheck: {
        blocked: reasons.length > 0,
        reasons,
        taskCompletion: taskCompletion ? {
          canComplete: taskCompletion.canComplete,
          missingSensors: taskCompletion.missingSensors,
          missingArtifacts: taskCompletion.missingArtifacts,
          blockingFindings: taskCompletion.blockingFindings,
        } : null,
      },
    };
  }

  async checkpointHarnessSession(
    note?: string,
    data?: unknown,
    artifactIds?: string[],
    pause?: boolean
  ): Promise<{ binding: WorkflowHarnessBinding; session: HarnessSessionRecord }> {
    const binding = await this.requireHarnessBinding();
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'checkpoint',
      risk: pause ? 'high' : 'medium',
      metadata: {
        note,
        pause: Boolean(pause),
        artifactCount: artifactIds?.length ?? 0,
      },
    });
    const session = await this.runtimeStateService.checkpointSession(binding.sessionId, {
      note,
      data,
      artifactIds,
      pause,
    });
    binding.updatedAt = session.updatedAt;
    await this.saveHarnessBinding(binding);
    return { binding, session };
  }

  async recordHarnessArtifact(input: {
    name: string;
    kind?: HarnessArtifactKind;
    content?: unknown;
    path?: string;
    metadata?: Record<string, unknown>;
  }) {
    const binding = await this.requireHarnessBinding();
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'recordArtifact',
      paths: input.path ? [input.path] : [input.name],
      risk: input.path?.includes('secret') ? 'critical' : 'medium',
      metadata: input.metadata,
    });
    const artifact = await this.runtimeStateService.addArtifact(binding.sessionId, input);
    binding.updatedAt = artifact.createdAt;
    await this.saveHarnessBinding(binding);
    return artifact;
  }

  async defineHarnessTask(input: {
    title: string;
    description?: string;
    owner?: string;
    inputs?: string[];
    expectedOutputs?: string[];
    acceptanceCriteria?: string[];
    requiredSensors?: string[];
    requiredArtifacts?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<HarnessTaskContract> {
    const binding = await this.requireHarnessBinding();
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'defineTask',
      risk: input.requiredSensors?.includes('deploy') ? 'high' : 'medium',
      metadata: {
        ...input.metadata,
        title: input.title,
      },
    });
    const contract = await this.taskContractsService.createTaskContract({
      ...input,
      sessionId: binding.sessionId,
      status: 'ready',
    });

    binding.activeTaskId = contract.id;
    binding.updatedAt = contract.updatedAt;
    await this.saveHarnessBinding(binding);
    return contract;
  }

  async runHarnessSensors(sensorIds: string[], metadata?: Record<string, unknown>) {
    const binding = await this.requireHarnessBinding();
    const runs: HarnessSensorRun[] = [];

    for (const sensorId of sensorIds) {
      await this.policyService.authorize({
        tool: 'workflow',
        action: 'runSensors',
        risk: sensorId === 'deploy' ? 'high' : 'medium',
        metadata,
      });
      runs.push(await this.sensorsService.runSensor(sensorId, {
        sessionId: binding.sessionId,
        contractId: binding.activeTaskId,
        metadata,
      }));
    }

    return {
      runs,
      backpressure: this.sensorsService.evaluateBackpressure(runs, { requireEvidence: true }),
    };
  }

  private async ensureHarnessSession(
    workflowName: string,
    description?: string
  ): Promise<WorkflowHarnessBinding> {
    const existing = await this.loadHarnessBinding();
    if (existing && existing.workflowName === workflowName) {
      try {
        await this.runtimeStateService.getSession(existing.sessionId);
        return existing;
      } catch {
        // Session was removed or became unreadable. Recreate below.
      }
    }

    const session = await this.runtimeStateService.createSession({
      name: workflowName,
      metadata: {
        workflow: true,
        description,
      },
    });

    const binding: WorkflowHarnessBinding = {
      workflowName,
      sessionId: session.id,
      createdAt: new Date().toISOString(),
      updatedAt: session.updatedAt,
    };

    await this.saveHarnessBinding(binding);
    return binding;
  }

  private async requireHarnessBinding(): Promise<WorkflowHarnessBinding> {
    const summary = await this.getSummary();
    return this.ensureHarnessSession(summary.name);
  }

  private async resolveLinkedPlan(planSlug?: string): Promise<LinkedPlan | null> {
    const status = await this.getStatus();
    const linker = createPlanLinker(this.repoPath);
    const linkedPlans = await linker.getLinkedPlans();
    const resolvedPlanSlug = planSlug
      || status.project.plan
      || linkedPlans.primary
      || (linkedPlans.active.length === 1 ? linkedPlans.active[0].slug : undefined);

    if (!resolvedPlanSlug) {
      return null;
    }

    return linker.getLinkedPlan(resolvedPlanSlug);
  }

  private buildDerivedTaskContract(plan: LinkedPlan, phase: PrevcPhase): DerivedTaskContractInput {
    const matchingPlanPhases = plan.phases.filter((planPhase) => planPhase.prevcPhase === phase);
    const phaseDefinition = getPhaseDefinition(phase);
    const flattenedSteps = matchingPlanPhases.flatMap((planPhase) => planPhase.steps);
    const explicitOutputs = [
      ...matchingPlanPhases.flatMap((planPhase) => planPhase.deliverables ?? []),
      ...flattenedSteps.flatMap((step) => step.outputs || step.deliverables || []),
    ];
    const expectedOutputs = uniqueStrings(
      explicitOutputs.length > 0
        ? explicitOutputs
        : phaseDefinition.outputs
    );
    const acceptanceCriteria = uniqueStrings(
      flattenedSteps.length > 0
        ? flattenedSteps.map((step) => step.description)
        : matchingPlanPhases.length > 0
          ? matchingPlanPhases.map((planPhase) => planPhase.summary || `Complete ${planPhase.name}`)
          : [`Complete ${phaseDefinition.name}`]
    );
    const owners = uniqueStrings(
      flattenedSteps
        .map((step) => step.assignee)
        .filter((assignee): assignee is string => typeof assignee === 'string' && assignee.trim().length > 0)
    );
    const owner = owners.length === 1 ? owners[0] : phaseDefinition.roles[0];
    const title = this.buildDerivedTaskTitle(plan, phase, matchingPlanPhases);
    const description = this.buildDerivedTaskDescription(plan, phase, matchingPlanPhases, flattenedSteps, expectedOutputs);

    return {
      title,
      description,
      owner,
      inputs: plan.docs.map((doc) => `docs/${doc}`),
      expectedOutputs,
      acceptanceCriteria,
      requiredSensors: [],
      requiredArtifacts: [],
      metadata: {
        source: 'workflow.plan',
        planSlug: plan.ref.slug,
        prevcPhase: phase,
        planPhaseIds: matchingPlanPhases.map((planPhase) => planPhase.id),
        planPhaseNames: matchingPlanPhases.map((planPhase) => planPhase.name),
        planPhaseSummaries: matchingPlanPhases.map((planPhase) => planPhase.summary).filter(Boolean),
        derivedFrom: matchingPlanPhases.length > 0 ? 'linked-plan' : 'workflow-phase-defaults',
      },
    };
  }

  private buildDerivedTaskTitle(plan: LinkedPlan, phase: PrevcPhase, matchingPlanPhases: PlanPhase[]): string {
    if (matchingPlanPhases.length === 1) {
      return `${plan.ref.title}: ${matchingPlanPhases[0].name}`;
    }

    if (matchingPlanPhases.length > 1) {
      return `${plan.ref.title}: ${getPhaseDefinition(phase).name} (${matchingPlanPhases.length} plan phases)`;
    }

    return `${plan.ref.title}: ${getPhaseDefinition(phase).name}`;
  }

  private buildDerivedTaskDescription(
    plan: LinkedPlan,
    phase: PrevcPhase,
    matchingPlanPhases: PlanPhase[],
    flattenedSteps: PlanStep[],
    expectedOutputs: string[]
  ): string {
    const lines = [
      `Derived from linked plan "${plan.ref.slug}" for PREVC phase ${phase} (${getPhaseDefinition(phase).name}).`,
    ];

    if (matchingPlanPhases.length > 0) {
      lines.push(`Plan phases: ${matchingPlanPhases.map((planPhase) => planPhase.name).join(', ')}.`);
    }

    const summaries = matchingPlanPhases
      .map((planPhase) => planPhase.summary)
      .filter((summary): summary is string => typeof summary === 'string' && summary.trim().length > 0);
    if (summaries.length > 0) {
      lines.push(`Phase objectives: ${summaries.join(' ')}.`);
    }

    if (flattenedSteps.length > 0) {
      lines.push(`Key steps: ${flattenedSteps.map((step) => step.description).join('; ')}.`);
    }

    if (expectedOutputs.length > 0) {
      lines.push(`Expected outputs: ${expectedOutputs.join(', ')}.`);
    }

    return lines.join(' ');
  }

  private async loadHarnessBinding(): Promise<WorkflowHarnessBinding | null> {
    return this.workflowStateService.getBinding();
  }

  private async saveHarnessBinding(binding: WorkflowHarnessBinding): Promise<void> {
    await this.workflowStateService.saveBinding(binding);
  }

  private registerDefaultSensors(): void {
    const definitions = this.sensorCatalogService.resolveEffectiveSensorsSync();

    for (const definition of definitions) {
      if (this.sensorsService.getSensor(definition.id)) {
        continue;
      }

      this.sensorsService.registerSensor({
        id: definition.id,
        name: definition.name,
        severity: definition.severity,
        blocking: definition.severity === 'critical',
        execute: async () => {
          if (definition.script) {
            const hasScript = await this.hasPackageScript(definition.script);
            if (!hasScript) {
              return {
                status: definition.severity === 'warning' ? 'skipped' : 'blocked',
                summary: `Script not available: ${definition.script}`,
                evidence: [`Missing package.json script: ${definition.script}`],
              };
            }
          }

          return this.executeShellSensor(definition.command, definition.name);
        },
      });
    }
  }

  private async hasPackageScript(scriptName: string): Promise<boolean> {
    const packageJsonPath = path.join(this.repoPath, 'package.json');
    if (!(await fs.pathExists(packageJsonPath))) {
      return false;
    }

    const packageJson = await fs.readJson(packageJsonPath) as { scripts?: Record<string, string> };
    return Boolean(packageJson.scripts?.[scriptName]);
  }

  private async executeShellSensor(command: string, name: string) {
    try {
      const { stdout, stderr } = await exec(command, {
        cwd: this.repoPath,
        timeout: 300000,
      });

      return {
        status: 'passed' as const,
        summary: `${name} passed`,
        evidence: [this.trimEvidence(stdout), this.trimEvidence(stderr)].filter(Boolean) as string[],
        output: {
          command,
        },
      };
    } catch (error: any) {
      return {
        status: 'failed' as const,
        summary: `${name} failed`,
        evidence: [
          this.trimEvidence(error?.stdout),
          this.trimEvidence(error?.stderr || error?.message),
        ].filter(Boolean) as string[],
        details: {
          command,
          exitCode: typeof error?.code === 'number' ? error.code : undefined,
        },
      };
    }
  }

  private trimEvidence(value?: string, maxLength: number = 2000): string | null {
    if (!value) {
      return null;
    }

    return value.length > maxLength ? `${value.slice(0, maxLength)}\n...[truncated]` : value;
  }
}
