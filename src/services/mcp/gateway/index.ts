/**
 * Gateway Tools Module
 *
 * Exports all gateway handlers, types, and response utilities.
 * This module consolidates tools into 9 MCP tools (5 gateways + 4 dedicated workflow tools).
 *
 * Note: Project tools (project-setup, project-report) have been removed.
 * Use context({ action: "init" }) for scaffolding and workflow-init for workflows instead.
 */

// Response types and helpers
export {
  type MCPToolResponse,
  createJsonResponse,
  createErrorResponse,
  createTextResponse,
} from './response';

export {
  type ResponseMode,
  type MCPClientProfile,
  type ResolvedResponsePreferences,
  type PhaseExecutionBundle,
  type CompactWorkflowState,
  executionStateCache,
  resolveResponsePreferences,
  normalizeClientProfile,
  createHelpResourceRef,
} from './runtime';

// Shared utilities
export { minimalUI, mockTranslate, toolContext } from './shared';

// Type definitions
export type {
  ExploreAction,
  ContextAction,
  SyncAction,
  PlanAction,
  AgentAction,
  SkillAction,
  ExploreParams,
  ContextParams,
  SyncParams,
  PlanParams,
  AgentParams,
  SkillParams,
} from './types';

// Consolidated gateway handlers
export { handleExplore, type ExploreOptions } from './explore';
export { handleContext, type ContextOptions } from './context';

// Dedicated workflow handlers (split from consolidated gateway)
export { handleWorkflowInit, type WorkflowInitParams, type WorkflowInitOptions } from './workflowInit';
export { handleWorkflowStatus, type WorkflowStatusParams, type WorkflowStatusOptions } from './workflowStatus';
export { handleWorkflowAdvance, type WorkflowAdvanceParams, type WorkflowAdvanceOptions } from './workflowAdvance';
export { handleWorkflowManage, type WorkflowManageParams, type WorkflowManageOptions } from './workflowManage';

export { handleSync, type SyncOptions } from './sync';
export { handlePlan, type PlanOptions } from './plan';
export { handleAgent, type AgentOptions } from './agent';
export { handleSkill, type SkillOptions } from './skill';

// Metrics
export {
  handleMetricsAction,
  recordContextQuery,
  recordFileRead,
  getMetrics,
  getMetricsSummary,
  resetMetrics,
  type SessionMetrics,
  type MetricsSummary,
} from './metrics';
