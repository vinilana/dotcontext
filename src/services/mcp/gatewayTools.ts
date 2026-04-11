/**
 * Gateway Tools
 *
 * Re-exports all gateway handlers, types, and response utilities from the
 * modular gateway directory. This file provides backward compatibility
 * while the actual implementation is split into focused modules.
 *
 * Note: Project tools (project-setup, project-report) have been removed.
 * Use context({ action: "init" }) for scaffolding and workflow-init for workflows.
 *
 * @module gatewayTools
 * @see {@link ./gateway/index.ts} for the modular implementation
 */

// Re-export everything from the gateway module
export {
  // Response types and helpers
  type MCPToolResponse,
  createJsonResponse,
  createErrorResponse,
  createTextResponse,

  // Shared utilities
  minimalUI,
  mockTranslate,
  toolContext,

  // Action types
  type ExploreAction,
  type ContextAction,
  type SyncAction,
  type PlanAction,
  type AgentAction,
  type SkillAction,
  type HarnessAction,

  // Parameter types
  type ExploreParams,
  type ContextParams,
  type SyncParams,
  type PlanParams,
  type AgentParams,
  type SkillParams,
  type HarnessParams,

  // Consolidated gateway handlers
  handleExplore,
  handleContext,
  handleSync,
  handlePlan,
  handleAgent,
  handleSkill,
  handleHarness,

  // Dedicated workflow handlers
  handleWorkflowInit,
  handleWorkflowStatus,
  handleWorkflowAdvance,
  handleWorkflowManage,

  // Options types
  type ExploreOptions,
  type ContextOptions,
  type SyncOptions,
  type PlanOptions,
  type AgentOptions,
  type SkillOptions,
  type HarnessOptions,

  // Dedicated workflow handler types
  type WorkflowInitParams,
  type WorkflowStatusParams,
  type WorkflowAdvanceParams,
  type WorkflowManageParams,
  type WorkflowInitOptions,
  type WorkflowStatusOptions,
  type WorkflowAdvanceOptions,
  type WorkflowManageOptions,
} from './gateway';
