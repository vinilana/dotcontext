import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';

import { SkillExportService } from './skillExportService';
import { minimalUI, mockTranslate } from '../shared';

describe('SkillExportService', () => {
  let tempDir: string;
  let repoPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-skill-export-'));
    repoPath = path.join(tempDir, 'repo');
    await fs.ensureDir(repoPath);
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  it('exports portable skill frontmatter and falls back to the built-in template body', async () => {
    const scaffoldPath = path.join(repoPath, '.context', 'skills', 'commit-message', 'SKILL.md');
    await fs.outputFile(
      scaffoldPath,
      [
        '---',
        'name: Commit Message',
        'description: Generate commit messages for this repository',
        'phases: [E, C]',
        '---',
        '',
      ].join('\n'),
      'utf-8'
    );

    const service = new SkillExportService({
      ui: minimalUI as any,
      t: mockTranslate,
      version: 'test',
    });

    const result = await service.run(repoPath, {
      targets: ['.out/skills'],
      skills: ['commit-message'],
      force: true,
    });

    expect(result.filesCreated).toBe(1);

    const exportedPath = path.join(repoPath, '.out', 'skills', 'commit-message', 'SKILL.md');
    const content = await fs.readFile(exportedPath, 'utf-8');

    expect(content).toContain('name: commit-message');
    expect(content).toContain('description: Generate commit messages for this repository');
    expect(content).not.toContain('phases:');
    expect(content).not.toContain('type: skill');
    expect(content).not.toContain('status: unfilled');
    expect(content).toContain('## Workflow');
    expect(content).toContain('## Resource Strategy');
    expect(content).not.toContain('## When to Use');
  });
});
