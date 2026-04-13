/**
 * Plan Execution Tracking Types
 *
 * The tracking JSON under `.context/workflow/plan-tracking/{slug}.json` is the
 * canonical runtime source of truth. Markdown files are read-only projections.
 * These types describe the tracking document; document-shape types live in
 * `types.ts`.
 */

import { StatusType } from '../types';
import { PlanDecision } from './types';

/** Individual step execution tracking */
export interface StepExecution {
  stepIndex: number;
  description: string;
  deliverables?: string[];
  status: StatusType;
  startedAt?: string;
  completedAt?: string;
  output?: string;
  notes?: string;
}

/** Enhanced phase tracking with step-level detail */
export interface PlanPhaseTracking {
  phaseId: string;
  status: StatusType;
  startedAt?: string;
  completedAt?: string;
  steps: StepExecution[];
  commitHash?: string;
  commitShortHash?: string;
  committedAt?: string;
  committedBy?: string;
}

/**
 * Canonical plan execution tracking record.
 * Stored in `.context/workflow/plan-tracking/{slug}.json`.
 */
export interface PlanExecutionTracking {
  planSlug: string;
  linkedAt: string;
  progress: number;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvedAt?: string;
  approvedBy?: string;
  phases: Record<string, PlanPhaseTracking>;
  decisions: PlanDecision[];
  lastUpdated: string;
}
