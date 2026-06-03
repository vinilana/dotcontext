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
} from './system/types';

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
} from './fs/globPatterns';

// UI Helpers
export {
  withSpinner,
  displayOperationSummary,
  displayProgressBar,
  displayPhaseIndicator,
  createBox,
  SpinnerStatus,
} from './system/uiHelpers';

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
} from './fs/pathHelpers';

// Context Root Resolver
export {
  SimpleContextResult,
  ContextResolutionResult,
  resolveContextPath,
  resolveSimpleContext,
  resolveContextRoot,
  getContextPath as getContextPathResolved,
  getProjectRoot,
} from './context/contextRootResolver';

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
} from './registry/toolRegistry';

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
} from './context/contentTypeRegistry';

// Context Layout Registry
export {
  CONTEXT_LAYOUT_REGISTRY,
  getContextLayoutByClassification,
  getUntrackedContextLayoutEntries,
  type ContextLayoutClassification,
  type ContextLayoutEntry,
} from './context/contextLayout';

// Execution helpers
export {
  minimalUI,
  mockTranslate,
  toolExecutionContext,
} from './system/executionContext';
