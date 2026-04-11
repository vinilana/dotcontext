/**
 * Shared Service Utilities
 *
 * Common utilities, types, and helpers used across all services.
 */

// Types
export {
  BaseDependencies,
  OperationResult,
  OperationError,
  FileInfo,
  DetectionResult,
  DryRunOptions,
  createEmptyResult,
  mergeResults,
  addError,
} from './types';

// Glob Patterns
export {
  COMMON_IGNORES,
  CODE_EXTENSIONS,
  DOC_EXTENSIONS,
  CONFIG_PATTERNS,
  globFiles,
  globMultiple,
  buildExtensionPattern,
  shouldIgnore,
} from './globPatterns';

// UI Helpers
export {
  withSpinner,
  displayOperationSummary,
  displayProgressBar,
  displayPhaseIndicator,
  createBox,
  SpinnerStatus,
} from './uiHelpers';

// Path Helpers
export {
  ContextPaths,
  ContextPathsWithResolution,
  resolveContextPaths,
  resolveContextPathsAsync,
  resolveAbsolutePath,
  ensureDirectory,
  ensureParentDirectory,
  getRelativePath,
  pathExists,
  isDirectory,
  isFile,
  normalizePath,
  deduplicatePaths,
  getExtension,
  getBasename,
  joinPaths,
} from './pathHelpers';

// Context Root Resolver
export {
  SimpleContextResult,
  ContextResolutionResult,
  resolveContextPath,
  resolveSimpleContext,
  resolveContextRoot,
  getContextPath as getContextPathResolved,
  getProjectRoot,
} from './contextRootResolver';

// Tool Registry
export {
  ToolCapabilities,
  ToolPaths,
  ToolDefinition,
  TOOL_REGISTRY,
  getToolById,
  getAllToolIds,
  getToolsWithCapability,
  getToolIdFromPath,
  getToolDisplayName,
  getToolCapabilities,
  getDirectoryPrefixMap,
  getDisplayNameMap,
  getCapabilitiesMap,
  getRulesExportPresets,
  getAgentsSyncPresets,
  getSkillsExportPresets,
  getRulesImportSources,
  getAgentsImportSources,
  getSkillsImportSources,
} from './toolRegistry';

// Content Type Registry
export {
  ContentType,
  CONTENT_TYPE_REGISTRY,
  getContentType,
  getExportableContentTypes,
  getImportableContentTypes,
  getContentTypeIds,
  hasContentType,
  registerContentType,
  getContextPath,
  getIndexFile,
} from './contentTypeRegistry';

// Execution helpers
export {
  minimalUI,
  mockTranslate,
  toolExecutionContext,
} from './executionContext';
