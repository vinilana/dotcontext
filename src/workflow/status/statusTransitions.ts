/**
 * Pure workflow state transitions and derived-state helpers.
 *
 * These functions mutate the provided `PrevcStatus` in place (or return a
 * narrow result) and contain no file-system or persistence concerns.
 */

import { getNextActivePhase, PREVC_PHASE_ORDER } from '../phases';
import { getDefaultSettings } from '../gates';
import {
  AgentStatus,
  AgentUpdate,
  ExecutionHistoryEntry,
  OutputStatus,
  PhaseUpdate,
  PlanApproval,
  PrevcPhase,
  PrevcRole,
  PrevcStatus,
  RoleStatus,
  RoleUpdate,
  WorkflowSettings,
} from '../types';
import { appendExecutionHistoryEntry } from './statusExecution';
import { migrateLegacyStatus } from './statusMigration';

export interface NormalizeStatusResult {
  status: PrevcStatus;
  changed: boolean;
}

function toOutputStatuses(outputs?: string[]): OutputStatus[] | undefined {
  if (!outputs) {
    return undefined;
  }

  return outputs.map((outputPath) => ({
    path: outputPath,
    status: 'filled',
  }));
}

export function normalizeLoadedStatus(status: PrevcStatus): NormalizeStatusResult {
  const changed =
    !status.project.settings ||
    !status.agents ||
    !status.roles ||
    !status.approval ||
    !status.execution;

  return {
    status: migrateLegacyStatus(status),
    changed,
  };
}

export function getCurrentPhase(status: PrevcStatus): PrevcPhase {
  return status.project.current_phase;
}

export function getActiveRole(status: PrevcStatus): PrevcRole | null {
  for (const [role, roleStatus] of Object.entries(status.roles)) {
    if ((roleStatus as RoleStatus).status === 'in_progress') {
      return role as PrevcRole;
    }
  }

  return null;
}

export function updatePhase(
  status: PrevcStatus,
  phase: PrevcPhase,
  update: PhaseUpdate
): void {
  status.phases[phase] = {
    ...status.phases[phase],
    ...update,
  };
}

export function updateRole(
  status: PrevcStatus,
  role: PrevcRole,
  update: RoleUpdate
): void {
  status.roles[role] ??= {};
  status.roles[role] = {
    ...status.roles[role],
    ...update,
  };
}

export function updateAgent(
  status: PrevcStatus,
  agentName: string,
  update: AgentUpdate,
  now: string = new Date().toISOString()
): void {
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

export function getNextPhaseForStatus(status: PrevcStatus): PrevcPhase | null {
  return getNextActivePhase(status.project.current_phase, status.phases);
}

export function isWorkflowComplete(status: PrevcStatus): boolean {
  for (const phase of PREVC_PHASE_ORDER) {
    const phaseStatus = status.phases[phase];
    if (phaseStatus.status !== 'completed' && phaseStatus.status !== 'skipped') {
      return false;
    }
  }

  return true;
}

export function transitionStatusToPhase(
  status: PrevcStatus,
  phase: PrevcPhase,
  now: string = new Date().toISOString()
): PrevcStatus {
  status.project.current_phase = phase;
  status.phases[phase] = {
    ...status.phases[phase],
    status: 'in_progress',
    started_at: now,
  };

  appendExecutionHistoryEntry(status, {
    phase,
    action: 'started',
  }, now);

  return status;
}

export function markStatusPhaseComplete(
  status: PrevcStatus,
  phase: PrevcPhase,
  outputs?: string[],
  now: string = new Date().toISOString()
): PrevcStatus {
  status.phases[phase] = {
    ...status.phases[phase],
    status: 'completed',
    completed_at: now,
    ...(outputs ? { outputs: toOutputStatuses(outputs) } : {}),
  };

  appendExecutionHistoryEntry(status, {
    phase,
    action: 'completed',
  }, now);

  return status;
}

export function completeStatusPhaseTransition(
  status: PrevcStatus,
  outputs?: string[],
  now: string = new Date().toISOString()
): PrevcPhase | null {
  const currentPhase = status.project.current_phase;
  const nextPhase = getNextPhaseForStatus(status);

  status.phases[currentPhase] = {
    ...status.phases[currentPhase],
    status: 'completed',
    completed_at: now,
    ...(outputs ? { outputs: toOutputStatuses(outputs) } : {}),
  };

  appendExecutionHistoryEntry(status, {
    phase: currentPhase,
    action: 'completed',
  }, now);

  if (!nextPhase) {
    return null;
  }

  status.project.current_phase = nextPhase;
  status.phases[nextPhase] = {
    ...status.phases[nextPhase],
    status: 'in_progress',
    started_at: status.phases[nextPhase].started_at || now,
  };

  appendExecutionHistoryEntry(status, {
    phase: nextPhase,
    action: 'started',
  }, now);

  return nextPhase;
}

export function applyWorkflowSettings(
  status: PrevcStatus,
  settings: Partial<WorkflowSettings>
): WorkflowSettings {
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

export function markPlanCreatedOnStatus(
  status: PrevcStatus,
  planSlug: string,
  now: string = new Date().toISOString()
): void {
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

export function approvePlanOnStatus(
  status: PrevcStatus,
  approver: PrevcRole | string,
  notes?: string,
  now: string = new Date().toISOString()
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

export function addHistoryEntry(
  status: PrevcStatus,
  entry: Omit<ExecutionHistoryEntry, 'timestamp'>,
  now: string = new Date().toISOString()
): void {
  appendExecutionHistoryEntry(status, entry, now);
}

export interface StepHistoryInput {
  action: 'step_started' | 'step_completed' | 'step_skipped';
  plan: string;
  planPhase: string;
  stepIndex: number;
  stepDescription?: string;
  output?: string;
  notes?: string;
}

export function addStepHistoryEntry(
  status: PrevcStatus,
  entry: StepHistoryInput,
  now: string = new Date().toISOString()
): void {
  appendExecutionHistoryEntry(
    status,
    {
      phase: status.project.current_phase,
      action: entry.action,
      plan: entry.plan,
      planPhase: entry.planPhase,
      stepIndex: entry.stepIndex,
      stepDescription: entry.stepDescription,
      output: entry.output,
      notes: entry.notes,
    },
    now,
    {
      phase: status.project.current_phase,
      action: entry.action,
      stepContext: {
        planPhase: entry.planPhase,
        stepIndex: entry.stepIndex,
        stepDescription: entry.stepDescription,
      },
    }
  );
}
