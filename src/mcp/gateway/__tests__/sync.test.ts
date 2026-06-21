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
});
