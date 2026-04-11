import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import {
  fillSingleFileTool,
  getCodebaseMapTool,
  initializeContextTool,
  listFilesToFillTool,
} from './contextTools';
import { toolExecutionContext } from '../shared';

describe('contextTools sensors scaffolding', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-context-tools-'));
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'context-tools-test',
      version: '1.0.0',
      scripts: {
        build: 'tsc -p tsconfig.json',
        test: 'jest --runInBand',
        lint: 'eslint .',
      },
    }, { spaces: 2 });
    await fs.ensureDir(path.join(tempDir, 'src'));
    await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), 'export const ok = true;\n', 'utf-8');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('includes bootstrap sensors.json in pending writes and listToFill', async () => {
    const result = await initializeContextTool.execute!(
      {
        repoPath: tempDir,
        type: 'docs',
        generateQA: false,
        skipContentGeneration: true,
      },
      toolExecutionContext
    ) as Record<string, any>;

    const sensorsPath = path.join(tempDir, '.context', 'harness', 'sensors.json');

    expect(result.pendingWrites.some((item: { filePath: string }) => item.filePath === sensorsPath)).toBe(true);

    const listed = await listFilesToFillTool.execute!(
      {
        repoPath: tempDir,
        target: 'sensors',
      },
      toolExecutionContext
    ) as Record<string, any>;

    expect(listed.files).toHaveLength(1);
    expect(listed.files[0].relativePath).toBe(path.join('harness', 'sensors.json'));
    expect(listed.files[0].type).toBe('sensor');
  });

  it('generates a repo-specific harness policy during init', async () => {
    await initializeContextTool.execute!(
      {
        repoPath: tempDir,
        type: 'docs',
        generateQA: false,
        skipContentGeneration: true,
      },
      toolExecutionContext
    );

    const policy = await fs.readJson(path.join(tempDir, '.context', 'harness', 'policy.json'));
    const protectedPaths = policy.rules
      .flatMap((rule: { when?: { paths?: string[] } }) => rule.when?.paths ?? []);

    expect(protectedPaths).toEqual(expect.arrayContaining(['src/**', 'package.json']));
    expect(protectedPaths).not.toEqual(expect.arrayContaining(['src/services/mcp/**', 'src/workflow/**']));
  });

  it('returns JSON-specific guidance when filling sensors.json', async () => {
    await initializeContextTool.execute!(
      {
        repoPath: tempDir,
        type: 'docs',
        generateQA: false,
        skipContentGeneration: true,
      },
      toolExecutionContext
    );

    const sensorsPath = path.join(tempDir, '.context', 'harness', 'sensors.json');
    const result = await fillSingleFileTool.execute!(
      {
        repoPath: tempDir,
        filePath: sensorsPath,
      },
      toolExecutionContext
    ) as Record<string, any>;

    expect(result.success).toBe(true);
    expect(result.fileType).toBe('sensor');
    expect(result.currentCatalog.sensors.map((sensor: { id: string }) => sensor.id)).toEqual(['build', 'test', 'lint']);
    expect(result.instructions).toContain('complete JSON sensor catalog');
    expect(result.instructions).toContain('set source to "manual"');
  });

  it('skips manual sensors catalogs from listToFill', async () => {
    await initializeContextTool.execute!(
      {
        repoPath: tempDir,
        type: 'docs',
        generateQA: false,
        skipContentGeneration: true,
      },
      toolExecutionContext
    );

    const sensorsPath = path.join(tempDir, '.context', 'harness', 'sensors.json');
    const catalog = await fs.readJson(sensorsPath);
    catalog.source = 'manual';
    await fs.writeJson(sensorsPath, catalog, { spaces: 2 });

    const listed = await listFilesToFillTool.execute!(
      {
        repoPath: tempDir,
        target: 'sensors',
      },
      toolExecutionContext
    ) as Record<string, any>;

    expect(listed.files).toEqual([]);
  });

  it('auto-builds and auto-refreshes semantic snapshot sections through getMap', async () => {
    const legacySummaryPath = path.join(tempDir, '.context', 'docs', 'codebase-map.json');
    await fs.ensureDir(path.dirname(legacySummaryPath));
    await fs.writeJson(legacySummaryPath, {
      legacy: true,
      note: 'must be ignored when no snapshot manifest exists',
    }, { spaces: 2 });

    const missingResult = await getCodebaseMapTool.execute!(
      {
        repoPath: tempDir,
        section: 'keyFiles',
      },
      toolExecutionContext
    ) as Record<string, any>;

    expect(missingResult.success).toBe(true);
    expect(missingResult.source).toBe('snapshot');
    expect(missingResult.fresh).toBe(true);
    expect(missingResult.refreshed).toBe(true);
    expect(missingResult.refreshReason).toBe('missing');
    expect(Array.isArray(missingResult.data)).toBe(true);
    expect(typeof missingResult.mapPath).toBe('string');
    expect((missingResult.mapPath as string)).toMatch(
      new RegExp(`\\.context${path.sep}cache${path.sep}semantic-index\\.v2${path.sep}versions${path.sep}.+${path.sep}key-files\\.json$`)
    );
    expect(await fs.pathExists(path.join(tempDir, '.context', 'cache', 'semantic-index.v2', 'manifest.json'))).toBe(true);

    const beforeGeneratedAt = missingResult.generatedAt as string | null;
    await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), 'export const ok = false;\n', 'utf-8');
    await new Promise((resolve) => setTimeout(resolve, 10));

    const staleResult = await getCodebaseMapTool.execute!(
      {
        repoPath: tempDir,
        section: 'stats',
      },
      toolExecutionContext
    ) as Record<string, any>;

    expect(staleResult.success).toBe(true);
    expect(staleResult.source).toBe('snapshot');
    expect(staleResult.fresh).toBe(true);
    expect(staleResult.refreshed).toBe(true);
    expect(staleResult.refreshReason).toBe('stale');
    expect(staleResult.data.totalFiles).toBeGreaterThan(0);
    expect(staleResult.generatedAt).not.toBe(beforeGeneratedAt);
  });
});
