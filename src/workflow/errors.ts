/**
 * PREVC Workflow Errors
 *
 * Custom error types for workflow gate violations and other workflow errors.
 */

import { PrevcPhase, GateType } from './types';

/**
 * Base workflow error
 */
export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowError';
  }
}

/**
 * Error thrown when a workflow gate blocks phase advancement
 */
export class WorkflowGateError extends WorkflowError {
  /** The phase transition being blocked */
  readonly transition: { from: PrevcPhase; to: PrevcPhase };
  /** The gate that blocked the transition */
  readonly gate: GateType;
  /** Hint for resolving the error */
  readonly hint: string;

  constructor(options: {
    message: string;
    transition: { from: PrevcPhase; to: PrevcPhase };
    gate: GateType;
    hint: string;
  }) {
    super(options.message);
    this.name = 'WorkflowGateError';
    this.transition = options.transition;
    this.gate = options.gate;
    this.hint = options.hint;
  }
}

/**
 * Error thrown when plan markdown sync fails during a phase transition.
 * Intentionally bubbles up (instead of being swallowed) so divergence between
 * tracking JSON, status YAML, and plan markdown can't go unnoticed.
 */
export class WorkflowSyncError extends WorkflowError {
  readonly planSlug: string;
  readonly cause?: Error;

  constructor(planSlug: string, cause?: Error) {
    super(
      `Failed to sync plan markdown for "${planSlug}": ${cause?.message ?? 'unknown error'}`
    );
    this.name = 'WorkflowSyncError';
    this.planSlug = planSlug;
    this.cause = cause;
  }
}

/**
 * Reported divergence between a plan tracking phase and the workflow status
 * phase for the same phase id. Each entry describes one phase where the two
 * sources disagree.
 */
export interface PhaseStatusDivergence {
  phaseId: string;
  trackingStatus: string;
  statusStatus: string;
}

/**
 * Error thrown when the post-transition cross-source invariant between
 * plan tracking (`PlanExecutionTracking.phases[id].status`) and workflow
 * status (`PrevcStatus.phases[id].status`) does not hold. Callers should
 * treat this as a hard failure: the two stores are out of sync and the
 * workflow cannot safely advance until reconciled.
 */
export class WorkflowStateDesyncError extends WorkflowError {
  readonly planSlug: string;
  readonly divergences: PhaseStatusDivergence[];

  constructor(planSlug: string, divergences: PhaseStatusDivergence[]) {
    const diffText = divergences
      .map((d) => `${d.phaseId}: tracking=${d.trackingStatus} status=${d.statusStatus}`)
      .join('; ');
    super(
      `Workflow state desync for plan "${planSlug}": ${diffText}`
    );
    this.name = 'WorkflowStateDesyncError';
    this.planSlug = planSlug;
    this.divergences = divergences;
  }
}

/**
 * Error thrown when trying to approve a plan that doesn't exist
 */
export class NoPlanToApproveError extends WorkflowError {
  constructor(message = 'No plan is linked to approve. Link a plan first using linkPlan.') {
    super(message);
    this.name = 'NoPlanToApproveError';
  }
}

/**
 * Error thrown when no workflow exists
 */
export class NoWorkflowError extends WorkflowError {
  constructor(message = 'No workflow found. Run workflowInit first.') {
    super(message);
    this.name = 'NoWorkflowError';
  }
}
