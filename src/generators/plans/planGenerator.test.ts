import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';

import { PlanGenerator } from './planGenerator';

function createTempOutput(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('PlanGenerator', () => {
  let tempDir: string;
  let outputDir: string;
  let generator: PlanGenerator;

  beforeEach(async () => {
    tempDir = await createTempOutput('dotcontext-plans-');
    outputDir = path.join(tempDir, '.context');
    generator = new PlanGenerator();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  it('creates a plan file and updates the index', async () => {
    const result = await generator.generatePlan({
      planName: 'New Initiative',
      outputDir
    });

    expect(result.slug).toBe('new-initiative');

    const planPath = path.join(outputDir, 'plans', 'new-initiative.md');
    expect(await fs.pathExists(planPath)).toBe(true);

    const content = await fs.readFile(planPath, 'utf8');
    expect(content).toContain('# New Initiative Plan');
    expect(content).toContain('## Task Snapshot');
    expect(content).toContain('## Working Phases');
    expect(content).toContain('**Commit Checkpoint**');

    const indexContent = await fs.readFile(path.join(outputDir, 'plans', 'README.md'), 'utf8');
    expect(indexContent).toContain('1. [New Initiative](./new-initiative.md)');
  });

  it('respects selected agents and docs and supports force overwrite', async () => {
    const options = {
      planName: 'Release Readiness',
      outputDir,
      selectedAgentTypes: ['test-writer'],
      selectedDocKeys: ['testing-strategy']
    };

    const firstResult = await generator.generatePlan(options);
    const planPath = path.join(outputDir, 'plans', 'release-readiness.md');
    const content = await fs.readFile(planPath, 'utf8');

    expect(content).toContain('[Test Writer](../agents/test-writer.md)');
    expect(content).toContain('[testing-strategy.md](../docs/testing-strategy.md)');

    await expect(generator.generatePlan(options)).rejects.toThrow('Plan already exists');

    const forcedResult = await generator.generatePlan({ ...options, force: true, summary: 'Dry run' });
    expect(forcedResult.slug).toBe(firstResult.slug);

    const updatedContent = await fs.readFile(planPath, 'utf8');
    expect(updatedContent).toContain('Dry run');
  });
});
