/**
 * Harness service exports.
 *
 * These services hold transport-agnostic harness logic that can be consumed
 * by MCP, CLI, or future adapters.
 */

export { HarnessAgentsService, type HarnessAgentsServiceOptions } from './agentsService';
export { HarnessPlansService, type HarnessPlansServiceOptions } from './plansService';
export {
  HarnessContextService,
  type HarnessContextServiceOptions,
  type HarnessContextInitResult,
  type HarnessContextPlanScaffoldResult,
  type HarnessBootstrapStatusResult,
} from './contextService';
export {
  readFileTool,
  listFilesTool,
  analyzeSymbolsTool,
  getFileStructureTool,
  searchCodeTool,
  checkScaffoldingTool,
  initializeContextTool,
  scaffoldPlanTool,
  fillScaffoldingTool,
  listFilesToFillTool,
  fillSingleFileTool,
  getCodebaseMapTool,
  getOrBuildContext,
  cleanupSharedContext,
  type ToolName,
} from './contextTools';
export { HarnessSkillsService, type HarnessSkillsServiceOptions } from './skillsService';
export {
  HarnessRuntimeStateService,
  type HarnessRuntimeStateServiceOptions,
  type HarnessSessionStatus,
  type HarnessTraceLevel,
  type HarnessArtifactKind,
  type HarnessSessionRecord,
  type HarnessSessionCheckpoint,
  type HarnessTraceRecord,
  type HarnessArtifactRecord,
  type HarnessRuntimeStatePort,
  type CreateSessionInput,
  type AppendTraceInput,
  type AddArtifactInput,
  type CheckpointInput,
} from './runtimeStateService';
export {
  HarnessSensorsService,
  type HarnessSensorsServiceOptions,
  type HarnessSensorSeverity,
  type HarnessSensorStatus,
  type HarnessSensorExecutionInput,
  type HarnessSensorExecutionResult,
  type HarnessSensorDefinition,
  type HarnessSensorRun,
  type HarnessBackpressurePolicy,
  type HarnessBackpressureResult,
} from './sensorsService';
export {
  HarnessSensorCatalogService,
  type HarnessSensorCatalogServiceOptions,
  type HarnessShellSensorConfig,
  type HarnessSensorCatalogDocument,
  type HarnessSensorCatalogSeverity,
} from './sensorCatalogService';
export {
  HarnessTaskContractsService,
  type HarnessTaskContractsServiceOptions,
  type HarnessTaskContractStatus,
  type HarnessTaskContract,
  type HarnessHandoffContract,
  type HarnessTaskCompletionResult,
  type RequiredArtifactSpec,
  type RequiredArtifactInput,
} from './taskContractsService';
export {
  HarnessExecutionService,
  type HarnessExecutionServiceOptions,
  type HarnessSessionQualitySnapshot,
} from './executionService';
export {
  HarnessReplayService,
  type HarnessReplayServiceOptions,
  type HarnessReplayDependencies,
  type HarnessReplayEvent,
  type HarnessReplayEventSource,
  type HarnessReplayRecord,
  type ReplaySessionOptions,
} from './replayService';
export {
  HarnessDatasetService,
  type HarnessDatasetServiceOptions,
  type HarnessDatasetDependencies,
  type BuildHarnessDatasetOptions,
  type HarnessFailureKind,
  type HarnessFailureRecord,
  type HarnessFailureCluster,
  type HarnessFailureDataset,
} from './datasetService';
export {
  HarnessPolicyService,
  HarnessPolicyBlockedError,
  type HarnessPolicyServiceOptions,
  type HarnessPolicyTarget,
  type HarnessPolicyScope,
  type HarnessPolicyEffect,
  type HarnessPolicyRisk,
  type HarnessPolicyRule,
  type CreateHarnessPolicyRuleInput,
  type HarnessPolicyEvaluationInput,
  type HarnessPolicyEvaluationResult,
} from './policyService';
export {
  createI18nCoverageSensor,
  executeI18nCoverage,
  type I18nCoverageOptions,
  type I18nCoverageReport,
} from './sensors/i18nCoverage';
export {
  HarnessWorkflowStateService,
  type HarnessWorkflowStateServiceOptions,
  type HarnessWorkflowRecord,
  type WorkflowHarnessBinding,
} from './workflowStateService';
