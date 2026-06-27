/**
 * CLI boundary exports.
 *
 * This module defines the operator-facing surface that is expected to
 * become the future `dotcontext/cli` package. Keep domain/runtime logic
 * out of this boundary whenever possible.
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
  HookDispatchService,
  runHookDispatch,
  HookDoctorService,
  formatHookDoctorResult,
  type HookDispatchOptions,
  type HookDispatchResult,
  type HookDispatchSource,
  type HookDoctorServiceDependencies,
  type HookDoctorOptions,
  type HookDoctorResult,
  type HookDoctorHostReport,
  type HookDoctorCheck,
  type HookDoctorCheckStatus,
  type HookDoctorSummary,
  type HookDoctorHost,
  StateDetector,
  type ProjectState,
  type StateDetectionResult,
  type StateDetectorOptions,
} from './services';

export { SyncService } from '../harness/application/exchange/sync/syncService';
export { ImportRulesService, ImportAgentsService } from '../harness/application/exchange/import';
export { ExportRulesService } from '../harness/application/exchange/export';
export { ReportService } from './services/report';
export { QuickSyncService, type QuickSyncOptions } from '../harness/application/exchange/quickSync';
export { ReverseQuickSyncService, type MergeStrategy } from '../harness/application/exchange/reverseSync';
