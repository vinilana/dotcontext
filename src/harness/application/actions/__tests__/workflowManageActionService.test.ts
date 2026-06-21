import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessWorkflowManageActionService } from '../workflowManageActionService';

describe('HarnessWorkflowManageActionService', () => {
  let tempDir: string;
  let service: HarnessWorkflowManageActionService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-workflow-manage-action-'));
    service = new HarnessWorkflowManageActionService({ repoPath: tempDir });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('executes workflow management actions without an MCP response envelope', async () => {
    const result = await service.execute({
      action: 'createDoc',
      type: 'adr',
      docName: 'Runtime Boundary',
    });

    expect(result).not.toHaveProperty('content');
    expect(result.success).toBe(false);
    expect(result.error).toBe('No workflow found. Initialize a workflow first.');
  });
});
