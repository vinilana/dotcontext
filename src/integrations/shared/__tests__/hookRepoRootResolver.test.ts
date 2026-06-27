import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { resolveHookRepoRoot } from '../hookRepoRootResolver';

describe('resolveHookRepoRoot', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-hook-root-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('resolves a parent repo root from a subdirectory with .context', async () => {
    const nested = path.join(tempDir, 'packages', 'app', 'src');
    await fs.ensureDir(path.join(tempDir, '.context'));
    await fs.ensureDir(nested);

    const result = await resolveHookRepoRoot({ cwd: nested });

    expect(result.repoPath).toBe(tempDir);
    expect(result.source).toBe('cwd-context');
    expect(result.contextPath).toBe(path.join(tempDir, '.context'));
  });

  it('prefers the nearest .context in a simple monorepo', async () => {
    const packageRoot = path.join(tempDir, 'packages', 'app');
    const nested = path.join(packageRoot, 'src');
    await fs.ensureDir(path.join(tempDir, '.context'));
    await fs.ensureDir(path.join(packageRoot, '.context'));
    await fs.ensureDir(nested);

    const result = await resolveHookRepoRoot({ cwd: nested });

    expect(result.repoPath).toBe(packageRoot);
    expect(result.source).toBe('cwd-context');
    expect(result.contextPath).toBe(path.join(packageRoot, '.context'));
  });

  it('gives --repo-path precedence over cwd context discovery', async () => {
    const overrideRoot = path.join(tempDir, 'override');
    const cwdRoot = path.join(tempDir, 'cwd-root');
    const nested = path.join(cwdRoot, 'src');
    await fs.ensureDir(path.join(overrideRoot, '.context'));
    await fs.ensureDir(path.join(cwdRoot, '.context'));
    await fs.ensureDir(nested);

    const result = await resolveHookRepoRoot({
      repoPath: overrideRoot,
      cwd: nested,
    });

    expect(result.repoPath).toBe(overrideRoot);
    expect(result.source).toBe('repo-path');
    expect(result.contextPath).toBe(path.join(overrideRoot, '.context'));
  });

  it('falls back to cwd when no .context is found above cwd', async () => {
    const nested = path.join(tempDir, 'packages', 'app');
    await fs.ensureDir(nested);

    const result = await resolveHookRepoRoot({ cwd: nested });

    expect(result.repoPath).toBe(nested);
    expect(result.source).toBe('cwd');
    expect(result.contextPath).toBeUndefined();
  });
});
