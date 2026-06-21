import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessContextActionService } from '../contextActionService';

describe('HarnessContextActionService', () => {
  let tempDir: string;
  let service: HarnessContextActionService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-context-action-'));
    service = new HarnessContextActionService({ repoPath: tempDir });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('executes context status actions without an MCP response envelope', async () => {
    const result = await service.execute({ action: 'check' });

    expect(result.kind).toBe('json');
    expect(result).not.toHaveProperty('content');
    expect((result as { data: { initialized: boolean } }).data.initialized).toBe(false);
  });

  it('keeps context validation in the reusable action port', async () => {
    await expect(service.execute({ action: 'searchQA' }))
      .rejects
      .toThrow('Query is required for searchQA action');
  });
});
