import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { handleExplore } from '../explore';

describe('handleExplore', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-explore-'));
    await fs.outputFile(path.join(tempDir, 'README.md'), '# Example\n');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('wraps reusable explore action results in an MCP response', async () => {
    const response = await handleExplore(
      {
        action: 'read',
        filePath: path.join(tempDir, 'README.md'),
      },
      { repoPath: tempDir }
    );
    const payload = JSON.parse(response.content[0].text);

    expect(response.isError).toBeUndefined();
    expect(payload.success).toBe(true);
    expect(payload.content).toContain('# Example');
  });
});
