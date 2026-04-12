import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { handlePlan } from './plan';
import { handleWorkflowAdvance } from './workflowAdvance';
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

  it('surfaces the bootstrapped active task and the rotated task after workflow advance', async () => {
    await handleWorkflowInit({
      name: 'status-rotation',
      scale: 'MEDIUM',
      autonomous: true,
      repoPath: tempDir,
    }, { repoPath: tempDir });

    await fs.ensureDir(path.join(tempDir, '.context', 'plans'));
    await fs.writeFile(
      path.join(tempDir, '.context', 'plans', 'status-rotation.md'),
      '# Status Rotation\n\n> Status regression.\n\n### Phase 1 - Discovery & Alignment\n1. Review the current system state\n2. Capture the phase bootstrap outputs\n\n### Phase 2 - Implementation\n1. Execute the implementation work\n',
      'utf-8'
    );

    await parseResponse(await handlePlan({
      action: 'link',
      planSlug: 'status-rotation',
    }, { repoPath: tempDir }));

    const beforeAdvance = parseResponse(await handleWorkflowStatus({
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    expect(beforeAdvance.success).toBe(true);
    expect(beforeAdvance.harness.binding.activeTaskId).toBeDefined();
    expect(beforeAdvance.harness.taskContracts).toHaveLength(1);

    const bootstrapTaskId = beforeAdvance.harness.binding.activeTaskId;

    const advanceResponse = parseResponse(await handleWorkflowAdvance({
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    expect(advanceResponse.success).toBe(true);

    const afterAdvance = parseResponse(await handleWorkflowStatus({
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    expect(afterAdvance.success).toBe(true);
    expect(afterAdvance.currentPhase.code).toBe('R');
    expect(afterAdvance.harness.taskContracts).toHaveLength(2);
    expect(afterAdvance.harness.binding.activeTaskId).toBeDefined();
    expect(afterAdvance.harness.binding.activeTaskId).not.toBe(bootstrapTaskId);
    expect(afterAdvance.harness.taskContracts.find((task: { id: string; status: string }) => task.id === bootstrapTaskId)?.status).toBe('completed');
    expect(afterAdvance.harness.taskContracts.find((task: { id: string; status: string }) => task.id === afterAdvance.harness.binding.activeTaskId)?.status).toBe('ready');
  });
});
