/**
 * Harness boundary exports.
 *
 * This module defines the reusable runtime surface that is expected to
 * become the future `dotcontext/harness` package. It intentionally excludes
 * CLI-only concerns and MCP transport adapters.
 */

export {
  WorkflowService,
  type WorkflowServiceDependencies,
  type WorkflowInitOptions,
} from '../services/workflow';
export {
  HarnessAgentsService,
  type HarnessAgentsServiceOptions,
  HarnessPlansService,
  type HarnessPlansServiceOptions,
  HarnessContextService,
  type HarnessContextServiceOptions,
  HarnessSkillsService,
  type HarnessSkillsServiceOptions,
  HarnessRuntimeStateService,
  type HarnessRuntimeStateServiceOptions,
  type HarnessSessionStatus,
  type HarnessTraceLevel,
  type HarnessArtifactKind,
  type HarnessSessionRecord,
  type HarnessSessionCheckpoint,
  type HarnessTraceRecord,
  type HarnessArtifactRecord,
  type CreateSessionInput,
  type AppendTraceInput,
  type AddArtifactInput,
  type CheckpointInput,
} from '../services/harness';

export {
  getScaleName,
  PHASE_NAMES_PT,
  ROLE_DISPLAY_NAMES,
  type PrevcRole,
} from '../workflow';
