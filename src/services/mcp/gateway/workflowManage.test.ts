import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { handleWorkflowAdvance } from './workflowAdvance';
import { handleWorkflowInit } from './workflowInit';
import { handleWorkflowManage } from './workflowManage';

function parseResponse(response: { content: Array<{ text: string }> }) {
  return JSON.parse(response.content[0].text);
}

describe('workflow MCP harness integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-mcp-workflow-'));
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'mcp-workflow-test',
      version: '1.0.0',
      scripts: {
        build: 'node -e "process.exit(0)"',
      },
    }, { spaces: 2 });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('exposes defineTask, recordArtifact, and runSensors through workflow-manage', async () => {
    await handleWorkflowInit({
      name: 'delta',
      scale: 'SMALL',
      autonomous: true,
      repoPath: tempDir,
    }, { repoPath: tempDir });

    const task = parseResponse(await handleWorkflowManage({
      action: 'defineTask',
      taskTitle: 'Implement delta',
      requiredSensors: ['build'],
      requiredArtifacts: ['handoff-summary'],
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    const artifact = parseResponse(await handleWorkflowManage({
      action: 'recordArtifact',
      name: 'handoff-summary',
      kind: 'text',
      content: 'ready',
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    const sensors = parseResponse(await handleWorkflowManage({
      action: 'runSensors',
      sensors: ['build'],
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    expect(task.success).toBe(true);
    expect(task.task.title).toBe('Implement delta');
    expect(artifact.success).toBe(true);
    expect(artifact.artifact.name).toBe('handoff-summary');
    expect(sensors.success).toBe(true);
    expect(sensors.backpressure.blocked).toBe(false);
  });

  it('returns structured harness blocking info from workflow-advance', async () => {
    await handleWorkflowInit({
      name: 'epsilon',
      scale: 'SMALL',
      autonomous: true,
      repoPath: tempDir,
    }, { repoPath: tempDir });

    await handleWorkflowManage({
      action: 'defineTask',
      taskTitle: 'Implement epsilon',
      requiredSensors: ['build'],
      requiredArtifacts: ['handoff-summary'],
      repoPath: tempDir,
    }, { repoPath: tempDir });

    const response = parseResponse(await handleWorkflowAdvance({
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    expect(response.success).toBe(false);
    expect(response.blockedBy).toBe('harness');
    expect(response.reasons).toContain('Missing required sensors: build');
    expect(response.reasons).toContain('Missing required artifacts: handoff-summary');
  });

  it('returns structured policy blocking info from workflow-manage and workflow-advance', async () => {
    await handleWorkflowInit({
      name: 'zeta',
      scale: 'SMALL',
      autonomous: true,
      repoPath: tempDir,
    }, { repoPath: tempDir });

    await fs.ensureDir(path.join(tempDir, '.context', 'harness'));
    await fs.writeJson(
      path.join(tempDir, '.context', 'harness', 'policy.json'),
      {
        version: 1,
        defaultEffect: 'allow',
        rules: [
          {
            id: 'deny-artifact-record',
            effect: 'deny',
            when: {
              tools: ['workflow'],
              actions: ['recordArtifact'],
            },
            reason: 'artifact writes blocked for test',
          },
          {
            id: 'deny-advance',
            effect: 'deny',
            when: {
              tools: ['workflow'],
              actions: ['advance'],
            },
            reason: 'advance blocked for test',
          },
        ],
      },
      { spaces: 2 }
    );

    const artifactResponse = parseResponse(await handleWorkflowManage({
      action: 'recordArtifact',
      name: 'handoff-summary',
      kind: 'text',
      content: 'ready',
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    const advanceResponse = parseResponse(await handleWorkflowAdvance({
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    expect(artifactResponse.success).toBe(false);
    expect(artifactResponse.blockedBy).toBe('policy');
    expect(artifactResponse.reasons).toContain('artifact writes blocked for test');

    expect(advanceResponse.success).toBe(false);
    expect(advanceResponse.blockedBy).toBe('policy');
    expect(advanceResponse.reasons).toContain('advance blocked for test');
  });
});
