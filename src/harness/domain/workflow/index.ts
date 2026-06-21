/**
 * PREVC Workflow System
 *
 * Stable workflow barrel.
 */

export * from './types';

export { AGENT_TYPES, type AgentType } from './orchestration/agentOrchestrator';

export {
  WorkflowError,
  WorkflowGateError,
  WorkflowSyncError,
  WorkflowStateDesyncError,
  NoPlanToApproveError,
  NoWorkflowError,
} from './errors';
export type { PhaseStatusDivergence } from './errors';

export {
  WorkflowGateChecker,
  createGateChecker,
  getDefaultSettings,
  GateCheckResult,
  GateStatus,
} from './gates';

export {
  PREVC_ROLES,
  ROLE_DISPLAY_NAMES,
  ROLE_DISPLAY_NAMES_EN,
  ROLE_DISPLAY_NAMES_PT,
  isValidRole,
} from './roles';

export {
  PREVC_PHASE_ORDER,
  PREVC_PHASES,
  PHASE_NAMES_EN,
  PHASE_NAMES_PT,
  getPhaseDefinition,
  getNextPhase,
  getNextActivePhase,
  getPreviousPhase,
  isPhaseOptional,
  getRolesForPhase,
  getOutputsForPhase,
  isValidPhase,
  getPhaseOrder,
} from './phases';

export { ProjectScale } from './types';
export {
  SCALE_ROUTES,
  detectProjectScale,
  getScaleRoute,
  getPhasesForScale,
  getRolesForScale,
  isPhaseRequiredForScale,
  getScaleName,
  getScaleFromName,
  getEstimatedTime,
} from './scaling';

export { PrevcStatusManager } from './status/statusManager';

export {
  PrevcOrchestrator,
  WorkflowSummary,
  CompletePhaseOptions,
  InitWorkflowOptions,
} from './orchestrator';

export {
  PlanLinker,
  createPlanLinker,
  PlanReference,
  LinkedPlan,
  PlanPhase,
  PlanStep,
  PlanDecision,
  PlanRisk,
  WorkflowPlans,
  AgentLineupEntry,
  PLAN_PHASE_TO_PREVC,
  AcceptanceFailedError,
} from './plans';

export {
  Skill,
  SkillMetadata,
  SkillReference,
  DiscoveredSkills,
  BUILT_IN_SKILLS,
  BuiltInSkillType,
  isBuiltInSkill,
  SKILL_TO_PHASES,
  SkillRegistry,
  createSkillRegistry,
  getBuiltInSkillTemplates,
  generateFrontmatter,
  generatePortableFrontmatter,
  wrapWithFrontmatter,
  wrapWithPortableFrontmatter,
  parseFrontmatter,
} from './skills';
