/**
 * PREVC Workflow System
 *
 * Stable workflow barrel.
 *
 * Prefer direct imports for internal-only registries, guidance helpers,
 * collaboration infrastructure, and orchestration implementation details.
 */

// Types
export * from './types';

// Agent types (surfaced for MCP adapters)
export { AGENT_TYPES, type AgentType } from './orchestration/agentOrchestrator';

// Errors
export {
  WorkflowError,
  WorkflowGateError,
  NoPlanToApproveError,
  NoWorkflowError,
} from './errors';

// Gates
export {
  WorkflowGateChecker,
  createGateChecker,
  getDefaultSettings,
  GateCheckResult,
  GateStatus,
} from './gates';

// Roles
export {
  PREVC_ROLES,
  ROLE_DISPLAY_NAMES,
  ROLE_DISPLAY_NAMES_EN,
  ROLE_DISPLAY_NAMES_PT,
  isValidRole,
} from './roles';

// Phases
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

// Scaling
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

// Status Management
export { PrevcStatusManager } from './status/statusManager';

// Orchestrator
export {
  PrevcOrchestrator,
  WorkflowSummary,
  CompletePhaseOptions,
  InitWorkflowOptions,
} from './orchestrator';

// Plan Integration
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

// Skills
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
