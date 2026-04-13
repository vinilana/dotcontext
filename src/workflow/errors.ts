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
