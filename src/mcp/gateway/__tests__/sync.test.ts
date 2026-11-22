import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { handleSync } from '../sync';

describe('handleSync', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-sync-'));
    await fs.outputFile(path.join(tempDir, '.context', 'docs', 'README.md'), '# Rules\n');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('wraps reusable sync action results in an MCP response', async () => {
    const response = await handleSync(
      {
        action: 'exportRules',
        preset: 'claude',
        dryRun: true,
      },
      { repoPath: tempDir }
    );
    const payload = JSON.parse(response.content[0].text);

    expect(response.isError).toBeUndefined();
    expect(payload.success).toBe(true);
    expect(payload.dryRun).toBe(true);
  });

  it('exportSkills dry run reports a preview without writing files', async () => {
    await fs.outputFile(
      path.join(tempDir, '.context', 'skills', 'sample', 'SKILL.md'),
      '---\nname: sample\ndescription: Sample skill\n---\n# Sample\n'
    );

    const markers = ['.claude', '.codex', '.gemini', '.windsurf', '.github', '.agents'];
    const before = new Set((await fs.readdir(tempDir)).filter((entry) => markers.includes(entry)));

    const response = await handleSync(
      {
        action: 'exportSkills',
        preset: 'claude',
        dryRun: true,
      },
      { repoPath: tempDir }
    );
    const payload = JSON.parse(response.content[0].text);
    const after = new Set((await fs.readdir(tempDir)).filter((entry) => markers.includes(entry)));

    expect(before).toEqual(after);
    expect(payload.dryRun).toBe(true);
    expect(payload.filesCreated).toBeGreaterThan(0);
    expect(payload.skillsExported).toContain('sample');
    expect(await fs.pathExists(path.join(tempDir, '.claude', 'skills', 'sample', 'SKILL.md'))).toBe(false);
  });
});
