/**
 * PREVC Status Manager
 *
 * Coordinates canonical PREVC workflow state using a persistence port,
 * a runtime transition service, and a legacy YAML migrator.
 */

import type {
  AgentUpdate,
  ExecutionHistory,
  ExecutionHistoryEntry,
  PhaseUpdate,
  PlanApproval,
  PrevcPhase,
  PrevcRole,
  PrevcStatus,
  ProjectScale,
  RoleUpdate,
  WorkflowSettings,
} from '../types';
import { PREVC_PHASE_ORDER, getPhaseDefinition } from '../phases';
import { getRoleConfig } from '../prevcConfig';
import { createInitialStatus } from './templates';
import type { WorkflowStatePort } from './workflowStatePort';
import { PrevcStatusRuntimeService } from './runtimeStatusService';
import { LegacyWorkflowStatusMigrator } from '../legacy/legacyWorkflowStatusMigrator';
import { getDefaultSettings } from '../gates';

export class PrevcStatusManager {
  private cachedStatus: PrevcStatus | null = null;
  private readonly statusRuntime = new PrevcStatusRuntimeService();
  private readonly legacyMigrator: LegacyWorkflowStatusMigrator;

  constructor(
    contextPath: string,
    private readonly workflowState: WorkflowStatePort
  ) {
    this.legacyMigrator = new LegacyWorkflowStatusMigrator(contextPath);
  }

  async exists(): Promise<boolean> {
    return (await this.workflowState.exists()) || (await this.legacyMigrator.exists());
  }

  private async readStatus(): Promise<{ status: PrevcStatus; fromLegacy: boolean; changed: boolean; hasLegacyProjection: boolean }> {
    const hasCanonicalState = await this.workflowState.exists();
    const hasLegacyProjection = await this.legacyMigrator.exists();

    if (!hasCanonicalState && !hasLegacyProjection) {
      throw new Error('Workflow status not found. Run "workflow init" first.');
    }

    const status = hasCanonicalState
      ? await this.workflowState.load()
      : await this.legacyMigrator.load();

    const normalized = this.statusRuntime.normalizeLoadedStatus(status);
    return {
      status: normalized.status,
      fromLegacy: !hasCanonicalState,
      changed: normalized.changed,
      hasLegacyProjection,
    };
  }

  private readStatusSync(): { status: PrevcStatus; fromLegacy: boolean; changed: boolean; hasLegacyProjection: boolean } {
    const canonicalExists = this.workflowState.existsSync();
    const legacyExists = this.legacyMigrator.existsSync();
    let status: PrevcStatus | null = null;
    let fromLegacy = false;

    if (canonicalExists) {
      status = this.workflowState.loadSync();
    } else if (legacyExists) {
      status = this.legacyMigrator.loadSync();
      fromLegacy = true;
    }

    if (!status) {
      throw new Error('Workflow status not found. Run "workflow init" first.');
    }

    const normalized = this.statusRuntime.normalizeLoadedStatus(status);
    return {
      status: normalized.status,
      fromLegacy,
      changed: normalized.changed,
      hasLegacyProjection: legacyExists,
    };
  }

  private async persistStatus(status: PrevcStatus): Promise<void> {
    await this.workflowState.save(status);
    await this.legacyMigrator.remove();
  }

  async load(): Promise<PrevcStatus> {
    if (this.cachedStatus) {
      return this.cachedStatus;
    }

    const read = await this.readStatus();
    if (read.changed || read.fromLegacy || read.hasLegacyProjection) {
      await this.persistStatus(read.status);
    }

    this.cachedStatus = read.status;
    return this.cachedStatus;
  }

  loadSync(): PrevcStatus {
    if (this.cachedStatus) {
      return this.cachedStatus;
    }

    const read = this.readStatusSync();
    this.cachedStatus = read.status;
    return this.cachedStatus;
  }

  async save(status: PrevcStatus): Promise<void> {
    const normalized = this.statusRuntime.normalizeLoadedStatus(status);
    await this.persistStatus(normalized.status);
    this.cachedStatus = normalized.status;
  }

  async remove(): Promise<void> {
    await this.workflowState.remove();
    await this.legacyMigrator.remove();
    this.cachedStatus = null;
  }

  async archive(name: string): Promise<void> {
    await this.workflowState.archive(name);
    await this.legacyMigrator.archive(name);
    this.cachedStatus = null;
  }

  async create(options: {
    name: string;
    scale: ProjectScale;
    phases?: PrevcPhase[];
    roles?: PrevcRole[] | 'all';
  }): Promise<PrevcStatus> {
    const status = createInitialStatus({
      name: options.name,
      scale: options.scale,
      phases: options.phases,
      roles: options.roles,
    });

    await this.save(status);
    return status;
  }

  async updatePhase(phase: PrevcPhase, update: PhaseUpdate): Promise<void> {
    const status = await this.load();
    this.statusRuntime.updatePhase(status, phase, update);
    await this.save(status);
  }

