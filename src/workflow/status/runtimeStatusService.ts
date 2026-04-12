/**
 * PREVC Status Runtime Service
 *
 * Pure workflow state transitions and derived state helpers.
 * This module contains no file-system or persistence concerns.
 */

import {
  AgentUpdate,
  AgentStatus,
  ExecutionHistoryEntry,
  PhaseUpdate,
  PlanApproval,
  PrevcPhase,
  PrevcRole,
  PrevcStatus,
  RoleStatus,
  RoleUpdate,
  WorkflowSettings,
} from '../types';
import { PREVC_PHASE_ORDER } from '../phases';
import { getDefaultSettings } from '../gates';
import { appendExecutionHistoryEntry } from './statusExecution';
import { migrateLegacyStatus } from './statusMigration';
import {
  completeStatusPhaseTransition,
  getNextPhaseForStatus,
  markStatusPhaseComplete,
  transitionStatusToPhase,
} from './statusTransitions';

export interface NormalizeStatusResult {
  status: PrevcStatus;
  changed: boolean;
}

export class PrevcStatusRuntimeService {
  normalizeLoadedStatus(status: PrevcStatus): NormalizeStatusResult {
    const changed = !status.project.settings || !status.agents || !status.roles || !status.approval || !status.execution;
    return {
      status: migrateLegacyStatus(status),
      changed,
    };
  }

  getCurrentPhase(status: PrevcStatus): PrevcPhase {
    return status.project.current_phase;
  }

  getActiveRole(status: PrevcStatus): PrevcRole | null {
    for (const [role, roleStatus] of Object.entries(status.roles)) {
      if ((roleStatus as RoleStatus).status === 'in_progress') {
        return role as PrevcRole;
      }
    }

    return null;
  }

  updatePhase(status: PrevcStatus, phase: PrevcPhase, update: PhaseUpdate): void {
    status.phases[phase] = {
      ...status.phases[phase],
      ...update,
    };
  }

  updateRole(status: PrevcStatus, role: PrevcRole, update: RoleUpdate): void {
    status.roles[role] ??= {};
    status.roles[role] = {
      ...status.roles[role],
      ...update,
    };
  }

  updateAgent(status: PrevcStatus, agentName: string, update: AgentUpdate, now = new Date().toISOString()): void {
    status.agents ??= {};

    const existingAgent = status.agents[agentName];
    const agentStatus: AgentStatus = {
      status: update.status ?? existingAgent?.status ?? 'pending',
      started_at: existingAgent?.started_at,
      completed_at: existingAgent?.completed_at,
      outputs: update.outputs ?? existingAgent?.outputs,
    };

    if (update.status === 'in_progress' && !existingAgent?.started_at) {
      agentStatus.started_at = now;
    }
    if (update.status === 'completed' && !existingAgent?.completed_at) {
      agentStatus.completed_at = now;
    }

    status.agents[agentName] = agentStatus;
  }

  getNextPhase(status: PrevcStatus): PrevcPhase | null {
    return getNextPhaseForStatus(status);
  }

  isComplete(status: PrevcStatus): boolean {
    for (const phase of PREVC_PHASE_ORDER) {
      const phaseStatus = status.phases[phase];
      if (phaseStatus.status !== 'completed' && phaseStatus.status !== 'skipped') {
        return false;
      }
    }

    return true;
  }

  transitionToPhase(status: PrevcStatus, phase: PrevcPhase, now = new Date().toISOString()): void {
    transitionStatusToPhase(status, phase, now);
  }

  markPhaseComplete(
    status: PrevcStatus,
    phase: PrevcPhase,
    outputs?: string[],
    now = new Date().toISOString()
  ): void {
    markStatusPhaseComplete(status, phase, outputs, now);
  }

  completePhaseTransition(status: PrevcStatus, outputs?: string[], now = new Date().toISOString()): PrevcPhase | null {
    return completeStatusPhaseTransition(status, outputs, now);
  }

  setSettings(status: PrevcStatus, settings: Partial<WorkflowSettings>): WorkflowSettings {
    const defaults = getDefaultSettings(status.project.scale);
    const currentSettings = status.project.settings || defaults;

    const nextSettings: WorkflowSettings = {
      autonomous_mode: settings.autonomous_mode ?? currentSettings.autonomous_mode,
      require_plan: settings.require_plan ?? currentSettings.require_plan,
      require_approval: settings.require_approval ?? currentSettings.require_approval,
    };

    status.project.settings = nextSettings;
    return nextSettings;
  }

  markPlanCreated(status: PrevcStatus, planSlug: string, now = new Date().toISOString()): void {
    status.approval ??= {
      plan_created: false,
      plan_approved: false,
    };

    status.approval.plan_created = true;
    status.project.plan = planSlug;
    appendExecutionHistoryEntry(status, {
      phase: status.project.current_phase,
      action: 'plan_linked',
      plan: planSlug,
    }, now);
  }

  approvePlan(
    status: PrevcStatus,
    approver: PrevcRole | string,
    notes?: string,
    now = new Date().toISOString()
  ): PlanApproval {
    status.approval ??= {
      plan_created: false,
      plan_approved: false,
    };

    status.approval.plan_approved = true;
    status.approval.approved_by = approver;
    status.approval.approved_at = now;
    if (notes) {
      status.approval.approval_notes = notes;
    }
    appendExecutionHistoryEntry(status, {
      phase: status.project.current_phase,
      action: 'plan_approved',
      approved_by: String(approver),
    }, now);

    return status.approval;
  }

  addHistoryEntry(status: PrevcStatus, entry: Omit<ExecutionHistoryEntry, 'timestamp'>, now = new Date().toISOString()): void {
    appendExecutionHistoryEntry(status, entry, now);
  }

  addStepHistoryEntry(
    status: PrevcStatus,
    entry: {
      action: 'step_started' | 'step_completed' | 'step_skipped';
      plan: string;
      planPhase: string;
      stepIndex: number;
      stepDescription?: string;
      output?: string;
      notes?: string;
    },
    now = new Date().toISOString()
  ): void {
    appendExecutionHistoryEntry(status, {
      phase: status.project.current_phase,
      action: entry.action,
      plan: entry.plan,
      planPhase: entry.planPhase,
      stepIndex: entry.stepIndex,
      stepDescription: entry.stepDescription,
      output: entry.output,
      notes: entry.notes,
    }, now, {
      phase: status.project.current_phase,
      action: entry.action,
      stepContext: {
        planPhase: entry.planPhase,
        stepIndex: entry.stepIndex,
        stepDescription: entry.stepDescription,
      },
    });
  }
}
