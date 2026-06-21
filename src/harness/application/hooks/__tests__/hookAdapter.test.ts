import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import {
  HarnessHookAdapter,
  createHarnessHookAdapter,
} from '../hookAdapter';

describe('HarnessHookAdapter', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-hook-adapter-'));
    await fs.outputFile(path.join(tempDir, 'README.md'), '# Hook Runtime\n');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('executes hook events through the adapter runtime without an MCP envelope', async () => {
    const adapter = new HarnessHookAdapter({ repoPath: tempDir });

    const response = await adapter.handle({
      tool: 'explore',
      requestId: 'req-1',
      source: 'codex',
      metadata: { branch: 'main' },
      params: {
        action: 'read',
        filePath: path.join(tempDir, 'README.md'),
      },
    });

    expect(response.ok).toBe(true);
    expect(response.source).toBe('codex');
    expect(response.requestId).toBe('req-1');
    expect(response.metadata).toEqual({ branch: 'main' });

    if (!response.ok) {
      throw new Error(response.error.message);
    }

    expect(response.result.kind).toBe('json');
    expect((response.result as { data: { content: string } }).data.content)
      .toContain('# Hook Runtime');
  });

  it('provides source-specific factories for hook hosts', async () => {
    const runtime = {
      execute: jest.fn().mockResolvedValue({
        kind: 'json',
        data: { initialized: false },
      }),
    };
    const adapter = createHarnessHookAdapter({ runtime, source: 'claude-code' });

    const response = await adapter.handle({
      tool: 'context',
      params: { action: 'check' },
    });

    expect(runtime.execute).toHaveBeenCalledWith({
      tool: 'context',
      params: { action: 'check' },
    });
    expect(response.ok).toBe(true);
    expect(response.source).toBe('claude-code');
  });

  it('returns adapter-neutral errors for invalid hook events', async () => {
    const adapter = new HarnessHookAdapter({ repoPath: tempDir });

    const response = await adapter.handle({
      tool: 'unknown',
      requestId: 'bad-1',
      params: {},
    });

    expect(response).toEqual({
      ok: false,
      source: 'generic',
      requestId: 'bad-1',
      error: {
        message: 'Hook event tool must be a supported harness adapter tool',
        name: 'Error',
      },
    });
  });
});