  async updateRole(role: PrevcRole, update: RoleUpdate): Promise<void> {
    const status = await this.load();
    this.statusRuntime.updateRole(status, role, update);
    await this.save(status);
  }

  async updateAgent(agentName: string, update: AgentUpdate): Promise<void> {
    const status = await this.load();
    this.statusRuntime.updateAgent(status, agentName, update);
    await this.save(status);
  }

  async transitionToPhase(phase: PrevcPhase): Promise<void> {
    const status = await this.load();
    this.statusRuntime.transitionToPhase(status, phase);
    await this.save(status);
  }

  async markPhaseComplete(phase: PrevcPhase, outputs?: string[]): Promise<void> {
    const status = await this.load();
    this.statusRuntime.markPhaseComplete(status, phase, outputs);
    await this.save(status);
  }

  async completePhaseTransition(outputs?: string[]): Promise<PrevcPhase | null> {
    const status = await this.load();
    const nextPhase = this.statusRuntime.completePhaseTransition(status, outputs);
    await this.save(status);
    return nextPhase;
  }

  async getCurrentPhase(): Promise<PrevcPhase> {
    const status = await this.load();
    return this.statusRuntime.getCurrentPhase(status);
  }

  async getActiveRole(): Promise<PrevcRole | null> {
    const status = await this.load();
    return this.statusRuntime.getActiveRole(status);
  }

  async getNextPhase(): Promise<PrevcPhase | null> {
    const status = await this.load();
    return this.statusRuntime.getNextPhase(status);
  }

  async isComplete(): Promise<boolean> {
    const status = await this.load();
    return this.statusRuntime.isComplete(status);
  }

  async setSettings(settings: Partial<WorkflowSettings>): Promise<WorkflowSettings> {
    const status = await this.load();
    const nextSettings = this.statusRuntime.setSettings(status, settings);
    await this.save(status);
    return nextSettings;
  }

  async getSettings(): Promise<WorkflowSettings> {
    const status = await this.load();
    return status.project.settings || getDefaultSettings(status.project.scale);
  }

  async markPlanCreated(planSlug: string): Promise<void> {
    const status = await this.load();
    this.statusRuntime.markPlanCreated(status, planSlug);
    await this.save(status);
  }

  async approvePlan(approver: PrevcRole | string, notes?: string): Promise<PlanApproval> {
    const status = await this.load();
    const approval = this.statusRuntime.approvePlan(status, approver, notes);
    await this.save(status);
    return approval;
  }

  async getApproval(): Promise<PlanApproval | undefined> {
    const status = await this.load();
    return status.approval;
  }

  async addHistoryEntry(entry: Omit<ExecutionHistoryEntry, 'timestamp'>): Promise<void> {
    const status = await this.load();
    this.statusRuntime.addHistoryEntry(status, entry);
    await this.save(status);
  }

  async addStepHistoryEntry(entry: {
    action: 'step_started' | 'step_completed' | 'step_skipped';
    plan: string;
    planPhase: string;
    stepIndex: number;
    stepDescription?: string;
    output?: string;
    notes?: string;
  }): Promise<void> {
    const status = await this.load();
    this.statusRuntime.addStepHistoryEntry(status, entry);
    await this.save(status);
  }

  async getExecutionHistory(): Promise<ExecutionHistory | undefined> {
    const status = await this.load();
    return status.execution;
  }

  async getSummary(): Promise<WorkflowSummary> {
    const status = await this.load();
    const isComplete = this.statusRuntime.isComplete(status);

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

  async updateCurrentTask(task: string): Promise<void> {
    const currentPhase = await this.getCurrentPhase();
    const activeRole = await this.getActiveRole();

    await this.updatePhase(currentPhase, {
      current_task: task,
      role: activeRole || undefined,
    });
  }

  async startRole(role: PrevcRole): Promise<void> {
    const currentPhase = await this.getCurrentPhase();

    await this.updateRole(role, {
      status: 'in_progress',
      phase: currentPhase,
    });

    await this.updatePhase(currentPhase, {
      role,
    });
  }

  async completeRole(role: PrevcRole, outputs: string[]): Promise<void> {
    await this.updateRole(role, {
      status: 'completed',
      outputs,
      last_active: new Date().toISOString(),
    });
  }

  async getRecommendedActions(): Promise<string[]> {
    const status = await this.load();
    const phaseDefinition = getPhaseDefinition(status.project.current_phase);
    const actions: string[] = [];

    actions.push(`Complete ${phaseDefinition.name} phase tasks`);

    for (const role of phaseDefinition.roles) {
      const roleConfig = getRoleConfig(role);
      if (roleConfig) {
        actions.push(...roleConfig.responsibilities.slice(0, 2));
      }
    }

    if (phaseDefinition.outputs.length > 0) {
      actions.push(`Create outputs: ${phaseDefinition.outputs.join(', ')}`);
    }

    return actions;
  }
}

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
