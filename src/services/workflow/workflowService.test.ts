import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessWorkflowBlockedError, WorkflowService } from './workflowService';

describe('WorkflowService harness integration', () => {
  let tempDir: string;
  let service: WorkflowService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-workflow-harness-'));
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'workflow-harness-test',
      version: '1.0.0',
      scripts: {
        build: 'node -e "process.exit(0)"',
      },
    }, { spaces: 2 });
    service = new WorkflowService(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('creates a harness session during workflow init', async () => {
    await service.init({
      name: 'alpha',
      scale: 'SMALL',
      autonomous: true,
    });

    const harness = await service.getHarnessStatus();

    expect(harness).not.toBeNull();
    expect(harness?.session.name).toBe('alpha');
    expect(harness?.session.status).toBe('active');
    expect(await fs.pathExists(path.join(tempDir, '.context', 'workflow', 'harness-session.json'))).toBe(true);
  });

  it('blocks workflow advance when required harness checks are missing', async () => {
    await service.init({
      name: 'beta',
      scale: 'SMALL',
      autonomous: true,
    });

    await service.defineHarnessTask({
      title: 'Implement beta',
      requiredSensors: ['build'],
      requiredArtifacts: ['handoff-summary'],
    });

    await expect(service.advance()).rejects.toBeInstanceOf(HarnessWorkflowBlockedError);
  });

  it('allows workflow advance after required sensors and artifacts are satisfied', async () => {
    await service.init({
      name: 'gamma',
      scale: 'SMALL',
      autonomous: true,
    });

    await service.defineHarnessTask({
      title: 'Implement gamma',
      requiredSensors: ['build'],
      requiredArtifacts: ['handoff-summary'],
    });
    await service.recordHarnessArtifact({
      name: 'handoff-summary',
      kind: 'text',
      content: 'ready',
    });

    const sensorResult = await service.runHarnessSensors(['build']);
    const nextPhase = await service.advance();
    const harness = await service.getHarnessStatus();

    expect(sensorResult.backpressure.blocked).toBe(false);
    expect(nextPhase).toBeTruthy();
    expect(harness?.completionCheck.blocked).toBe(false);
    expect(harness?.sensorRuns).toHaveLength(1);
  });

  it('enforces artifact policy rules during workflow execution', async () => {
    await service.init({
      name: 'policy-run',
      scale: 'SMALL',
      autonomous: true,
    });

    await fs.ensureDir(path.join(tempDir, '.context', 'harness'));
    await fs.writeJson(
      path.join(tempDir, '.context', 'harness', 'policy.json'),
      {
        version: 1,
        defaultEffect: 'allow',
        rules: [
          {
            id: 'deny-secret-artifacts',
            effect: 'deny',
            when: {
              tools: ['workflow'],
              actions: ['recordArtifact'],
              paths: ['src/secrets/*'],
            },
            reason: 'secret paths blocked',
          },
        ],
      },
      { spaces: 2 }
    );

    await expect(service.recordHarnessArtifact({
      name: 'secret-output',
      kind: 'file',
      path: 'src/secrets/creds.txt',
    })).rejects.toThrow('Policy blocked workflow.recordArtifact');
  });

  it('enforces checkpoint and handoff policy rules during workflow execution', async () => {
    await service.init({
      name: 'policy-checkpoint-handoff',
      scale: 'SMALL',
      autonomous: true,
    });

    await fs.ensureDir(path.join(tempDir, '.context', 'harness'));
    await fs.writeJson(
      path.join(tempDir, '.context', 'harness', 'policy.json'),
      {
        version: 1,
        defaultEffect: 'allow',
        rules: [
          {
            id: 'deny-checkpoint',
            effect: 'deny',
            when: {
              tools: ['workflow'],
              actions: ['checkpoint'],
            },
            reason: 'checkpoint denied',
          },
          {
            id: 'deny-handoff',
            effect: 'deny',
            when: {
              tools: ['workflow'],
              actions: ['handoff'],
            },
            reason: 'handoff denied',
          },
        ],
      },
      { spaces: 2 }
    );

    await expect(service.checkpointHarnessSession('manual checkpoint')).rejects.toThrow('Policy blocked workflow.checkpoint');
    await expect(service.handoff('planner', 'executor', ['artifact.txt'])).rejects.toThrow('Policy blocked workflow.handoff');
  });
});
