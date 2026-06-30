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
    workflowPath: path.join(contextPath, 'runtime', 'workflows'),
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
    workflowPath: path.join(resolution.contextPath, 'runtime', 'workflows'),
    resolution,
  };

  return paths;
}

/**
 * On-disk layout for authored config and machine-generated runtime state.
 *
 * Authored config lives under `.context/config` (version-controlled when
 * customized). All generated state lives under `.context/runtime` and is
 * gitignored as a single block. This is the single source of truth for these
 * paths — services must resolve through here rather than joining `'harness'`
 * or `'workflow'` segments by hand.
 *
 * Note: this concerns only the DATA folder on disk. The `src/harness` code
 * module keeps its name; the runtime it writes is what lives under `runtime/`.
 */
export interface RuntimeLayout {
  /** `.context/config` — authored, version-controlled config */
  configDir: string;
  /** `.context/config/policy.json` */
  policyFile: string;
  /** `.context/config/sensors.json` */
  sensorsFile: string;
  /** `.context/runtime` — all generated state, gitignored */
  runtimeDir: string;
  /** `.context/runtime/sessions` */
  sessionsDir: string;
  /** `.context/runtime/workflows` */
  workflowsDir: string;
  /** `.context/runtime/workflows/prevc.json` */
  prevcFile: string;
  /** `.context/runtime/workflows/archive` */
  workflowsArchiveDir: string;
  /** `.context/runtime/workflows/collaboration-sessions.json` */
  collaborationFile: string;
  /** `.context/runtime/contracts` */
  contractsDir: string;
  /** `.context/runtime/contracts/tasks` */
  contractTasksDir: string;
  /** `.context/runtime/contracts/handoffs` */
  contractHandoffsDir: string;
  /** `.context/runtime/evaluations` */
  evaluationsDir: string;
  /** `.context/runtime/evaluations/replays` */
  replaysDir: string;
  /** `.context/runtime/evaluations/datasets` */
  datasetsDir: string;
  /** `.context/runtime/sessions/<id>` */
  sessionDir(sessionId: string): string;
  /** `.context/runtime/sessions/<id>/session.json` */
  sessionFile(sessionId: string): string;
  /** `.context/runtime/sessions/<id>/trace.jsonl` */
  sessionTraceFile(sessionId: string): string;
  /** `.context/runtime/sessions/<id>/artifacts` */
  sessionArtifactsDir(sessionId: string): string;
  /** `.context/runtime/sessions/<id>/artifacts/<artifactId>.json` */
  sessionArtifactFile(sessionId: string, artifactId: string): string;
}

/**
 * Resolve the full config + runtime layout from a `.context` path.
 * Pass the `.context` directory itself (use `resolveRuntimeLayoutFromRepo` when
 * you only have a repo root).
 */
export function resolveRuntimeLayout(contextPath: string): RuntimeLayout {
  const resolved = path.resolve(contextPath);
  const configDir = path.join(resolved, 'config');
  const runtimeDir = path.join(resolved, 'runtime');
  const sessionsDir = path.join(runtimeDir, 'sessions');
  const workflowsDir = path.join(runtimeDir, 'workflows');
  const contractsDir = path.join(runtimeDir, 'contracts');
  const evaluationsDir = path.join(runtimeDir, 'evaluations');

  return {
    configDir,
    policyFile: path.join(configDir, 'policy.json'),
    sensorsFile: path.join(configDir, 'sensors.json'),
    runtimeDir,
    sessionsDir,
    workflowsDir,
    prevcFile: path.join(workflowsDir, 'prevc.json'),
    workflowsArchiveDir: path.join(workflowsDir, 'archive'),
    collaborationFile: path.join(workflowsDir, 'collaboration-sessions.json'),
    contractsDir,
    contractTasksDir: path.join(contractsDir, 'tasks'),
    contractHandoffsDir: path.join(contractsDir, 'handoffs'),
    evaluationsDir,
    replaysDir: path.join(evaluationsDir, 'replays'),
    datasetsDir: path.join(evaluationsDir, 'datasets'),
    sessionDir: (sessionId: string) => path.join(sessionsDir, sessionId),
    sessionFile: (sessionId: string) => path.join(sessionsDir, sessionId, 'session.json'),
    sessionTraceFile: (sessionId: string) => path.join(sessionsDir, sessionId, 'trace.jsonl'),
    sessionArtifactsDir: (sessionId: string) => path.join(sessionsDir, sessionId, 'artifacts'),
    sessionArtifactFile: (sessionId: string, artifactId: string) =>
      path.join(sessionsDir, sessionId, 'artifacts', `${artifactId}.json`),
  };
}

/**
 * Resolve the config + runtime layout from a repository root (joins `.context`).
 */
export function resolveRuntimeLayoutFromRepo(repoPath: string): RuntimeLayout {
  return resolveRuntimeLayout(path.join(path.resolve(repoPath), '.context'));
}

/** Forward slashes for stable cross-platform paths in APIs, tests, and prompts. */
export function toPosixPath(input: string): string {
  return input.split(path.sep).join('/');
}

/**
 * Relative `.context/...` workflow state path for user-facing strings (POSIX).
 */
export function workflowPrevcRelativePath(): string {
  return '.context/runtime/workflows/prevc.json';
}

/**
 * Rename with retries for Windows EPERM when the destination is briefly locked
 * (e.g. concurrent Jest workers reading the same tracking file).
 */
export async function renameWithRetry(
  sourcePath: string,
  destPath: string,
  options: { maxAttempts?: number; delayMs?: number } = {}
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 8;
  const delayMs = options.delayMs ?? 25;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.rename(sourcePath, destPath);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY') {
        throw error;
      }
      if (attempt === maxAttempts) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError;
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
