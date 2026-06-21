/**
 * Cross-source invariants between plan execution tracking (JSON) and
 * workflow status (YAML/JSON projection).
 *
 * These checks run after `completePhase` persists both sources; divergence
 * implies one of the writers raced or silently failed and the harness must
 * stop rather than keep advancing on inconsistent state.
 */

import type { PrevcStatus } from '../types';
import type { PlanExecutionTracking } from './executionTypes';
import {
  WorkflowStateDesyncError,
  type PhaseStatusDivergence,
} from '../errors';

/**
 * Throw `WorkflowStateDesyncError` when any phase id present in both
 * `tracking.phases` and `status.phases` has mismatched status values.
 *
 * Phases that appear in only one source are ignored — tracking uses
 * plan-local ids (e.g. `phase-1`) whereas status uses PREVC letters
 * (`P`/`R`/...), so in most repos there is no overlap. The invariant
 * still protects callers that use matching keys and any future code
 * that projects one namespace into the other.
 */
export function assertPhaseStatusConverges(
  tracking: PlanExecutionTracking | null,
  status: PrevcStatus
): void {
  if (!tracking) {
    return;
  }

  const divergences: PhaseStatusDivergence[] = [];
  for (const [phaseId, trackingPhase] of Object.entries(tracking.phases)) {
    const statusPhase = (status.phases as Record<string, { status: string } | undefined>)[phaseId];
    if (!statusPhase) {
      continue;
    }
    if (trackingPhase.status !== statusPhase.status) {
      divergences.push({
        phaseId,
        trackingStatus: trackingPhase.status,
        statusStatus: statusPhase.status,
      });
    }
  }

  if (divergences.length > 0) {
    throw new WorkflowStateDesyncError(tracking.planSlug, divergences);
  }
}
