/**
 * Reverse Sync Types
 *
 * Types and interfaces for the Reverse Quick Sync feature
 * which imports from AI tool directories into .context/
 */

import type { CLIInterface } from '../../../../utils/cliUI';
import type { TranslateFn } from '../../../../utils/i18n';
import type { ImportFormat, RuleFileInfo } from '../import/types';

// ============================================================================
// Merge Strategy
// ============================================================================

export type MergeStrategy = 'skip' | 'overwrite' | 'merge' | 'rename';

// ============================================================================
// Tool Detection
// ============================================================================

/**
 * Presence summary for a single AI tool
 */
export interface ToolPresence {
  /** Tool identifier (e.g., 'claude', 'cursor', 'github') */
  id: string;
  /** Display name (e.g., 'Claude Code', 'Cursor AI') */
  displayName: string;
  /** Whether this tool was detected in the repository */
  detected: boolean;
  /** Paths found for each content type */
  paths: {
    rules: string[];
    agents: string[];
    skills: string[];
  };
  /** Count of files found */
  counts: {
    rules: number;
    agents: number;
    skills: number;
    total: number;
  };
}

/**
 * Aggregated result from tool detection
 */
export interface ToolDetectionResult {
  /** List of all tools with their detection status */
  tools: ToolPresence[];
  /** Overall summary */
  summary: {
    toolsFound: number;
    totalRules: number;
    totalAgents: number;
    totalSkills: number;
    totalFiles: number;
  };
}

// ============================================================================
// Skills
// ============================================================================

/**
 * Skill file metadata parsed from frontmatter
 */
export interface SkillMetadata {
  name?: string;
  description?: string;
  phases?: string[];
  triggers?: string[];
  tags?: string[];
}

/**
 * Information about a detected skill file
 */
export interface SkillFileInfo {
  /** Skill name/title */
  name: string;
  /** Slug identifier */
  slug: string;
  /** Absolute path to the skill file */
  sourcePath: string;
  /** Relative path from repo root */
  relativePath: string;
  /** Filename */
  filename: string;
  /** Source AI tool identifier */
  sourceTool: string;
  /** Parsed metadata from frontmatter */
  metadata?: SkillMetadata;
}

/**
 * Result from skill detection
 */
export interface SkillDetectionResult {
  files: SkillFileInfo[];
  sources: string[];
}

// ============================================================================
// Import Metadata (Frontmatter)
// ============================================================================

/**
 * Metadata added to imported files as YAML frontmatter
 */
export interface ImportMetadata {
  /** Source AI tool identifier */
  source_tool: string;
  /** Original file path */
  source_path: string;
  /** ISO timestamp of import */
  imported_at: string;
  /** Version of ai-coders-context that performed the import */
  ai_context_version: string;
  /** Merge strategy used (if applicable) */
  merge_strategy?: MergeStrategy;
  /** Original filename (if renamed) */
  original_filename?: string;
}

// ============================================================================
// Service Options and Results
// ============================================================================

/**
 * Command line flags for reverse-sync
 */
export interface ReverseSyncCommandFlags {
  dryRun?: boolean;
  force?: boolean;
  skipAgents?: boolean;
  skipSkills?: boolean;
  skipRules?: boolean;
  mergeStrategy?: MergeStrategy;
  verbose?: boolean;
  format?: ImportFormat;
  metadata?: boolean;
  sourceTools?: string[];
}

/**
 * Resolved options for reverse sync operation
 */
export interface ReverseSyncOptions {
  repoPath: string;
  targetPath: string;
  dryRun: boolean;
  force: boolean;
  skipAgents: boolean;
  skipSkills: boolean;
  skipRules: boolean;
  mergeStrategy: MergeStrategy;
  verbose: boolean;
  format: ImportFormat;
  addMetadata: boolean;
  sourceTools?: string[];
}

/**
 * Import action taken for a file
 */
export type ImportAction = 'created' | 'overwritten' | 'merged' | 'renamed' | 'skipped' | 'failed';

/**
 * Content type being imported
 */
export type ImportContentType = 'rule' | 'agent' | 'skill';

/**
 * Record of a single imported file
 */
export interface ImportedFileRecord {
  sourcePath: string;
  targetPath: string;
  type: ImportContentType;
  action: ImportAction;
  sourceTool?: string;
  error?: string;
}

/**
 * Result from reverse sync operation
 */
export interface ReverseSyncResult {
  rulesImported: number;
  agentsImported: number;
  skillsImported: number;
  filesSkipped: number;
  filesMerged: number;
  filesRenamed: number;
  filesFailed: number;
  errors: Array<{ file: string; error: string }>;
  importedFiles: ImportedFileRecord[];
}

/**
 * Options for importing skills
 */
export interface ImportSkillsOptions {
  sourcePaths: string[];
  targetPath: string;
  force: boolean;
  dryRun: boolean;
  verbose: boolean;
  autoDetect: boolean;
  mergeStrategy: MergeStrategy;
  addMetadata: boolean;
}

/**
 * Command flags for import-skills
 */
export interface ImportSkillsCommandFlags {
  source?: string[];
  target?: string;
  force?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  autoDetect?: boolean;
  mergeStrategy?: MergeStrategy;
  metadata?: boolean;
}

// ============================================================================
// Service Dependencies
// ============================================================================

export interface ReverseSyncServiceDependencies {
  ui: CLIInterface;
  t: TranslateFn;
  version: string;
}

// Re-export for convenience
export type { RuleFileInfo, ImportFormat };
