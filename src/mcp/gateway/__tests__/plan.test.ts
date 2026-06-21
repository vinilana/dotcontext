import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { handlePlan } from '../plan';

describe('handlePlan', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-plan-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('wraps reusable plan action results in an MCP response', async () => {
    const response = await handlePlan(
      { action: 'getLinked' },
      { repoPath: tempDir }
    );
    const payload = JSON.parse(response.content[0].text);

    expect(response.isError).toBeUndefined();
    expect(payload.success).toBe(true);
    expect(payload.plans.active).toEqual([]);
  });
});
