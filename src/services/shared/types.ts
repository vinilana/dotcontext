/**
 * Shared Service Types
 *
 * Common interfaces and types used across all services.
 * Reduces duplication of dependency injection patterns and result types.
 */

import type { CLIInterface } from '../../utils/cliUI';
import type { TranslateFn } from '../../utils/i18n';

/**
 * Base dependencies for all services
 */
export interface BaseDependencies {
  ui: CLIInterface;
  t: TranslateFn;
  version: string;
}

/**
 * Common result type for file operations (import, export, sync)
 */
export interface OperationResult {
  filesCreated: number;
  filesSkipped: number;
  filesFailed: number;
  errors: OperationError[];
}

/**
 * Error entry in operation results
 */
export interface OperationError {
  file: string;
  error: string;
}

/**
 * Base file information for detection services
 */
export interface FileInfo {
  name: string;
  path: string;
  relativePath: string;
}

/**
 * Detection result for file discovery services
 */
export interface DetectionResult<T extends FileInfo = FileInfo> {
  files: T[];
  sources: string[];
}

/**
 * Options for dry-run operations
 */
export interface DryRunOptions {
  dryRun?: boolean;
  verbose?: boolean;
  force?: boolean;
}

/**
 * Create an empty operation result
 */
export function createEmptyResult(): OperationResult {
  return {
    filesCreated: 0,
    filesSkipped: 0,
    filesFailed: 0,
    errors: [],
  };
}

/**
 * Merge multiple operation results
 */
export function mergeResults(...results: OperationResult[]): OperationResult {
  return results.reduce(
    (acc, result) => ({
      filesCreated: acc.filesCreated + result.filesCreated,
      filesSkipped: acc.filesSkipped + result.filesSkipped,
      filesFailed: acc.filesFailed + result.filesFailed,
      errors: [...acc.errors, ...result.errors],
    }),
    createEmptyResult()
  );
}

/**
 * Add an error to operation result
 */
export function addError(
  result: OperationResult,
  file: string,
  error: unknown
): void {
  result.filesFailed++;
  result.errors.push({
    file,
    error: error instanceof Error ? error.message : String(error),
  });
}
