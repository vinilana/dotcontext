import type { CLIInterface } from '../../utils/cliUI';
import type { TranslateFn } from '../../utils/i18n';

export type SyncMode = 'symlink' | 'markdown';

export type PresetName = string;

export interface TargetPreset {
  name: PresetName;
  path: string;
  filenameSuffix?: string;
  description: string;
}

export interface SyncCommandFlags {
  source?: string;
  target?: string[];
  mode?: SyncMode;
  preset?: PresetName;
  force?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

export interface SyncServiceDependencies {
  ui: CLIInterface;
  t: TranslateFn;
  version: string;
}

export interface SyncOptions {
  sourcePath: string;
  targetPaths: string[];
  mode: SyncMode;
  force: boolean;
  dryRun: boolean;
  verbose: boolean;
}

export interface SyncResult {
  targetPath: string;
  filesCreated: number;
  filesSkipped: number;
  filesFailed: number;
  errors: Array<{ file: string; error: string }>;
}

export interface AgentFileInfo {
  name: string;
  sourcePath: string;
  relativePath: string;
  filename: string;
}

export interface HandlerOptions {
  force: boolean;
  dryRun: boolean;
  verbose: boolean;
  filenameSuffix?: string;
}

export interface HandlerResult {
  filesCreated: number;
  filesSkipped: number;
  filesFailed: number;
  errors: Array<{ file: string; error: string }>;
}

export interface SyncRunResult {
  filesCreated: number;
  filesSkipped: number;
  filesFailed: number;
  targets: SyncResult[];
}
