import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessAdapterRuntime } from '../adapterRuntime';

describe('HarnessAdapterRuntime', () => {
  let tempDir: string;
  let runtime: HarnessAdapterRuntime;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-adapter-runtime-'));
    await fs.outputFile(path.join(tempDir, 'README.md'), '# Runtime\n');
    runtime = new HarnessAdapterRuntime({ repoPath: tempDir });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('executes MCP-equivalent tools through an adapter-neutral facade', async () => {
    const result = await runtime.execute({
      tool: 'explore',
      params: {
        action: 'read',
        filePath: path.join(tempDir, 'README.md'),
      },
    });

    expect(result.kind).toBe('json');
    expect((result as { data: { content: string } }).data.content).toContain('# Runtime');
  });

  it('preserves non-json context result kinds for adapters to serialize', async () => {
    const result = await runtime.execute({
      tool: 'context',
      params: {
        action: 'check',
      },
    });

    expect(result.kind).toBe('json');
    expect((result as { data: { initialized: boolean } }).data.initialized).toBe(false);
  });
});
