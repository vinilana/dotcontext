import { PREVC_PHASE_ORDER } from '../phases';
import { getDefaultSettings } from '../gates';
import {
  ExecutionAction,
  PrevcPhase,
  PrevcStatus,
} from '../types';
import { appendExecutionHistoryEntry } from './statusExecution';
import { generateResumeContext } from './templates';

interface ReconstructedEntry {
  timestamp: string;
  phase: PrevcPhase;
  action: Extract<ExecutionAction, 'started' | 'completed' | 'phase_skipped'>;
}

/**
 * Collect synthetic history entries from phase metadata.
 *
 * This is a best-effort reconstruction for legacy status documents that lack
 * an `execution.history` block. Real histories are always grown via
 * `appendExecutionHistoryEntry`; this helper exists only to seed one.
 */
function collectReconstructedEntries(
  status: PrevcStatus,
  now: string
): ReconstructedEntry[] {
  const entries: ReconstructedEntry[] = [];

  for (const phase of PREVC_PHASE_ORDER) {
    const phaseStatus = status.phases[phase];
    if (phaseStatus.started_at) {
      entries.push({
        timestamp: phaseStatus.started_at,
        phase,
        action: 'started',
      });
    }
    if (phaseStatus.completed_at) {
      entries.push({
        timestamp: phaseStatus.completed_at,
        phase,
        action: 'completed',
      });
    }
    if (phaseStatus.status === 'skipped') {
      entries.push({
        timestamp: now,
        phase,
        action: 'phase_skipped',
      });
    }
  }

  entries.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  return entries;
}

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
    const reconstructed = collectReconstructedEntries(status, now);

    // Initialize empty execution; appendExecutionHistoryEntry will populate
    // history, last_activity, and resume_context entry-by-entry.
    status.execution = {
      history: [],
      last_activity: now,
      resume_context: '',
    };

    if (reconstructed.length === 0) {
      appendExecutionHistoryEntry(
        status,
        {
          phase: currentPhase,
          action: 'started',
          description: 'Migrated from legacy workflow',
        },
        status.project.started || now
      );
    } else {
      for (const entry of reconstructed) {
        appendExecutionHistoryEntry(
          status,
          {
            phase: entry.phase,
            action: entry.action,
          },
          entry.timestamp
        );
      }
    }

    // The resume_context derived from the last appended entry may reflect the
    // final reconstructed step (e.g. a phase_skipped). Override with an
    // approval-aware context so callers see an accurate resume hint.
    let resumeContext = generateResumeContext(currentPhase, 'started');
    if (status.approval?.plan_approved) {
      resumeContext = generateResumeContext(currentPhase, 'plan_approved');
    } else if (status.approval?.plan_created) {
      resumeContext = generateResumeContext(currentPhase, 'plan_linked');
    }
    status.execution.resume_context = resumeContext;
  }

  return status;
}
