/**
 * PREVC Workflow Service
 *
 * High-level service for managing PREVC workflows via CLI and MCP.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { CollaborationSession, CollaborationManager } from '../../workflow/collaboration';
import { GateCheckResult, ExecutionEvidence } from '../../workflow/gates';
import { PHASE_NAMES_EN, PHASE_NAMES_PT } from '../../workflow/phases';
import { createPlanLinker, type LinkedPlan } from '../../workflow/plans';
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
import type { PlanLinker } from '../../workflow/plans';
import { FileCollaborationStore } from './fileCollaborationStore';
import { DerivedPlanTaskContractBuilder } from './derivedPlanTaskContractBuilder';
import {
  type HarnessArtifactKind,
  type HarnessTaskContract,
  type HarnessSensorDefinition,
  type WorkflowHarnessBinding,
} from '../harness';
import { HarnessSessionFacade, type WorkflowHarnessStatus } from './harnessSessionFacade';

export type { WorkflowHarnessStatus };

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
  private harness: HarnessSessionFacade;
  private derivedTaskBuilder: DerivedPlanTaskContractBuilder;
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
    this.harness = new HarnessSessionFacade({
      repoPath: this.repoPath,
      contextPath: this.contextPath,
    });
    this.orchestrator = new PrevcOrchestrator(this.contextPath, this.harness.workflowStateService);
    this.collaborationManager = new CollaborationManager(
      new FileCollaborationStore(this.contextPath)
    );
    this.derivedTaskBuilder = new DerivedPlanTaskContractBuilder();
    this.deps = deps;
  }

  // Narrow accessors used by advance/handoff/plan-sync logic below.
  // Fresh `get` each call keeps the facade as the single owner.
  private get runtimeStateService() { return this.harness.runtimeStateService; }
  private get sensorsService() { return this.harness.sensorsService; }
  private get taskContractsService() { return this.harness.taskContractsService; }
  private get policyService() { return this.harness.policyService; }

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

    await this.harness.ensureHarnessSession(options.name, options.description);

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

  getPhaseDisplayName(phase: PrevcPhase): string {
    return PHASE_NAMES_EN[phase];
  }

  getRoleDisplayName(role: PrevcRole): string {
    return ROLE_DISPLAY_NAMES[role];
  }

  getPlanLinkerForWorkflow(): PlanLinker {
    return createPlanLinker(this.repoPath);
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

    const executionEvidence = await this.buildExecutionEvidence(
      activeTaskBeforeAdvance,
      binding.sessionId
    );

    const nextContract = plannedNextPhase
      ? await this.createDerivedPlanTaskContract({
          phase: plannedNextPhase,
          sessionId: binding.sessionId,
        })
      : null;
    const nextPhase = await this.orchestrator.completePhase(outputs, {
      ...options,
      executionEvidence,
    });

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

  async checkGates(): Promise<GateCheckResult> {
    return this.orchestrator.checkGates();
  }

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

  async getSettings(): Promise<WorkflowSettings> {
    return this.orchestrator.getSettings();
  }

  listAvailableSensors(): Array<Pick<HarnessSensorDefinition, 'id' | 'name' | 'description'>> {
    return this.harness.listAvailableSensors();
  }

  async setAutonomousMode(enabled: boolean): Promise<WorkflowSettings> {
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'setAutonomousMode',
      risk: 'high',
      metadata: { enabled },
    });
    return this.orchestrator.setSettings({ autonomous_mode: enabled });
  }

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

    const contractInput = this.derivedTaskBuilder.build(linkedPlan, params.phase);
    if (this.derivedTaskBuilder.isSameDerivedTask(params.activeTask, linkedPlan.ref.slug, params.phase)) {
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

  private async buildExecutionEvidence(
    activeTask: HarnessTaskContract | null,
    sessionId: string
  ): Promise<ExecutionEvidence> {
    if (!activeTask) {
      return {
        canComplete: false,
        missingSensors: [],
        missingArtifacts: [],
        blockingFindings: [],
        hasActiveContract: false,
      };
    }
    const evaluation = await this.taskContractsService.evaluateTaskCompletion(
      activeTask.id,
      sessionId
    );
    return {
      canComplete: evaluation.canComplete,
      missingSensors: evaluation.missingSensors,
      missingArtifacts: evaluation.missingArtifacts,
      blockingFindings: evaluation.blockingFindings,
      hasActiveContract: true,
    };
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

    const contractInput = this.derivedTaskBuilder.build(linkedPlan, params.phase);
    return this.taskContractsService.createTaskContract({
      ...contractInput,
      sessionId: params.sessionId,
      status: 'ready',
    });
  }

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

  async getApproval(): Promise<PlanApproval | undefined> {
    return this.orchestrator.getApproval();
  }

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

  async getPhaseOrchestration(phase: PrevcPhase): Promise<PhaseOrchestration> {
    return this.orchestrator.getPhaseOrchestration(phase);
  }

  getNextAgentSuggestion(currentAgent: string): { agent: string; reason: string } | null {
    return this.orchestrator.getNextAgentSuggestion(currentAgent);
  }

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

  contributeToCollaboration(
    sessionId: string,
    role: PrevcRole,
    message: string
  ): void {
    this.collaborationManager.contribute(sessionId, role, message);
  }

  async endCollaboration(sessionId: string): Promise<CollaborationSynthesis | null> {
    return this.collaborationManager.endSession(sessionId);
  }

  async getRecommendedActions(): Promise<string[]> {
    return this.orchestrator.getRecommendedActions();
  }

  async isComplete(): Promise<boolean> {
    return this.orchestrator.isComplete();
  }

  async updateTask(task: string): Promise<void> {
    await this.policyService.authorize({
      tool: 'workflow',
      action: 'updateTask',
      risk: 'medium',
      metadata: { task },
    });
    await this.orchestrator.updateCurrentTask(task);
  }

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
    return this.harness.getHarnessStatus(summary.name);
  }

  async checkpointHarnessSession(
    note?: string,
    data?: unknown,
    artifactIds?: string[],
    pause?: boolean
  ) {
    const binding = await this.requireHarnessBinding();
    return this.harness.checkpointHarnessSession(binding, { note, data, artifactIds, pause });
  }

  async recordHarnessArtifact(input: {
    name: string;
    kind?: HarnessArtifactKind;
    content?: unknown;
    path?: string;
    metadata?: Record<string, unknown>;
  }) {
    const binding = await this.requireHarnessBinding();
    return this.harness.recordHarnessArtifact(binding, input);
  }

  async defineHarnessTask(input: {
    title: string;
    description?: string;
    owner?: string;
    inputs?: string[];
    expectedOutputs?: string[];
    acceptanceCriteria?: string[];
    requiredSensors?: string[];
    requiredArtifacts?: import('../harness').RequiredArtifactInput[];
    metadata?: Record<string, unknown>;
  }): Promise<HarnessTaskContract> {
    const binding = await this.requireHarnessBinding();
    return this.harness.defineHarnessTask(binding, input);
  }

  async runHarnessSensors(sensorIds: string[], metadata?: Record<string, unknown>) {
    const binding = await this.requireHarnessBinding();
    return this.harness.runHarnessSensors(binding, sensorIds, metadata);
  }

  private async requireHarnessBinding(): Promise<WorkflowHarnessBinding> {
    const summary = await this.getSummary();
    return this.harness.ensureHarnessSession(summary.name);
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

  private async saveHarnessBinding(binding: WorkflowHarnessBinding): Promise<void> {
    await this.harness.saveHarnessBinding(binding);
  }
}
