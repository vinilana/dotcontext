import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessExploreActionService } from '../exploreActionService';

describe('HarnessExploreActionService', () => {
  let tempDir: string;
  let service: HarnessExploreActionService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-explore-action-'));
    await fs.outputFile(path.join(tempDir, 'src', 'example.ts'), 'export const value = 1;\n');
    service = new HarnessExploreActionService({ repoPath: tempDir });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('executes file read actions without an MCP response envelope', async () => {
    const result = await service.execute({
      action: 'read',
      filePath: path.join(tempDir, 'src', 'example.ts'),
    });

    expect(Array.isArray(result.content)).toBe(false);
    expect(result.success).toBe(true);
    expect(result.content).toContain('export const value');
  });

  it('uses the configured repo path as the default list cwd', async () => {
    const result = await service.execute({
      action: 'list',
      pattern: 'src/**/*.ts',
    });

    expect(result.success).toBe(true);
    expect(result.files).toEqual(['src/example.ts']);
  });
});
