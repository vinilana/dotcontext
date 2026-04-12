import { PREVC_PHASE_ORDER } from '../phases';
import { getDefaultSettings } from '../gates';
import {
  ExecutionHistoryEntry,
  PrevcStatus,
} from '../types';
import { generateResumeContext } from './templates';

/**
 * Normalize legacy or partially initialized workflow state into the canonical shape.
 */
export function migrateLegacyStatus(
  status: PrevcStatus,
  now: string = new Date().toISOString()
): PrevcStatus {
  if (!status.project.settings) {
    status.project.settings = getDefaultSettings(status.project.scale);
  }

  if (!status.agents) {
    status.agents = {};
  }

  if (!status.roles) {
    status.roles = {};
  }

  if (!status.approval) {
    const hasPlan = Boolean(
      status.project.plan || (status.project.plans && status.project.plans.length > 0)
    );
    const isPastReview =
      ['E', 'V', 'C'].includes(status.project.current_phase) ||
      status.phases.R?.status === 'completed';

    status.approval = {
      plan_created: hasPlan,
      plan_approved: isPastReview,
      approved_by: isPastReview ? 'system-migration' : undefined,
      approved_at: isPastReview ? now : undefined,
    };
  }

  if (!status.execution) {
    const currentPhase = status.project.current_phase;
    const history: ExecutionHistoryEntry[] = [];

    for (const phase of PREVC_PHASE_ORDER) {
      const phaseStatus = status.phases[phase];
      if (phaseStatus.started_at) {
        history.push({
          timestamp: phaseStatus.started_at,
          phase,
          action: 'started',
        });
      }
      if (phaseStatus.completed_at) {
        history.push({
          timestamp: phaseStatus.completed_at,
          phase,
          action: 'completed',
        });
      }
      if (phaseStatus.status === 'skipped') {
        history.push({
          timestamp: now,
          phase,
          action: 'phase_skipped',
        });
      }
    }

    history.sort((left, right) => left.timestamp.localeCompare(right.timestamp));

    let resumeContext = generateResumeContext(currentPhase, 'started');
    if (status.approval?.plan_approved) {
      resumeContext = generateResumeContext(currentPhase, 'plan_approved');
    } else if (status.approval?.plan_created) {
      resumeContext = generateResumeContext(currentPhase, 'plan_linked');
    }

    status.execution = {
      history: history.length > 0
        ? history
        : [{
            timestamp: status.project.started || now,
            phase: currentPhase,
            action: 'started',
            description: 'Migrated from legacy workflow',
          }],
      last_activity: history.length > 0 ? history[history.length - 1].timestamp : now,
      resume_context: resumeContext,
    };
  }

  return status;
}
