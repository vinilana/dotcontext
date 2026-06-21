import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessAgentActionService } from '../agentActionService';

describe('HarnessAgentActionService', () => {
  let tempDir: string;
  let service: HarnessAgentActionService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-agent-action-'));
    service = new HarnessAgentActionService({ repoPath: tempDir });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('executes agent actions without an MCP response envelope', async () => {
    const result = await service.execute({ action: 'listTypes' });

    expect(result).not.toHaveProperty('content');
    expect((result.agents as unknown[]).length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it('reuses orchestration behavior from the harness service', async () => {
    const result = await service.execute({
      action: 'orchestrate',
      phase: 'E',
    });

    expect(result.source).toContain('phase: E');
    expect((result.agents as unknown[]).length).toBeGreaterThan(0);
  });
});
