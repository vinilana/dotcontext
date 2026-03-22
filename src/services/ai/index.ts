// Main AI SDK client
export { AISdkClient } from './aiSdkClient';

// Provider factory
export {
  createProvider,
  detectProviderFromEnv,
  getApiKeyFromEnv,
  getModelFromEnv,
  DEFAULT_MODELS,
  PROVIDER_ENV_VARS,
  type ProviderInstance,
  type ProviderResult
} from './providerFactory';

// Schemas
export * from './schemas';

// Tools
export {
  getCodeAnalysisTools,
  readFileTool,
  listFilesTool,
  analyzeSymbolsTool,
  getFileStructureTool,
  searchCodeTool,
  TOOL_NAMES,
  type ToolName
} from './tools';
