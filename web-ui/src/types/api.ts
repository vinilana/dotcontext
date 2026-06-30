/**
 * Types for the `/api/*` contract documented in
 * `.context/docs/web-interface-architecture.md` (section 4). These mirror the
 * `src/harness` application-service response shapes the backend (`src/web`)
 * wraps directly, kept intentionally close to that contract rather than to
 * any one service's internal types -- the contract document is authoritative.
 */

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiFailure {
  error: { message: string };
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

// ---------------------------------------------------------------------------
// 4.1 Docs
// ---------------------------------------------------------------------------

export interface DocSummary {
  name: string;
  title: string;
  description?: string;
  category?: string;
  status: 'filled' | 'unfilled';
}

export interface DocContent {
  name: string;
  frontMatter: Record<string, unknown>;
  content: string;
}

// ---------------------------------------------------------------------------
// 4.2 Skills
// ---------------------------------------------------------------------------

export interface SkillSummary {
  slug: string;
  name: string;
  description: string;
  phases: string[];
  isBuiltIn: boolean;
  content?: string;
}

export interface SkillsListResult {
  success: boolean;
  totalSkills?: number;
  builtInCount: number;
  customCount: number;
  skills: {
    builtIn: SkillSummary[];
    custom: SkillSummary[];
  };
}

export interface SkillContentResult {
  success: boolean;
  error?: string;
  skill?: {
    slug: string;
    name?: string;
    description?: string;
    phases?: string[];
    isBuiltIn?: boolean;
  };
  content?: string;
}

// ---------------------------------------------------------------------------
// 4.3 Agents
// ---------------------------------------------------------------------------

export interface AgentsDiscoverResult {
  success: boolean;
  totalAgents: number;
  builtInCount: number;
  customCount: number;
  agents: {
    builtIn: string[];
    custom: Array<{ type: string; path: string }>;
  };
}

export interface AgentDocRef {
  type: string;
  title: string;
  path: string;
  description?: string;
}

export interface AgentDetailResult {
  info: {
    success: boolean;
    agent?: Record<string, unknown>;
  };
  docs: {
    agent: string;
    description?: string;
    documentation: AgentDocRef[];
  };
}

// ---------------------------------------------------------------------------
// 4.4 Sessions
// ---------------------------------------------------------------------------

export type HarnessSessionStatus = 'active' | 'paused' | 'completed' | 'failed';
export type HarnessTraceLevel = 'debug' | 'info' | 'warn' | 'error';
export type HarnessArtifactKind = 'text' | 'json' | 'file';

export interface HarnessSessionCheckpoint {
  id: string;
  note?: string;
  data?: unknown;
  artifactIds: string[];
  createdAt: string;
}

export interface HarnessSessionRecord {
  id: string;
  name: string;
  status: HarnessSessionStatus;
  repoPath: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  completedAt?: string;
  failedAt?: string;
  lastTraceAt?: string;
  lastCheckpointAt?: string;
  traceCount: number;
  artifactCount: number;
  checkpointCount: number;
  checkpoints: HarnessSessionCheckpoint[];
  metadata?: Record<string, unknown>;
}

export interface HarnessTraceRecord {
  id: string;
  sessionId: string;
  level: HarnessTraceLevel;
  event: string;
  message: string;
  createdAt: string;
  data?: Record<string, unknown>;
}

export interface HarnessArtifactRecord {
  id: string;
  sessionId: string;
  name: string;
  kind: HarnessArtifactKind;
  createdAt: string;
  content?: unknown;
  path?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 4.5 Workflow
// ---------------------------------------------------------------------------

export type PrevcPhase = 'P' | 'R' | 'E' | 'V' | 'C';
export type StatusType = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface OutputStatus {
  path: string;
  status: 'unfilled' | 'filled';
}

export interface PhaseStatus {
  status: StatusType;
  started_at?: string;
  completed_at?: string;
  role?: string;
  current_task?: string;
  reason?: string;
  outputs?: OutputStatus[];
}

export interface AgentStatus {
  status: StatusType;
  started_at?: string;
  completed_at?: string;
  outputs?: string[];
}

export interface PlanApproval {
  plan_created: boolean;
  plan_approved: boolean;
  approved_by?: string;
  approved_at?: string;
  approval_notes?: string;
}

export interface ProjectMetadata {
  name: string;
  scale?: string;
  [key: string]: unknown;
}

export interface PrevcStatus {
  project: ProjectMetadata;
  phases: Record<PrevcPhase, PhaseStatus>;
  agents: Record<string, AgentStatus>;
  roles?: Record<string, unknown>;
  approval?: PlanApproval;
}

export interface WorkflowSummary {
  name: string;
  scale: string;
  currentPhase: PrevcPhase;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  isComplete: boolean;
  startedAt: string;
}

export interface WorkflowStatusResult {
  status: PrevcStatus | null;
  summary: WorkflowSummary | null;
}

export type WorkflowGuideIntent = 'session_start' | 'pre_edit' | 'post_edit' | 'session_end' | 'explicit';

export interface WorkflowGuideSkillRef {
  slug: string;
  name: string;
  description: string;
  path?: string;
  isBuiltIn?: boolean;
}

export interface WorkflowGuideDecision {
  allow: boolean;
  block?: boolean;
  reason?: string;
  requires?: string[];
}

export interface WorkflowGuideResult {
  workflow: {
    active: boolean;
    name?: string;
    phase?: PrevcPhase;
    scale?: string;
  };
  context: {
    initialized: boolean;
    enabled?: string[];
  };
  nextSteps: string[];
  skills: WorkflowGuideSkillRef[];
  decision: WorkflowGuideDecision;
  excerpt: string;
}

export interface PlanReference {
  slug: string;
  path: string;
  title: string;
  summary?: string;
  linkedAt: string;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  approval_status?: 'pending' | 'approved' | 'rejected';
  approved_at?: string;
  approved_by?: string;
}

export interface WorkflowPlansResult {
  success: boolean;
  plans: {
    active: PlanReference[];
    completed: PlanReference[];
    primary?: string;
  };
}

export interface PlanStep {
  order: number;
  description: string;
  assignee?: string;
  deliverables?: string[];
  status: StatusType;
  outputs?: string[];
  completedAt?: string;
}

export interface PlanPhase {
  id: string;
  name: string;
  prevcPhase: PrevcPhase;
  prevcPhaseName?: string;
  summary?: string;
  deliverables?: string[];
  steps: PlanStep[];
  status: StatusType;
  commitCheckpoint?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface PlanDecision {
  id: string;
  title: string;
  description: string;
  decidedBy?: string;
  decidedAt?: string;
  phase?: PrevcPhase;
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded';
  alternatives?: string[];
  consequences?: string[];
}

export interface LinkedPlanDetails {
  ref: PlanReference;
  phases: PlanPhase[];
  decisions: PlanDecision[];
  risks: unknown[];
  agents: string[];
  agentLineup: Array<{ type: string; role?: string }>;
  docs: string[];
  progress: number;
  currentPhase?: string;
}

export interface WorkflowPlanDetailsResult {
  success: boolean;
  error?: string;
  plan?: LinkedPlanDetails;
}

export interface WorkflowHarnessBinding {
  workflowName: string;
  sessionId: string;
  activeTaskId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessSensorRun {
  id: string;
  sensorId: string;
  sessionId: string;
  contractId?: string;
  status: 'passed' | 'warning' | 'failed' | 'skipped' | string;
  summary: string;
  evidence?: string[];
  severity: 'info' | 'warning' | 'blocking' | string;
  blocking: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface HarnessTaskContract {
  id: string;
  title: string;
  description?: string;
  sessionId?: string;
  owner?: string;
  status: 'draft' | 'ready' | 'in_progress' | 'blocked' | 'completed' | 'failed';
  inputs: string[];
  expectedOutputs: string[];
  acceptanceCriteria: string[];
  requiredSensors: string[];
  requiredArtifacts: unknown[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface HarnessHandoffContract {
  id: string;
  from: string;
  to: string;
  sessionId?: string;
  taskId?: string;
  artifacts: string[];
  evidence: string[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowHarnessStatus {
  binding: WorkflowHarnessBinding;
  session: HarnessSessionRecord;
  availableSensors: Array<{ id: string; name: string; description?: string }>;
  sensorRuns: HarnessSensorRun[];
  taskContracts: HarnessTaskContract[];
  handoffs: HarnessHandoffContract[];
  policyRules: number;
  completionCheck: {
    blocked: boolean;
    reasons: string[];
    taskCompletion: {
      canComplete: boolean;
      missingSensors: string[];
      missingArtifacts: string[];
      blockingFindings: string[];
    } | null;
  };
}

// ---------------------------------------------------------------------------
// 4.6 Live updates (SSE)
// ---------------------------------------------------------------------------

export interface RuntimeChangeEvent {
  paths: string[];
}
