import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessWorkflowActionService } from '../workflowActionService';

describe('HarnessWorkflowActionService', () => {
  let tempDir: string;
  let service: HarnessWorkflowActionService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-workflow-action-'));
    service = new HarnessWorkflowActionService({ repoPath: tempDir });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('executes workflow status without an MCP response envelope', async () => {
    const result = await service.status();

    expect(result).not.toHaveProperty('content');
    expect(result.success).toBe(false);
    expect(result.error).toBe('No workflow found. Initialize a workflow first.');
  });

  it('returns structured advance guidance when no workflow exists', async () => {
    const result = await service.advance();

    expect(result.success).toBe(false);
    expect(result.suggestion).toContain('workflow-init');
  });
});
