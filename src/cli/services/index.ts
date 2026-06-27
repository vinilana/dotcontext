/**
 * CLI service exports.
 *
 * These services belong to the operator-facing CLI boundary.
 */

export {
  MCPInstallService,
  buildMcpInstallToolChoices,
  resolveMcpInstallToolSelection,
  type MCPInstallServiceDependencies,
  type MCPInstallOptions,
  type MCPInstallResult,
  type MCPInstallation,
  type MCPInstallToolChoice,
  type MCPInstallToolPrompt,
  type ResolveMcpInstallToolSelectionOptions,
} from './mcpInstallService';

export {
  HookInstallService,
  buildHookInstallHostChoices,
  resolveHookInstallHostSelection,
  type HookInstallServiceDependencies,
  type HookInstallOptions,
  type HookUninstallOptions,
  type HookInstallResult,
  type HookInstallation,
  type HookHost,
  type HookInstallToolChoice,
  type HookInstallToolPrompt,
  type ResolveHookInstallHostSelectionOptions,
} from './hookInstallService';

export {
  HookDispatchService,
  runHookDispatch,
  type HookDispatchOptions,
  type HookDispatchResult,
  type HookDispatchSource,
} from './hookDispatchService';

export {
  HookDoctorService,
  formatHookDoctorResult,
  type HookDoctorServiceDependencies,
  type HookDoctorOptions,
  type HookDoctorResult,
  type HookDoctorHostReport,
  type HookDoctorCheck,
  type HookDoctorCheckStatus,
  type HookDoctorSummary,
  type HookDoctorHost,
} from './hookDoctorService';

export {
  StateDetector,
  default as DefaultStateDetector,
  type ProjectState,
  type StateDetectionResult,
  type StateDetectorOptions,
} from '../../harness/application/context/stateDetector';
