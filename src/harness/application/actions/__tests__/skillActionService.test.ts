import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessSkillActionService } from '../skillActionService';

describe('HarnessSkillActionService', () => {
  let tempDir: string;
  let service: HarnessSkillActionService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-skill-action-'));
    service = new HarnessSkillActionService({ repoPath: tempDir });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('executes skill actions without an MCP response envelope', async () => {
    const result = await service.execute({ action: 'list' });

    expect(result).not.toHaveProperty('content');
    expect(result.success).toBe(true);
    expect(result.totalSkills).toBeGreaterThan(0);
  });

  it('reuses phase filtering behavior from the harness service', async () => {
    const result = await service.execute({
      action: 'getForPhase',
      phase: 'E',
    });

    expect(result.success).toBe(true);
    expect(result.phase).toBe('E');
    expect(result.count).toBeGreaterThan(0);
  });
});
