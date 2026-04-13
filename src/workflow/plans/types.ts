/**
 * Plan-Workflow Integration Types
 *
 * Types for linking implementation plans to the PREVC workflow system.
 * Plans provide the "what" and "how", workflow provides the "when" and tracking.
 */

import { PrevcPhase, PrevcRole, StatusType } from '../types';

/**
 * Keyword-based mapping from plan-local phase names to PREVC phases.
 * Re-exported here for compatibility; canonical definition lives in
 * `src/workflow/phases.ts`.
 */
export { PLAN_PHASE_TO_PREVC } from '../phases';

/**
 * Reference to a plan file
 */
export interface PlanReference {
  /** Slug/identifier of the plan */
  slug: string;
  /** Path to the plan file relative to .context */
  path: string;
  /** Display title */
  title: string;
  /** Brief summary */
  summary?: string;
  /** When the plan was linked */
  linkedAt: string;
  /** Plan status */
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  /** Approval status for workflow gates */
  approval_status?: 'pending' | 'approved' | 'rejected';
  /** When the plan was approved */
  approved_at?: string;
  /** Who approved the plan */
  approved_by?: string;
}

/**
 * Step within a plan phase
 */
export interface PlanStep {
  /** Step number within the phase */
  order: number;
  /** Step description */
  description: string;
  /** Assigned role/owner */
  assignee?: PrevcRole | string;
  /** Deliverables expected from this step */
  deliverables?: string[];
  /** Step status */
  status: StatusType;
  /** Output artifacts produced */
  outputs?: string[];
  /** Completion timestamp */
  completedAt?: string;
}

/**
 * Execution evidence requirements declared by a plan phase.
 *
 * These requirements populate the `requiredSensors` and `requiredArtifacts`
 * fields of the derived harness task contract for the corresponding PREVC
 * phase. The `execution_evidence` gate (E -> V) consults the task contract to
 * decide whether execution has actually happened; declaring requirements on a
 * plan phase is the canonical way to make that gate meaningful.
 */
export interface PlanPhaseRequirements {
  /** Sensor ids that must have `status==='passed'` in the session */
  requiredSensors: string[];
  /** Artifact names/paths that must have been recorded in the session */
  requiredArtifacts: string[];
}

/**
 * Phase within a plan (maps to PREVC phases)
 */
export interface PlanPhase {
  /** Phase identifier (e.g., "phase-1", "discovery") */
  id: string;
  /** Display name */
  name: string;
  /** Mapped PREVC phase */
  prevcPhase: PrevcPhase;
  /** Optional canonical phase summary/objective */
  summary?: string;
  /** Deliverables expected from the overall phase */
  deliverables?: string[];
  /** Steps in this phase */
  steps: PlanStep[];
  /** Phase status */
  status: StatusType;
  /** Commit checkpoint message */
  commitCheckpoint?: string;
  /** Start timestamp */
  startedAt?: string;
  /** Completion timestamp */
  completedAt?: string;
  /**
   * Execution evidence required for this phase. Populated from plan
   * frontmatter (`required_sensors` / `required_artifacts`) and fed into the
   * derived task contract by `DerivedPlanTaskContractBuilder`.
   */
  requirements?: PlanPhaseRequirements;
}

/**
 * Decision record within a plan
 */
export interface PlanDecision {
  /** Decision identifier */
  id: string;
  /** Decision title */
  title: string;
  /** Decision description/rationale */
  description: string;
  /** Who made the decision */
  decidedBy?: PrevcRole | string;
  /** When the decision was made */
  decidedAt?: string;
  /** Related PREVC phase */
  phase?: PrevcPhase;
  /** Status: proposed, accepted, rejected, superseded */
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded';
  /** Alternatives considered */
  alternatives?: string[];
  /** Consequences of this decision */
  consequences?: string[];
}

/**
 * Risk entry within a plan
 */
export interface PlanRisk {
  /** Risk identifier */
  id: string;
  /** Risk description */
  description: string;
  /** Probability: low, medium, high */
  probability: 'low' | 'medium' | 'high';
  /** Impact: low, medium, high */
  impact: 'low' | 'medium' | 'high';
  /** Mitigation strategy */
  mitigation?: string;
  /** Owner responsible for mitigation */
  owner?: PrevcRole | string;
  /** Current status */
  status: 'identified' | 'mitigated' | 'occurred' | 'closed';
}

/**
 * Agent lineup entry with role description
 */
export interface AgentLineupEntry {
  /** Agent type identifier */
  type: string;
  /** Role/responsibility in this plan */
  role?: string;
}

/**
 * Complete plan structure linked to workflow
 */
export interface LinkedPlan {
  /** Plan reference info */
  ref: PlanReference;
  /** Plan phases with PREVC mapping */
  phases: PlanPhase[];
  /** Key decisions made during planning */
  decisions: PlanDecision[];
  /** Identified risks */
  risks: PlanRisk[];
  /** Agents involved in this plan (simple list) */
  agents: string[];
  /** Full agent lineup with roles (from frontmatter) */
  agentLineup: AgentLineupEntry[];
  /** Documentation touchpoints */
  docs: string[];
  /** Overall progress percentage */
  progress: number;
  /** Current active phase */
  currentPhase?: string;
}

/**
 * Plan tracking in workflow status
 */
export interface WorkflowPlans {
  /** Currently active plans */
  active: PlanReference[];
  /** Completed plans */
  completed: PlanReference[];
  /** Current primary plan (if any) */
  primary?: string;
}

/**
 * Plan-workflow sync event
 */
export interface PlanSyncEvent {
  /** Event type */
  type: 'plan_linked' | 'plan_updated' | 'phase_completed' | 'decision_made' | 'risk_updated';
  /** Plan slug */
  planSlug: string;
  /** Affected PREVC phase */
  phase?: PrevcPhase;
  /** Event timestamp */
  timestamp: string;
  /** Event details */
  details?: Record<string, unknown>;
}

// Tracking types (runtime canonical state) live in executionTypes.ts and are
// re-exported here for backwards compatibility with existing importers.
export type {
  StepExecution,
  PlanPhaseTracking,
  PlanExecutionTracking,
} from './executionTypes';
