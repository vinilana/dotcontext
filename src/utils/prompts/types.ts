export type InteractiveMode = 'quick' | 'advanced';

export interface PathsPromptResult {
  repoPath: string;
  outputDir: string;
}

export interface SmartDefaults {
  repoPath: string;
  outputDir: string;
  scaffoldExists: boolean;
  detectedLanguages: string[];
}

export interface ConfigSummary {
  operation: 'fill' | 'plan' | 'sync';
  repoPath?: string;
  outputDir?: string;
  provider?: string;
  model?: string;
  apiKeySource?: 'env' | 'provided' | 'none';
  options?: Record<string, string | boolean | string[]>;
}

export interface AnalysisOptions {
  semantic: boolean;
  languages?: string[];
  useLsp: boolean;
  verbose: boolean;
}
