import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { getSkillsForProjectType } from '../../stack';
import { HarnessContextService } from '../../harness';
import { toolExecutionContext } from '../../shared';
import { checkScaffoldingTool } from './checkScaffoldingTool';
import { cleanupSharedContext, fillSingleFileTool, listFilesToFillTool } from './fillScaffoldingTool';
import { initializeContextTool } from './initializeContextTool';

describe('context scaffolding tools', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-scaffold-'));
    await fs.ensureDir(path.join(tempDir, 'src'));
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'context-test-repo',
      version: '0.0.0',
    }, { spaces: 2 });
    await fs.writeFile(
      path.join(tempDir, 'src', 'index.ts'),
      'export function main(): string { return "ok"; }\n',
      'utf-8'
    );
  });

  afterEach(async () => {
    await cleanupSharedContext();
    await fs.remove(tempDir);
  });

  it('generates project-filtered skills and includes them in pending writes', async () => {
    const result = await initializeContextTool.execute!(
      {
        repoPath: tempDir,
        type: 'agents',
        projectType: 'cli',
        generateQA: false,
        skipContentGeneration: true,
      },
      toolExecutionContext
    ) as Record<string, any>;

    const expectedSkills = [...getSkillsForProjectType('cli')].sort();
    const skillsDir = path.join(tempDir, '.context', 'skills');
    const gitignorePath = path.join(tempDir, '.gitignore');
    const generatedSkillDirs = (await fs.readdir(skillsDir))
      .filter((entry) => entry !== 'README.md')
      .sort();
    const gitignore = await fs.readFile(gitignorePath, 'utf-8');

    expect(result.status).toBe('incomplete');
    expect(result.skillsGenerated).toBe(expectedSkills.length);
    expect(result.sensorsGenerated).toBeDefined();
    expect(result.gitignoreUpdated).toBe(true);
    expect(result.gitignoreAddedPatterns).toContain('.context/plans/');
    expect(result.gitignoreAddedPatterns).toContain('.context/workflow/');
    expect(await fs.pathExists(path.join(tempDir, '.context', 'harness', 'sensors.json'))).toBe(true);
    expect(gitignore).toContain('.context/plans/');
    expect(gitignore).toContain('# dotcontext runtime state');
    expect(gitignore).toContain('.context/workflow/');
    expect(gitignore).toContain('.context/harness/sessions/');
    expect(generatedSkillDirs).toEqual(expectedSkills);
    expect(result.pendingWrites.some((item: { fileType: string }) => item.fileType === 'skill')).toBe(true);
  });

  it('lists skill scaffolds and resolves skill metadata when filling a single file', async () => {
    await initializeContextTool.execute!(
      {
        repoPath: tempDir,
        type: 'agents',
        projectType: 'cli',
        generateQA: false,
        skipContentGeneration: true,
      },
      toolExecutionContext
    );

    const listed = await listFilesToFillTool.execute!(
      {
        repoPath: tempDir,
        target: 'skills',
      },
      toolExecutionContext
    ) as Record<string, any>;

    expect(listed.success).toBe(true);
    expect(listed.totalCount).toBeGreaterThan(0);
    expect(listed.files.every((file: { type: string }) => file.type === 'skill')).toBe(true);

    const firstSkill = listed.files[0];
    const filled = await fillSingleFileTool.execute!(
      {
        repoPath: tempDir,
        filePath: firstSkill.path,
      },
      toolExecutionContext
    ) as Record<string, any>;

    expect(filled.success).toBe(true);
    expect(filled.fileType).toBe('skill');
    expect(filled.documentName).toBe(firstSkill.relativePath.split('/')[1]);
  });

  it('reports skills plus workflow and harness runtime readiness in scaffolding status', async () => {
    await initializeContextTool.execute!(
      {
        repoPath: tempDir,
        type: 'agents',
        projectType: 'cli',
        generateQA: false,
        skipContentGeneration: true,
      },
      toolExecutionContext
    );

    const initial = await checkScaffoldingTool.execute!(
      { repoPath: tempDir },
      toolExecutionContext
    ) as Record<string, any>;

    expect(initial.initialized).toBe(true);
    expect(initial.agents).toBe(true);
    expect(initial.skills).toBe(true);
    expect(initial.sensors).toBe(true);
    expect(initial.workflow).toBe(false);
    expect(initial.harness).toBe(false);

    await fs.ensureDir(path.join(tempDir, '.context', 'workflow'));
    await fs.writeFile(path.join(tempDir, '.context', 'workflow', 'status.json'), '{}', 'utf-8');
    await fs.ensureDir(path.join(tempDir, '.context', 'harness'));
    await fs.ensureDir(path.join(tempDir, '.context', 'harness', 'sessions'));
    await fs.writeJson(path.join(tempDir, '.context', 'harness', 'sessions', 's1.json'), { id: 's1' }, { spaces: 2 });

    const hydrated = await checkScaffoldingTool.execute!(
      { repoPath: tempDir },
      toolExecutionContext
    ) as Record<string, any>;

    expect(hydrated.workflow).toBe(true);
    expect(hydrated.harness).toBe(true);
  });

  it('summarizes bootstrap readiness across scaffold and runtime state', async () => {
    await initializeContextTool.execute!(
      {
        repoPath: tempDir,
        type: 'agents',
        projectType: 'cli',
        generateQA: false,
        skipContentGeneration: true,
      },
      toolExecutionContext
    );

    const service = new HarnessContextService({
      repoPath: tempDir,
      contextBuilder: {} as any,
    });

    const initial = await service.bootstrapStatus();
    expect(initial.layout.versioned.some((entry: { path: string }) => entry.path === '.context/harness/sensors.json')).toBe(true);
    expect(initial.layout.local.some((entry: { path: string }) => entry.path === '.context/plans/**')).toBe(true);
    expect(initial.layout.runtime.some((entry: { path: string }) => entry.path === '.context/workflow/**')).toBe(true);
    expect(initial.readiness.scaffoldReady).toBe(true);
    expect(initial.readiness.skillsReady).toBe(true);
    expect(initial.readiness.sensorsReady).toBe(true);
    expect(initial.readiness.workflowReady).toBe(false);
    expect(initial.readiness.harnessReady).toBe(false);

    await fs.ensureDir(path.join(tempDir, '.context', 'workflow'));
    await fs.writeJson(path.join(tempDir, '.context', 'workflow', 'harness-session.json'), { sessionId: 's1' }, { spaces: 2 });
    await fs.ensureDir(path.join(tempDir, '.context', 'harness', 'sessions'));
    await fs.writeJson(path.join(tempDir, '.context', 'harness', 'sessions', 's1.json'), { id: 's1' }, { spaces: 2 });

    const hydrated = await service.bootstrapStatus();
    expect(hydrated.runtime.workflow).toBe(true);
    expect(hydrated.runtime.harnessBinding).toBe(true);
    expect(hydrated.runtime.sessionCount).toBe(1);
    expect(hydrated.readiness.harnessReady).toBe(true);
    expect(hydrated.readiness.complete).toBe(true);
  });

  it('generates QA docs during init but excludes them from pending writes', async () => {
    const result = await initializeContextTool.execute!(
      {
        repoPath: tempDir,
        type: 'docs',
        projectType: 'cli',
        skipContentGeneration: true,
      },
      toolExecutionContext
    ) as Record<string, any>;

    const qaDir = path.join(tempDir, '.context', 'docs', 'qa');
    const qaFiles = (await fs.readdir(qaDir))
      .filter((entry) => entry.toLowerCase() !== 'readme.md')
      .sort();
    const firstQaFile = await fs.readFile(path.join(qaDir, qaFiles[0]), 'utf-8');

    expect(result.qaGenerated).toBeGreaterThan(0);
    expect(result.qaNote).toContain('.context/docs/qa');
    expect(result.pendingWrites.every((item: { filePath: string }) => !item.filePath.includes(`${path.sep}.context${path.sep}docs${path.sep}qa${path.sep}`))).toBe(true);
    expect(qaFiles.length).toBeGreaterThan(0);
    expect(firstQaFile).toContain('# ');

    const listedDocs = await listFilesToFillTool.execute!(
      {
        repoPath: tempDir,
        target: 'docs',
      },
      toolExecutionContext
    ) as Record<string, any>;

    expect(listedDocs.files.some((file: { relativePath: string }) => file.relativePath.startsWith('docs/qa/'))).toBe(false);
  });

  it('lists nested unfilled docs under docs/qa for fill operations', async () => {
    await initializeContextTool.execute!(
      {
        repoPath: tempDir,
        type: 'docs',
        projectType: 'cli',
        generateQA: false,
        skipContentGeneration: true,
      },
      toolExecutionContext
    );

    const nestedDocPath = path.join(tempDir, '.context', 'docs', 'qa', 'custom-question.md');
    await fs.ensureDir(path.dirname(nestedDocPath));
    await fs.writeFile(
      nestedDocPath,
      [
        '---',
        'type: doc',
        'name: custom-question',
        'description: Custom nested QA scaffold',
        'generated: 2026-04-11',
        'status: unfilled',
        'scaffoldVersion: "2.0.0"',
        '---',
        '',
      ].join('\n'),
      'utf-8'
    );

    const listedDocs = await listFilesToFillTool.execute!(
      {
        repoPath: tempDir,
        target: 'docs',
      },
      toolExecutionContext
    ) as Record<string, any>;

    const nestedDoc = listedDocs.files.find((file: { relativePath: string }) => file.relativePath === 'docs/qa/custom-question.md');

    expect(nestedDoc).toBeDefined();

    const filled = await fillSingleFileTool.execute!(
      {
        repoPath: tempDir,
        filePath: nestedDoc.path,
      },
      toolExecutionContext
    ) as Record<string, any>;

    expect(filled.success).toBe(true);
    expect(filled.fileType).toBe('doc');
    expect(filled.documentName).toBe('custom-question');
  });
});
