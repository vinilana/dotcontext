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
    expect(await fs.pathExists(path.join(tempDir, '.context', 'harness', 'workflows', 'prevc.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.context', 'workflow', 'status.yaml'))).toBe(false);
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

  it('includes harness task details in formatted status output', async () => {
    await service.init({
      name: 'formatted-status',
      scale: 'SMALL',
      autonomous: true,
    });

    await service.defineHarnessTask({
      title: 'Implement formatted status',
      requiredSensors: ['build'],
    });

    const formatted = await service.getFormattedStatus();

    expect(formatted).toContain('Harness:');
    expect(formatted).toContain('Tasks: 1');
    expect(formatted).toContain('Active Task: Implement formatted status (ready)');
  });

  it('registers sensors from project scripts instead of assuming a universal Node set', async () => {
    const sensors = service.listAvailableSensors();

    expect(sensors.map((sensor) => sensor.id)).toEqual(['build']);
  });

  it('detects Python sensors without assuming Node scripts', async () => {
    const pythonDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-python-workflow-'));

    try {
      await fs.writeFile(path.join(pythonDir, 'pyproject.toml'), '[project]\nname = "python-workflow-test"\nversion = "0.1.0"\n');
      await fs.writeFile(path.join(pythonDir, 'mypy.ini'), '[mypy]\npython_version = 3.11\n');

      const pythonService = new WorkflowService(pythonDir);
      const sensors = pythonService.listAvailableSensors();

      expect(sensors.map((sensor) => sensor.id)).toEqual(['test', 'typecheck']);
    } finally {
      await fs.remove(pythonDir);
    }
  });

  it('loads customizable sensors from .context/harness/sensors.json', async () => {
    await fs.ensureDir(path.join(tempDir, '.context', 'harness'));
    await fs.writeJson(
      path.join(tempDir, '.context', 'harness', 'sensors.json'),
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        source: 'manual',
        sensors: [
          {
            id: 'quality',
            name: 'Quality',
            severity: 'warning',
            command: 'echo quality',
          },
          {
            id: 'build',
            name: 'Build',
            severity: 'critical',
            command: 'npm run build',
            script: 'build',
            enabled: false,
          },
        ],
      },
      { spaces: 2 }
    );

    const customizedService = new WorkflowService(tempDir);
    const sensors = customizedService.listAvailableSensors();

    expect(sensors.map((sensor) => sensor.id)).toEqual(['quality']);
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
