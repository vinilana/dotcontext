/**
 * Shared Path Helpers
 *
 * Common path resolution and context path utilities.
 * Reduces duplication of path handling across services.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import {
  resolveContextRoot,
  type ContextResolutionResult,
} from '../context/contextRootResolver';

/**
 * Standard context paths for a repository
 */
export interface ContextPaths {
  absolutePath: string;
  contextPath: string;
  docsPath: string;
  agentsPath: string;
  plansPath: string;
  rulesPath: string;
  workflowPath: string;
}

/**
 * Extended context paths with resolution details
 */
export interface ContextPathsWithResolution extends ContextPaths {
  resolution: ContextResolutionResult;
}

/**
 * Resolve all context paths for a repository (synchronous version)
 * Note: Uses a simple strategy without upward traversal or git root detection.
 * For robust context resolution, use resolveContextPathsAsync instead.
 */
export function resolveContextPaths(repoPath: string): ContextPaths {
  const absolutePath = path.resolve(repoPath);
  const contextPath = path.join(absolutePath, '.context');

  return {
    absolutePath,
    contextPath,
    docsPath: path.join(contextPath, 'docs'),
    agentsPath: path.join(contextPath, 'agents'),
    plansPath: path.join(contextPath, 'plans'),
    rulesPath: path.join(contextPath, 'rules'),
    workflowPath: path.join(contextPath, 'workflow'),
  };
}

/**
 * Resolve all context paths for a repository (async version)
 * Uses simple path resolution: direct subdirectory lookup without upward traversal.
 */
export async function resolveContextPathsAsync(
  repoPath?: string
): Promise<ContextPathsWithResolution> {
  const startPath = repoPath || process.cwd();
  const resolution = await resolveContextRoot({
    startPath,
  });

  const paths: ContextPathsWithResolution = {
    absolutePath: resolution.projectRoot,
    contextPath: resolution.contextPath,
    docsPath: path.join(resolution.contextPath, 'docs'),
    agentsPath: path.join(resolution.contextPath, 'agents'),
    plansPath: path.join(resolution.contextPath, 'plans'),
    rulesPath: path.join(resolution.contextPath, 'rules'),
    workflowPath: path.join(resolution.contextPath, 'workflow'),
    resolution,
  };

  return paths;
}

/**
 * Resolve an absolute path from input
 */
export function resolveAbsolutePath(
  inputPath: string | undefined,
  defaultPath: string,
  basePath: string
): string {
  const resolved = inputPath || defaultPath;
  return path.isAbsolute(resolved)
    ? resolved
    : path.join(basePath, resolved);
}

/**
 * Ensure a directory exists
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

/**
 * Ensure parent directory of a file exists
 */
export async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
}

/**
 * Get relative path from base
 */
export function getRelativePath(fullPath: string, basePath: string): string {
  return path.relative(basePath, fullPath);
}

/**
 * Check if path exists
 */
export async function pathExists(targetPath: string): Promise<boolean> {
  return fs.pathExists(targetPath);
}

/**
 * Check if path is a directory
 */
export async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if path is a file
 */
export async function isFile(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Normalize path separators to forward slashes
 */
export function normalizePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/');
}

/**
 * Deduplicate an array of paths
 */
export function deduplicatePaths(paths: string[]): string[] {
  return [...new Set(paths.map((p) => path.normalize(p)))];
}

/**
 * Get file extension without dot
 */
export function getExtension(filePath: string): string {
  const ext = path.extname(filePath);
  return ext.startsWith('.') ? ext.slice(1) : ext;
}

/**
 * Get filename without extension
 */
export function getBasename(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

/**
 * Join paths safely, handling undefined values
 */
export function joinPaths(...parts: (string | undefined)[]): string {
  const validParts = parts.filter((p): p is string => p !== undefined && p !== '');
  return path.join(...validParts);
}
