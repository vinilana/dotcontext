import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { WorkflowService } from '../workflowService';
import { WorkflowGuideService } from '../workflowGuideService';

describe('WorkflowGuideService', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-workflow-guide-'));
    await fs.ensureDir(path.join(tempDir, '.context'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('returns inactive guidance when no workflow exists', async () => {
    const service = new WorkflowGuideService({ repoPath: tempDir });
    const result = await service.guide({ intent: 'session_start' });

    expect(result.workflow.active).toBe(false);
    expect(result.context.initialized).toBe(true);
    expect(result.nextSteps.length).toBeGreaterThan(0);
    expect(result.skills.some((skill) => skill.slug === 'dotcontext-workflow')).toBe(true);
    expect(result.decision.allow).toBe(true);
    expect(result.excerpt).toContain('dotcontext workflow guide');
  });

  it('returns active guidance with phase skills when workflow exists', async () => {
    await new WorkflowService(tempDir).init({ name: 'guide-test', scale: 'SMALL' });

    const service = new WorkflowGuideService({ repoPath: tempDir });
    const result = await service.guide({ intent: 'explicit', format: 'full' });

    expect(result.workflow.active).toBe(true);
    expect(result.workflow.name).toBe('guide-test');
    expect(result.workflow.phase).toBe('P');
    expect(result.nextSteps.length).toBeGreaterThan(0);
    expect(result.skills.some((skill) => skill.slug === 'dotcontext-workflow-p')).toBe(true);
    expect(result.excerpt).toContain('phase P');
  });

  it('reports uninitialized context', async () => {
    const bareDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-no-context-'));
    try {
      const service = new WorkflowGuideService({ repoPath: bareDir });
      const result = await service.guide({ intent: 'session_start' });

      expect(result.context.initialized).toBe(false);
      expect(result.excerpt).toContain('No .context/');
    } finally {
      await fs.remove(bareDir);
    }
  });
});
