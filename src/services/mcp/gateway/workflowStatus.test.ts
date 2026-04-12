import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { handleWorkflowInit } from './workflowInit';
import { handleWorkflowManage } from './workflowManage';
import { handleWorkflowStatus } from './workflowStatus';

function parseResponse(response: { content: Array<{ text: string }> }) {
  return JSON.parse(response.content[0].text);
}

describe('workflowStatus', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-workflow-status-'));
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'workflow-status-test',
      version: '1.0.0',
      scripts: {
        build: 'node -e "process.exit(0)"',
      },
    }, { spaces: 2 });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('surfaces harness task information for active workflows', async () => {
    await handleWorkflowInit({
      name: 'theta',
      scale: 'SMALL',
      autonomous: true,
      repoPath: tempDir,
    }, { repoPath: tempDir });

    const defined = parseResponse(await handleWorkflowManage({
      action: 'defineTask',
      taskTitle: 'Implement theta',
      requiredSensors: ['build'],
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    const response = parseResponse(await handleWorkflowStatus({
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    expect(response.success).toBe(true);
    expect(response.harness).toBeTruthy();
    expect(response.harness.binding.activeTaskId).toBe(defined.task.id);
    expect(response.harness.taskContracts).toHaveLength(1);
    expect(response.harness.taskContracts[0].title).toBe('Implement theta');
  });
});
