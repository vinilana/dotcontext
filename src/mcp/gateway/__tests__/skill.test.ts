import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { handleSkill } from '../skill';

describe('handleSkill', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-skill-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('wraps reusable skill action results in an MCP response', async () => {
    const response = await handleSkill(
      { action: 'list' },
      { repoPath: tempDir }
    );
    const payload = JSON.parse(response.content[0].text);

    expect(response.isError).toBeUndefined();
    expect(payload.success).toBe(true);
    expect(payload.totalSkills).toBeGreaterThan(0);
  });
});
