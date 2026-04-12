/**
 * CLI boundary exports.
 *
 * This module defines the operator-facing surface that is expected to
 * become the future `dotcontext/cli` package. Keep domain/runtime logic
 * out of this boundary whenever possible.
 */

export {
  MCPInstallService,
  type MCPInstallServiceDependencies,
  type MCPInstallOptions,
  type MCPInstallResult,
  type MCPInstallation,
  StateDetector,
  type ProjectState,
  type StateDetectionResult,
  type StateDetectorOptions,
} from '../services/cli';

export { SyncService } from '../services/sync/syncService';
export { ImportRulesService, ImportAgentsService } from '../services/import';
export { ExportRulesService } from '../services/export';
export { ReportService } from '../services/report';
export { QuickSyncService, type QuickSyncOptions } from '../services/quickSync';
export { ReverseQuickSyncService, type MergeStrategy } from '../services/reverseSync';
