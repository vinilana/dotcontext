import { getNextActivePhase } from '../phases';
import {
  OutputStatus,
  PrevcPhase,
  PrevcStatus,
} from '../types';
import { appendExecutionHistoryEntry } from './statusExecution';

function toOutputStatuses(outputs?: string[]): OutputStatus[] | undefined {
  if (!outputs) {
    return undefined;
  }

  return outputs.map((outputPath) => ({
    path: outputPath,
    status: 'filled',
  }));
}

export function getNextPhaseForStatus(status: PrevcStatus): PrevcPhase | null {
  return getNextActivePhase(status.project.current_phase, status.phases);
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
