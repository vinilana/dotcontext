/**
 * PREVC Workflow Types
 *
 * Core type definitions for the PREVC workflow system:
 * P - Planning
 * R - Review
 * E - Execution
 * V - Validation
 * C - Confirmation
 */

/**
 * The five phases of the PREVC workflow
 */
export type PrevcPhase = 'P' | 'R' | 'E' | 'V' | 'C';

/**
 * Available roles in the PREVC workflow
 */
export type PrevcRole =
  | 'planner'
  | 'designer'
  | 'architect'
  | 'developer'
  | 'qa'
  | 'reviewer'
  | 'documenter'
  | 'solo-dev';

/**
 * Project scale levels for adaptive routing
 */
export enum ProjectScale {
  QUICK = 0, // Bug fixes, tweaks (~5 min)
  SMALL = 1, // Simple features (~15 min)
  MEDIUM = 2, // Medium features (~30 min)
  LARGE = 3, // Products, complex systems, compliance (~1+ hour)
}

/**
 * Status of a phase or role
 */
export type StatusType = 'pending' | 'in_progress' | 'completed' | 'skipped';

/**
 * Definition of a PREVC phase
 */
export interface PhaseDefinition {
  name: string;
  description: string;
  roles: PrevcRole[];
  outputs: string[];
  optional: boolean;
  order: number;
}

/**
 * Definition of a PREVC role
 */
export interface RoleDefinition {
  phase: PrevcPhase | PrevcPhase[];
  responsibilities: string[];
  outputs: string[];
  specialists: string[]; // Mapped agent types from existing system
}

/**
 * Scale route configuration
 */
export interface ScaleRoute {
  phases: PrevcPhase[];
  roles: PrevcRole[] | 'all';
  documents: string[] | 'all';
  skipReview?: boolean;
  extras?: string[];
}

/**
 * Phase status in the workflow
 */
export interface PhaseStatus {
  status: StatusType;
  started_at?: string;
  completed_at?: string;
  role?: PrevcRole;
  current_task?: string;
  reason?: string;
  outputs?: OutputStatus[];
}

/**
 * Output file status
 */
export interface OutputStatus {
  path: string;
  status: 'unfilled' | 'filled';
}

/**
 * Role status in the workflow
 * @deprecated Use AgentStatus instead
 */
export interface RoleStatus {
  status?: StatusType;
  last_active?: string;
  phase?: PrevcPhase;
  current_task?: string;
  outputs?: string[];
}

/**
 * Agent status in the workflow (replaces RoleStatus)
 */
export interface AgentStatus {
  status: StatusType;
  started_at?: string;
  completed_at?: string;
  outputs?: string[];
}

/**
 * Plan reference in workflow (lightweight)
 */
export interface WorkflowPlanRef {
  slug: string;
  path: string;
  status: 'active' | 'completed' | 'paused';
}

/**
 * Workflow settings for gate control
 */
export interface WorkflowSettings {
  /** Skip all gates and plan requirements */
  autonomous_mode: boolean;
  /** Require a linked plan before advancing P → R */
  require_plan: boolean;
  /** Require plan approval before advancing R → E */
  require_approval: boolean;
}

/**
 * Gate types for workflow phase transitions
 */
export type GateType = 'plan_required' | 'approval_required' | 'execution_evidence';

/**
 * Plan approval status tracking
 */
export interface PlanApproval {
  /** Whether a plan has been created/linked */
  plan_created: boolean;
  /** Whether the plan has been approved */
  plan_approved: boolean;
  /** Who approved the plan */
  approved_by?: PrevcRole | string;
  /** When the plan was approved */
  approved_at?: string;
  /** Optional notes from approver */
  approval_notes?: string;
}

/**
 * Execution history action types
 */
export type ExecutionAction =
  | 'started'
  | 'completed'
  | 'plan_linked'
  | 'plan_approved'
  | 'phase_skipped'
  | 'settings_changed'
  // Plan-level tracking actions
  | 'plan_phase_updated'
  | 'decision_recorded'
  // Step-level actions for breadcrumb tracking
  | 'step_started'
  | 'step_completed'
  | 'step_skipped';

/**
 * Entry in the execution history
 */
