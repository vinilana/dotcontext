import type { CLIInterface } from '../../utils/cliUI';
import type { TranslateFn } from '../../utils/i18n';

export type RuleType = 
  | 'cursorrules' 
  | 'claude-memory' 
  | 'github-copilot' 
  | 'windsurfrules'
  | 'clinerules'
  | 'aider'
  | 'continue'
  | 'codex'
  | 'gemini'
  | 'antigravity'
  | 'trae'
  | 'zed'
  | 'generic';

export type ImportFormat = 'markdown' | 'raw' | 'formatted';

export interface RuleFileInfo {
  name: string;
  sourcePath: string;
  relativePath: string;
  filename: string;
  type: RuleType;
  content?: string;
}

export interface ImportRulesCommandFlags {
  source?: string[];
  target?: string;
  format?: ImportFormat;
  force?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  autoDetect?: boolean;
}

export interface ImportAgentsCommandFlags {
  source?: string[];
  target?: string;
  force?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  autoDetect?: boolean;
}

export interface ImportServiceDependencies {
  ui: CLIInterface;
  t: TranslateFn;
  version: string;
}

export interface ImportRulesOptions {
  sourcePaths: string[];
  targetPath: string;
  format: ImportFormat;
  force: boolean;
  dryRun: boolean;
  verbose: boolean;
  autoDetect: boolean;
}

export interface ImportAgentsOptions {
  sourcePaths: string[];
  targetPath: string;
  force: boolean;
  dryRun: boolean;
  verbose: boolean;
  autoDetect: boolean;
}

export interface ImportResult {
  targetPath: string;
  filesCreated: number;
  filesSkipped: number;
  filesFailed: number;
  errors: Array<{ file: string; error: string }>;
}

export interface DetectionResult {
  files: RuleFileInfo[];
  sources: string[];
}

export interface RuleSource {
  name: string;
  paths: string[];
  patterns: string[];
  description: string;
}
