/**
 * PREVC Status Manager
 *
 * Coordinates canonical PREVC workflow state using a persistence service,
 * pure transition helpers, and a legacy YAML migrator.
 *
 * No in-memory cache is maintained: canonical state lives in a single small
 * JSON file under `.context/harness/workflows/`, reads are cheap, and an
 * mtime-based cache would add invalidation complexity that loses value once
 * multiple processes (MCP + CLI) can write concurrently. If profiling ever
 * shows read contention, reintroduce caching keyed on the canonical file's
 * mtime — not on a stale in-process value.
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
import type { HarnessWorkflowStateService } from '../../services/harness/workflowStateService';
import {
  addHistoryEntry as addHistoryEntryOnStatus,
  addStepHistoryEntry as addStepHistoryEntryOnStatus,
  applyWorkflowSettings,
  approvePlanOnStatus,
  completeStatusPhaseTransition,
  getActiveRole as getActiveRoleFromStatus,
  getCurrentPhase as getCurrentPhaseFromStatus,
  getNextPhaseForStatus,
  isWorkflowComplete,
  markPlanCreatedOnStatus,
  markStatusPhaseComplete,
  normalizeLoadedStatus,
  type StepHistoryInput,
  transitionStatusToPhase,
  updateAgent as updateAgentOnStatus,
  updatePhase as updatePhaseOnStatus,
  updateRole as updateRoleOnStatus,
} from './statusTransitions';
import { LegacyWorkflowStatusMigrator } from '../legacy/legacyWorkflowStatusMigrator';
import { getDefaultSettings } from '../gates';

interface StatusReadResult {
  status: PrevcStatus;
  fromLegacy: boolean;
  changed: boolean;
  hasLegacyProjection: boolean;
}

export class PrevcStatusManager {
  private readonly legacyMigrator: LegacyWorkflowStatusMigrator;

  constructor(
    contextPath: string,
    private readonly workflowState: HarnessWorkflowStateService
  ) {
    this.legacyMigrator = new LegacyWorkflowStatusMigrator(contextPath);
  }

  async exists(): Promise<boolean> {
    return (await this.workflowState.exists()) || (await this.legacyMigrator.exists());
  }

  private finalizeRead(
    raw: PrevcStatus | null,
    fromLegacy: boolean,
    hasLegacyProjection: boolean
  ): StatusReadResult {
    if (!raw) {
      throw new Error('Workflow status not found. Run "workflow init" first.');
    }

    const normalized = normalizeLoadedStatus(raw);
    return {
      status: normalized.status,
      fromLegacy,
      changed: normalized.changed,
      hasLegacyProjection,
    };
  }

  private async readStatus(): Promise<StatusReadResult> {
    const hasCanonicalState = await this.workflowState.exists();
    const hasLegacyProjection = await this.legacyMigrator.exists();

    const raw = hasCanonicalState
      ? await this.workflowState.load()
      : hasLegacyProjection
        ? await this.legacyMigrator.load()
        : null;

    return this.finalizeRead(raw, !hasCanonicalState && hasLegacyProjection, hasLegacyProjection);
  }

  private readStatusSync(): StatusReadResult {
    const hasCanonicalState = this.workflowState.existsSync();
    const hasLegacyProjection = this.legacyMigrator.existsSync();

    const raw = hasCanonicalState
      ? this.workflowState.loadSync()
      : hasLegacyProjection
        ? this.legacyMigrator.loadSync()
        : null;

    return this.finalizeRead(raw, !hasCanonicalState && hasLegacyProjection, hasLegacyProjection);
  }

  private async persistStatus(status: PrevcStatus): Promise<void> {
    await this.workflowState.save(status);
    await this.legacyMigrator.remove();
  }

  async load(): Promise<PrevcStatus> {
    const read = await this.readStatus();
    if (read.changed || read.fromLegacy || read.hasLegacyProjection) {
      await this.persistStatus(read.status);
    }
    return read.status;
  }

  loadSync(): PrevcStatus {
    return this.readStatusSync().status;
  }

  async save(status: PrevcStatus): Promise<void> {
    const normalized = normalizeLoadedStatus(status);
    await this.persistStatus(normalized.status);
  }

  async remove(): Promise<void> {
    await this.workflowState.remove();
    await this.legacyMigrator.remove();
  }

  async archive(name: string): Promise<void> {
    await this.workflowState.archive(name);
    await this.legacyMigrator.archive(name);
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
    updatePhaseOnStatus(status, phase, update);
    await this.save(status);
  }

  async updateRole(role: PrevcRole, update: RoleUpdate): Promise<void> {
    const status = await this.load();
    updateRoleOnStatus(status, role, update);
    await this.save(status);
  }

  async updateAgent(agentName: string, update: AgentUpdate): Promise<void> {
    const status = await this.load();
    updateAgentOnStatus(status, agentName, update);
    await this.save(status);
  }

  async transitionToPhase(phase: PrevcPhase): Promise<void> {
    const status = await this.load();
    transitionStatusToPhase(status, phase);
    await this.save(status);
  }

  async markPhaseComplete(phase: PrevcPhase, outputs?: string[]): Promise<void> {
    const status = await this.load();
    markStatusPhaseComplete(status, phase, outputs);
    await this.save(status);
  }

  async completePhaseTransition(outputs?: string[]): Promise<PrevcPhase | null> {
    const status = await this.load();
    const nextPhase = completeStatusPhaseTransition(status, outputs);
    await this.save(status);
    return nextPhase;
  }

  async getCurrentPhase(): Promise<PrevcPhase> {
    const status = await this.load();
    return getCurrentPhaseFromStatus(status);
  }

  async getActiveRole(): Promise<PrevcRole | null> {
    const status = await this.load();
    return getActiveRoleFromStatus(status);
  }

  async getNextPhase(): Promise<PrevcPhase | null> {
    const status = await this.load();
    return getNextPhaseForStatus(status);
  }

  async isComplete(): Promise<boolean> {
    const status = await this.load();
    return isWorkflowComplete(status);
  }

  async setSettings(settings: Partial<WorkflowSettings>): Promise<WorkflowSettings> {
    const status = await this.load();
    const nextSettings = applyWorkflowSettings(status, settings);
    await this.save(status);
    return nextSettings;
  }

  async getSettings(): Promise<WorkflowSettings> {
    const status = await this.load();
    return status.project.settings || getDefaultSettings(status.project.scale);
  }

  async markPlanCreated(planSlug: string): Promise<void> {
    const status = await this.load();
    markPlanCreatedOnStatus(status, planSlug);
    await this.save(status);
  }

  async approvePlan(approver: PrevcRole | string, notes?: string): Promise<PlanApproval> {
    const status = await this.load();
    const approval = approvePlanOnStatus(status, approver, notes);
    await this.save(status);
    return approval;
  }

  async getApproval(): Promise<PlanApproval | undefined> {
    const status = await this.load();
    return status.approval;
  }

  async addHistoryEntry(entry: Omit<ExecutionHistoryEntry, 'timestamp'>): Promise<void> {
    const status = await this.load();
    addHistoryEntryOnStatus(status, entry);
    await this.save(status);
  }

  async addStepHistoryEntry(entry: StepHistoryInput): Promise<void> {
    const status = await this.load();
    addStepHistoryEntryOnStatus(status, entry);
    await this.save(status);
  }

  async getExecutionHistory(): Promise<ExecutionHistory | undefined> {
    const status = await this.load();
    return status.execution;
  }

  async getSummary(): Promise<WorkflowSummary> {
    const status = await this.load();
    const complete = isWorkflowComplete(status);

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
      isComplete: complete,
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