export interface ExecutionHistoryEntry {
  timestamp: string;
  phase: PrevcPhase;
  action: ExecutionAction;
  plan?: string;
  approved_by?: string;
  description?: string;
  // Step-level fields for breadcrumb tracking
  /** Plan phase ID (e.g., "phase-1") */
  planPhase?: string;
  /** 1-based step index within the plan phase */
  stepIndex?: number;
  /** Human-readable description of the step */
  stepDescription?: string;
  /** Output artifact from step completion */
  output?: string;
  /** Execution notes */
  notes?: string;
}

/**
 * Execution history tracking for workflow
 */
export interface ExecutionHistory {
  history: ExecutionHistoryEntry[];
  last_activity: string;
  resume_context: string;
}

/**
 * Project metadata in the workflow status
 */
export interface ProjectMetadata {
  name: string;
  scale: ProjectScale | keyof typeof ProjectScale;
  started: string;
  current_phase: PrevcPhase;
  /** Primary plan being executed */
  plan?: string;
  /** All linked plans */
  plans?: WorkflowPlanRef[];
  /** Workflow settings for gate control */
  settings?: WorkflowSettings;
}

/**
 * Complete workflow status structure (stored canonically in harness workflow state)
 */
export interface PrevcStatus {
  project: ProjectMetadata;
  phases: Record<PrevcPhase, PhaseStatus>;
  /** Execution history (replaces roles) */
  execution?: ExecutionHistory;
  /** Agent status tracking (replaces roles) */
  agents: Record<string, AgentStatus>;
  /** Legacy roles - kept for backward compatibility */
  roles: Partial<Record<PrevcRole, RoleStatus>>;
  /** Plan approval tracking */
  approval?: PlanApproval;
}

/**
 * Context for project analysis and scale detection
 */
export interface ProjectContext {
  name: string;
  description: string;
  files?: string[];
  complexity?: 'low' | 'medium' | 'high';
  hasCompliance?: boolean;
}

/**
 * Update payload for phase status
 */
export interface PhaseUpdate {
  status?: StatusType;
  role?: PrevcRole;
  current_task?: string;
  outputs?: OutputStatus[];
}

/**
 * Update payload for role status
 * @deprecated Use AgentUpdate instead
 */
export interface RoleUpdate {
  status?: StatusType;
  phase?: PrevcPhase;
  current_task?: string;
  outputs?: string[];
  last_active?: string;
}

/**
 * Update payload for agent status (replaces RoleUpdate)
 */
export interface AgentUpdate {
  status?: StatusType;
  outputs?: string[];
}

/**
 * Contribution in a collaboration session
 */
export interface Contribution {
  role: PrevcRole;
  message: string;
  timestamp: Date;
}

/**
 * Status of a collaboration session
 */
export interface CollaborationStatus {
  id: string;
  topic: string;
  participants: PrevcRole[];
  started: Date;
  status: 'active' | 'synthesizing' | 'concluded';
}

/**
 * Synthesis result from a collaboration session
 */
export interface CollaborationSynthesis {
  topic: string;
  participants: PrevcRole[];
  contributions: Contribution[];
  decisions: string[];
  recommendations: string[];
}

/**
 * Suggested agent step in orchestration sequence
 */
export interface AgentSequenceStep {
  agent: string;
  task: string;
}

/**
 * Skill suggestion for orchestration
 */
export interface SkillSuggestion {
  slug: string;
  name: string;
  description: string;
  path: string;
  isBuiltIn: boolean;
}

/**
 * Tool usage guidance for explicit agent orchestration
 */
export interface ToolGuidance {
  /** Example agent discovery tool call */
  discoverExample: string;
  /** Example agent sequence tool call */
  sequenceExample: string;
  /** Example handoff tool call */
  handoffExample: string;
}

/**
 * Phase orchestration guidance for agent-based workflows
 */
export interface PhaseOrchestration {
  /** Recommended agents for this phase */
  recommendedAgents: string[];
  /** Suggested sequence of agents with tasks */
  suggestedSequence: AgentSequenceStep[];
  /** Agent to start with */
  startWith: string;
  /** Instruction for starting the phase */
  instruction: string;
  /** Recommended skills for this phase */
  recommendedSkills?: SkillSuggestion[];
  /** Explicit tool usage guidance for agent orchestration */
  toolGuidance?: ToolGuidance;
  /** Step-by-step orchestration instructions with tool calls */
  orchestrationSteps?: string[];
}
