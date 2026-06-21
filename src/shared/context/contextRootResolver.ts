/**
 * Simple context path resolver
 *
 * Creates .context in the provided path or current working directory.
 * No upward traversal, git detection, or package.json configuration.
 * Simpler, more predictable behavior.
 */

import * as path from 'path';
import * as fs from 'fs-extra';

/**
 * Resolve the .context path for a given repository path
 * @param repoPath - The repository path (defaults to cwd)
 * @returns Absolute path to .context directory
 */
export function resolveContextPath(repoPath?: string): string {
  if (repoPath && (typeof repoPath !== 'string' || repoPath.trim() === '')) {
    throw new Error('contextRootResolver: repoPath must be a non-empty string');
  }
  const base = repoPath ? path.resolve(repoPath) : process.cwd();
  return path.join(base, '.context');
}

/**
 * Simple context resolution result
 */
export interface SimpleContextResult {
  /** Absolute path to .context directory */
  contextPath: string;
  /** Absolute path to project root */
  projectRoot: string;
  /** Whether .context directory exists */
  exists: boolean;
}

/**
 * Resolve context information for a repository
 * @param repoPath - The repository path (defaults to cwd)
 * @returns Simple context resolution result
 */
export async function resolveSimpleContext(repoPath?: string): Promise<SimpleContextResult> {
  if (repoPath && (typeof repoPath !== 'string' || repoPath.trim() === '')) {
    throw new Error('contextRootResolver: repoPath must be a non-empty string');
  }
  const projectRoot = repoPath ? path.resolve(repoPath) : process.cwd();
  const contextPath = path.join(projectRoot, '.context');
  const exists = fs.existsSync(contextPath);

  return { contextPath, projectRoot, exists };
}

/**
 * Get the context path for a repository (simple helper)
 * @param repoPath - The repository path (defaults to cwd)
 * @returns Absolute path to .context directory
 */
export async function getContextPath(repoPath: string = process.cwd()): Promise<string> {
  return resolveContextPath(repoPath);
}

/**
 * Get the project root for a repository
 * @param repoPath - The repository path (defaults to cwd)
 * @returns Absolute path to project root
 */
export async function getProjectRoot(repoPath: string = process.cwd()): Promise<string> {
  return path.resolve(repoPath);
}

/**
 * Backwards compatibility: resolve context using old complex API
 * This maintains compatibility with existing code while using simple resolution
 */
export interface ContextResolutionResult {
  contextPath: string;
  projectRoot: string;
  exists: boolean;
  isValid: boolean;
}

export async function resolveContextRoot(options?: { startPath?: string; validate?: boolean }): Promise<ContextResolutionResult> {
  const startPath = options?.startPath || process.cwd();
  const result = await resolveSimpleContext(startPath);

  return {
    contextPath: result.contextPath,
    projectRoot: result.projectRoot,
    exists: result.exists,
    isValid: result.exists, // Simple: valid if it exists
  };
}
