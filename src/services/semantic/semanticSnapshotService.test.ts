import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { FileMapper } from '../../utils/fileMapper';
import { SemanticSnapshotService } from './semanticSnapshotService';

describe('SemanticSnapshotService', () => {
  let tempDir: string;
  let repoPath: string;
  let outputDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-semantic-snapshot-'));
    repoPath = path.join(tempDir, 'repo');
    outputDir = path.join(repoPath, '.context');

    await fs.ensureDir(path.join(repoPath, 'src'));
    await fs.writeJson(path.join(repoPath, 'package.json'), {
      name: 'snapshot-test',
      version: '1.0.0',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
    }, { spaces: 2 });
    await fs.writeFile(path.join(repoPath, 'src', 'index.ts'), 'export const run = () => true;\n', 'utf-8');
    await fs.writeFile(path.join(repoPath, 'src', 'auth.ts'), 'export const login = () => "ok";\n', 'utf-8');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('writes a symbol-free semantic snapshot and published summary', async () => {
    const mapper = new FileMapper();
    const repoStructure = await mapper.mapRepository(repoPath);
    const service = new SemanticSnapshotService();

    const result = await service.writeSnapshot(repoStructure, { outputDir });
    const manifestPath = path.join(outputDir, 'cache', 'semantic', 'manifest.json');
    const manifest = await fs.readJson(manifestPath);

    expect(result.summary.functionalPatterns.hasAuthPattern).toBe(true);
    expect(result.summary).not.toHaveProperty('symbols');
    expect(result.summary).not.toHaveProperty('publicAPI');

    const snapshotDir = path.join(outputDir, 'cache', 'semantic');
    expect(await fs.pathExists(manifestPath)).toBe(true);
    expect(await fs.pathExists(path.join(snapshotDir, manifest.sections.functionalPatterns))).toBe(true);
    expect(await fs.pathExists(path.join(snapshotDir, manifest.sections.summary))).toBe(true);
    expect(await fs.pathExists(path.join(outputDir, 'docs', 'codebase-map.json'))).toBe(true);

    const publishedSummary = await fs.readJson(path.join(outputDir, 'docs', 'codebase-map.json'));
    expect(publishedSummary).not.toHaveProperty('symbols');
    expect(publishedSummary).not.toHaveProperty('publicAPI');
    expect(publishedSummary.meta.analyzer.includesSymbolPayload).toBe(false);
  });

  it('auto-builds a missing snapshot on demand', async () => {
    const service = new SemanticSnapshotService();

    const result = await service.ensureFreshSummary(repoPath, { outputDir });

    expect(result.refreshed).toBe(true);
    expect(result.refreshReason).toBe('missing');
    expect(result.fresh).toBe(true);
    expect(result.summary.functionalPatterns.hasAuthPattern).toBe(true);
    expect(await fs.pathExists(path.join(outputDir, 'cache', 'semantic', 'manifest.json'))).toBe(true);
  });

  it('invalidates the snapshot when hidden config files change', async () => {
    const mapper = new FileMapper();
    const repoStructure = await mapper.mapRepository(repoPath);
    const service = new SemanticSnapshotService();

    await fs.ensureDir(path.join(repoPath, '.github', 'workflows'));
    await fs.writeFile(path.join(repoPath, '.github', 'workflows', 'ci.yml'), 'name: ci\n', 'utf-8');

    await service.writeSnapshot(repoStructure, { outputDir });
    const before = await service.readSummary(repoPath, { allowStale: false });
    expect(before).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 20));
    await fs.writeFile(path.join(repoPath, '.github', 'workflows', 'ci.yml'), 'name: changed\n', 'utf-8');

    const after = await service.readSummary(repoPath, { allowStale: false });
    expect(after).toBeNull();
  });

  it('invalidates the snapshot when file contents change without size or mtime changes', async () => {
    await fs.writeFile(path.join(repoPath, 'src', 'index.ts'), 'export const run = () => 1;\n', 'utf-8');

    const mapper = new FileMapper();
    const repoStructure = await mapper.mapRepository(repoPath);
    const service = new SemanticSnapshotService();

    await service.writeSnapshot(repoStructure, { outputDir });
    const targetPath = path.join(repoPath, 'src', 'index.ts');
    const originalStats = await fs.stat(targetPath);

    await fs.writeFile(targetPath, 'export const run = () => 2;\n', 'utf-8');
    await fs.utimes(targetPath, originalStats.atime, originalStats.mtime);

    const stale = await service.readSummary(repoPath, { outputDir, allowStale: false });
    expect(stale).toBeNull();
  });

  it('auto-refreshes a stale snapshot on demand', async () => {
    const mapper = new FileMapper();
    const repoStructure = await mapper.mapRepository(repoPath);
    const service = new SemanticSnapshotService();

    const initial = await service.writeSnapshot(repoStructure, { outputDir });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fs.writeFile(path.join(repoPath, 'src', 'index.ts'), 'export const run = () => false;\n', 'utf-8');

    const refreshed = await service.ensureFreshSummary(repoPath, { outputDir });

    expect(refreshed.refreshed).toBe(true);
    expect(refreshed.refreshReason).toBe('stale');
    expect(refreshed.fresh).toBe(true);
    expect(refreshed.manifest?.repoFingerprint).not.toBe(initial.manifest.repoFingerprint);
  });

  it('deduplicates concurrent refreshes for the same repo', async () => {
    const mapper = new FileMapper();
    const repoStructure = await mapper.mapRepository(repoPath);
    const service = new SemanticSnapshotService();
    await service.writeSnapshot(repoStructure, { outputDir });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fs.writeFile(path.join(repoPath, 'src', 'index.ts'), 'export const run = () => false;\n', 'utf-8');

    const originalBuildSnapshotArtifacts = (service as any).buildSnapshotArtifacts.bind(service);
    const buildSpy = jest.spyOn(service as any, 'buildSnapshotArtifacts').mockImplementation(async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return originalBuildSnapshotArtifacts(...args);
    });

    const [first, second] = await Promise.all([
      service.ensureFreshSummary(repoPath, { outputDir }),
      service.ensureFreshSummary(repoPath, { outputDir }),
    ]);

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(first.refreshReason).toBe('stale');
    expect(second.refreshReason).toBe('stale');
    expect(first.manifest?.repoFingerprint).toBe(second.manifest?.repoFingerprint);
  });

  it('retries refresh until the repo state is stable', async () => {
    await fs.remove(path.join(repoPath, 'src', 'auth.ts'));

    const service = new SemanticSnapshotService();
    let mutationInjected = false;
    const originalBuildSnapshotArtifacts = (service as any).buildSnapshotArtifacts.bind(service);
    const buildSpy = jest.spyOn(service as any, 'buildSnapshotArtifacts').mockImplementation(async (...args) => {
      if (!mutationInjected) {
        mutationInjected = true;
        await fs.writeFile(path.join(repoPath, 'src', 'auth.ts'), 'export const login = () => "ok";\n', 'utf-8');
      }

      return originalBuildSnapshotArtifacts(...args);
    });

    const refreshed = await service.ensureFreshSummary(repoPath, { outputDir });

    expect(buildSpy).toHaveBeenCalledTimes(2);
    expect(refreshed.summary.functionalPatterns.hasAuthPattern).toBe(true);
    expect(refreshed.refreshReason).toBe('missing');
  });

  it('keeps the previous snapshot readable until the new manifest is promoted', async () => {
    const mapper = new FileMapper();
    const repoStructure = await mapper.mapRepository(repoPath);
    const service = new SemanticSnapshotService();
    const reader = new SemanticSnapshotService();

    const initial = await service.writeSnapshot(repoStructure, { outputDir });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fs.writeFile(path.join(repoPath, 'src', 'index.ts'), 'export const run = () => false;\n', 'utf-8');

    let observedDuringPublish: { manifest?: { generatedAt?: string } } | null = null;
    const originalPromoteFile = (service as any).promoteFile.bind(service);
    jest.spyOn(service as any, 'promoteFile').mockImplementation(async (...args: unknown[]) => {
      const [sourcePath, targetPath] = args as [string, string];
      if (targetPath === path.join(outputDir, 'cache', 'semantic', 'manifest.json')) {
        observedDuringPublish = await reader.readSummary(repoPath, { outputDir, allowStale: true });
      }

      return originalPromoteFile(sourcePath, targetPath);
    });

    await service.ensureFreshSummary(repoPath, { outputDir });

    expect(observedDuringPublish).not.toBeNull();
    const observedGeneratedAt =
      (observedDuringPublish as { manifest?: { generatedAt?: string } } | null)?.manifest?.generatedAt ?? null;
    expect(observedGeneratedAt).toBe(initial.manifest.generatedAt);
  });

  it('does not load a legacy docs/codebase-map.json without a snapshot manifest', async () => {
    const service = new SemanticSnapshotService();
    await fs.ensureDir(path.join(outputDir, 'docs'));
    await fs.writeJson(path.join(outputDir, 'docs', 'codebase-map.json'), {
      version: '1.0.0',
      generated: new Date().toISOString(),
    }, { spaces: 2 });

    const result = await service.readSummary(repoPath, { allowStale: true });
    expect(result).toBeNull();
  });
});
