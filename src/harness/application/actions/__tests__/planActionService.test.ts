import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessPlanActionService } from '../planActionService';

describe('HarnessPlanActionService', () => {
  let tempDir: string;
  let service: HarnessPlanActionService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-plan-action-'));
    service = new HarnessPlanActionService({ repoPath: tempDir });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('executes plan actions without an MCP response envelope', async () => {
    const result = await service.execute({ action: 'getLinked' });

    expect(result).not.toHaveProperty('content');
    expect(result.success).toBe(true);
    expect((result.plans as { active: unknown[] }).active).toEqual([]);
  });

  it('keeps plan validation in the reusable action port', async () => {
    const result = await service.execute({ action: 'commitPhase' });

    expect(result).toEqual({
      success: false,
      error: 'planSlug and phaseId are required for commitPhase action',
    });
  });
});
