/**
 * MCP boundary exports.
 *
 * This module defines the protocol adapter surface that is expected to
 * become the future `dotcontext/mcp` package or adapter module.
 *
 * Dependency intent:
 * cli -> harness <- mcp
 */

export {
  AIContextMCPServer,
  startMCPServer,
  type MCPServerOptions,
} from '../services/mcp/mcpServer';

export {
  handleExplore,
  handleContext,
  handleSync,
  handlePlan,
  handleAgent,
  handleSkill,
  handleWorkflowInit,
  handleWorkflowStatus,
  handleWorkflowAdvance,
  handleWorkflowManage,
  type ExploreAction,
  type ContextAction,
  type SyncAction,
  type PlanAction,
  type AgentAction,
  type SkillAction,
  type ExploreParams,
  type ContextParams,
  type SyncParams,
  type PlanParams,
  type AgentParams,
  type SkillParams,
  type WorkflowInitParams,
  type WorkflowStatusParams,
  type WorkflowAdvanceParams,
  type WorkflowManageParams,
  type MCPToolResponse,
} from '../services/mcp/gatewayTools';
