import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { handleAgent } from '../agent';

describe('handleAgent', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-agent-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('wraps reusable agent action results in an MCP response', async () => {
    const response = await handleAgent(
      { action: 'listTypes' },
      { repoPath: tempDir }
    );
    const payload = JSON.parse(response.content[0].text);

    expect(response.isError).toBeUndefined();
    expect(payload.total).toBeGreaterThan(0);
    expect(payload.agents.length).toBeGreaterThan(0);
  });
});
