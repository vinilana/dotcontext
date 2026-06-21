import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessSyncActionService } from '../syncActionService';

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
});
