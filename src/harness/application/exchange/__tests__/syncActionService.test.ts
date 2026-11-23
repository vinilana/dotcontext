import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessSyncActionService } from '../syncActionService';

const EXPORT_MARKER_DIRS = ['.claude', '.codex', '.gemini', '.windsurf', '.github', '.agents'] as const;

async function listExportMarkerDirs(repoPath: string): Promise<string[]> {
  const entries = await fs.readdir(repoPath);
  return entries.filter((entry) => EXPORT_MARKER_DIRS.includes(entry as (typeof EXPORT_MARKER_DIRS)[number]));
}

describe('HarnessSyncActionService', () => {
  let tempDir: string;
  let service: HarnessSyncActionService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-action-'));
    await fs.outputFile(path.join(tempDir, '.context', 'docs', 'README.md'), '# Rules\n');
    service = new HarnessSyncActionService({ repoPath: tempDir });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('executes sync actions without an MCP response envelope', async () => {
    const result = await service.execute({
      action: 'exportRules',
      preset: 'claude',
      dryRun: true,
    });

    expect(result).not.toHaveProperty('content');
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.filesSkipped).toBeGreaterThan(0);
  });

  it('exportSkills dry run previews without creating export directories', async () => {
    await fs.outputFile(
      path.join(tempDir, '.context', 'skills', 'sample', 'SKILL.md'),
      '---\nname: sample\ndescription: Sample skill\n---\n# Sample\n'
    );

    const before = await listExportMarkerDirs(tempDir);
    const result = await service.execute({
      action: 'exportSkills',
      preset: 'claude',
      dryRun: true,
    });
    const after = await listExportMarkerDirs(tempDir);

    expect(before).toEqual(after);
    expect(result.dryRun).toBe(true);
    expect(result.success).toBe(true);
    expect(result.filesCreated).toBeGreaterThan(0);
    expect(result.skillsExported).toContain('sample');
  });
});
