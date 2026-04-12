import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';

import { SkillGenerator } from './skillGenerator';

describe('SkillGenerator', () => {
  let tempDir: string;
  let repoPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-skills-'));
    repoPath = path.join(tempDir, 'repo');
    await fs.ensureDir(repoPath);
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  it('generates scaffolded built-in skills with useful starter content', async () => {
    const generator = new SkillGenerator({ repoPath });

    const result = await generator.generate({ skills: ['commit-message'] });

    expect(result.generatedSkills).toEqual(['commit-message']);

    const skillPath = path.join(repoPath, '.context', 'skills', 'commit-message', 'SKILL.md');
    const content = await fs.readFile(skillPath, 'utf-8');

    expect(content).toContain('type: skill');
    expect(content).toContain('skillSlug: commit-message');
    expect(content).toContain('status: unfilled');
    expect(content).toContain('## Workflow');
    expect(content).toContain('## Examples');
    expect(content).toContain('## Quality Bar');
    expect(content).toContain('## Resource Strategy');
    expect(content).not.toContain('## When to Use');
  });

  it('generates custom skills with the generic starter structure', async () => {
    const generator = new SkillGenerator({ repoPath });

    const skillPath = await generator.generateCustomSkill({
      name: 'release-notes',
      description: 'Create release notes for the repository',
    });

    const content = await fs.readFile(skillPath, 'utf-8');

    expect(content).toContain('type: skill');
    expect(content).toContain('skillSlug: release-notes');
    expect(content).toContain('## Workflow');
    expect(content).toContain('## Resource Strategy');
    expect(content).toContain('Avoid extra docs such as `README.md` or `CHANGELOG.md` inside the skill folder.');
  });
});
