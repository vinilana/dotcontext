/**
 * MCP transport adapter exports.
 *
 * Keep this surface focused on the protocol adapter that exposes harness
 * capabilities over Model Context Protocol. CLI-side installation flows live
 * under src/services/cli/.
 */

export { AIContextMCPServer, startMCPServer, type MCPServerOptions } from './mcpServer';

// Consolidated gateway tool handlers
export {
  handleExplore,
  handleContext,
  handleSync,
  handlePlan,
  handleAgent,
  handleSkill,
} from './gatewayTools';

// Dedicated workflow tool handlers
export {
  handleWorkflowInit,
  handleWorkflowStatus,
  handleWorkflowAdvance,
  handleWorkflowManage,
} from './gatewayTools';

// Note: Project tool handlers (handleProjectSetup, handleProjectReport) removed
// Use context({ action: "init" }) for scaffolding and workflow-init for workflows

// Consolidated gateway tool action types
export type {
  ExploreAction,
  ContextAction,
  SyncAction,
  PlanAction,
  AgentAction,
  SkillAction,
} from './gatewayTools';

// Consolidated gateway tool parameter types
export type {
  ExploreParams,
  ContextParams,
  SyncParams,
  PlanParams,
  AgentParams,
  SkillParams,
} from './gatewayTools';

// Dedicated workflow handler parameter types
export type {
  WorkflowInitParams,
  WorkflowStatusParams,
  WorkflowAdvanceParams,
  WorkflowManageParams,
} from './gatewayTools';

// Note: Project handler parameter types (ProjectSetupParams, ProjectReportParams) removed

// Response types and helpers
export {
  createJsonResponse,
  createErrorResponse,
  type MCPToolResponse,
} from './gatewayTools';
