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

/**
 * Executable acceptance predicate for a step. When present, the harness runs
 * this command before allowing the step to transition into `completed`. A
 * non-zero exit code rejects the transition.
 *
 * Shell safety: `command` is always an array and is spawned with `shell:false`.
 * The first element is the executable; the rest are literal argv entries. No
 * shell interpolation is performed. This shape was chosen over a single
 * string to eliminate the ambiguity that leads to shell injection.
 */
export interface StepAcceptanceSpec {
  kind: 'shell';
  command: string[];
  timeoutMs?: number;
  workingDir?: string;
}

/** Result of executing a step acceptance predicate. */
export interface StepAcceptanceRun {
  ran_at: number;
  passed: boolean;
  exitCode: number | null;
  tailStdout: string;
  tailStderr: string;
  durationMs: number;
  timedOut: boolean;
}

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
  acceptance?: StepAcceptanceSpec;
  acceptanceRun?: StepAcceptanceRun;
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
