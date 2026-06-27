import * as path from 'path';
import * as fs from 'fs-extra';

export type HookRepoRootResolutionSource =
  | 'repo-path'
  | 'cwd-context'
  | 'cwd'
  | 'process-cwd';

export interface ResolveHookRepoRootOptions {
  repoPath?: string;
  cwd?: string;
  processCwd?: string;
}

export interface HookRepoRootResolution {
  repoPath: string;
  source: HookRepoRootResolutionSource;
  startPath?: string;
  contextPath?: string;
}

function normalizeNonEmptyPath(input?: string): string | undefined {
  return typeof input === 'string' && input.trim().length > 0
    ? input
    : undefined;
}

async function findNearestContextRoot(startPath: string): Promise<string | undefined> {
  let current = path.resolve(startPath);

  while (true) {
    const contextPath = path.join(current, '.context');
    if (await fs.pathExists(contextPath)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

/**
 * Resolve the repository root used by host hooks.
 *
 * Precedence:
 * 1. explicit --repo-path
 * 2. nearest ancestor containing .context from cwd
 * 3. cwd
 * 4. process.cwd()
 */
export async function resolveHookRepoRoot(
  options: ResolveHookRepoRootOptions = {}
): Promise<HookRepoRootResolution> {
  const explicitRepoPath = normalizeNonEmptyPath(options.repoPath);
  if (explicitRepoPath) {
    const repoPath = path.resolve(explicitRepoPath);
    const contextPath = path.join(repoPath, '.context');
    return {
      repoPath,
      source: 'repo-path',
      contextPath: await fs.pathExists(contextPath) ? contextPath : undefined,
    };
  }

  const cwd = normalizeNonEmptyPath(options.cwd);
  if (cwd) {
    const startPath = path.resolve(cwd);
    const nearestContextRoot = await findNearestContextRoot(startPath);
    if (nearestContextRoot) {
      return {
        repoPath: nearestContextRoot,
        source: 'cwd-context',
        startPath,
        contextPath: path.join(nearestContextRoot, '.context'),
      };
    }

    return {
      repoPath: startPath,
      source: 'cwd',
      startPath,
    };
  }

  const repoPath = path.resolve(options.processCwd ?? process.cwd());
  return {
    repoPath,
    source: 'process-cwd',
  };
}
