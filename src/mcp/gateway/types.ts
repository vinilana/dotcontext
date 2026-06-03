/**
 * Gateway Tool Types
 *
 * Type definitions for MCP gateway tool parameters and responses.
 *
 * Note: Some gateways use dedicated tools instead of action-based routing:
 * - Workflow: Split into workflow-init, workflow-status, workflow-advance, workflow-manage
 * - Project: Removed - use context init + workflow-init instead
 */

import type {
  HarnessAgentAction as RuntimeHarnessAgentAction,
  HarnessAgentActionInput,
  HarnessAction as RuntimeHarnessAction,
  HarnessActionInput,
  HarnessContextAction as RuntimeHarnessContextAction,
  HarnessContextActionInput,
  HarnessExploreAction as RuntimeHarnessExploreAction,
  HarnessExploreActionInput,
  HarnessPlanAction as RuntimeHarnessPlanAction,
  HarnessPlanActionInput,
  HarnessSkillAction as RuntimeHarnessSkillAction,
  HarnessSkillActionInput,
  HarnessSyncAction as RuntimeHarnessSyncAction,
  HarnessSyncActionInput,
} from '../../harness';

// Action types for each gateway
// Note: Workflow uses dedicated tools (workflow-init, workflow-status, workflow-advance, workflow-manage)
// Note: Project tools removed - use context init + workflow-init instead
export type ExploreAction = RuntimeHarnessExploreAction;
export type ContextAction = RuntimeHarnessContextAction;
export type SyncAction = RuntimeHarnessSyncAction;
export type PlanAction = RuntimeHarnessPlanAction;
export type AgentAction = RuntimeHarnessAgentAction;
export type SkillAction = RuntimeHarnessSkillAction;
export type HarnessAction = RuntimeHarnessAction;

// Parameter interfaces for each gateway
export interface ExploreParams extends HarnessExploreActionInput {}

export interface ContextParams extends HarnessContextActionInput {}

// Note: WorkflowParams removed - workflow uses dedicated tools with their own param types
// Note: ProjectParams removed - project tools have been removed from MCP

export interface SyncParams extends HarnessSyncActionInput {}

export interface PlanParams extends HarnessPlanActionInput {}

export interface AgentParams extends HarnessAgentActionInput {}

export interface SkillParams extends HarnessSkillActionInput {}

export interface HarnessParams extends HarnessActionInput {}
