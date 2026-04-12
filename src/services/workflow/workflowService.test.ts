import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessPlansService } from '../harness';
import { HarnessWorkflowStateService } from '../harness/workflowStateService';
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
    const workflowState = new HarnessWorkflowStateService({
      contextPath: path.join(tempDir, '.context'),
    });
    const binding = await workflowState.getBinding();

    expect(harness).not.toBeNull();
    expect(harness?.session.name).toBe('alpha');
    expect(harness?.session.status).toBe('active');
    expect(binding?.sessionId).toBe(harness?.session.id);
    expect(binding?.workflowName).toBe('alpha');
    expect(await fs.pathExists(path.join(tempDir, '.context', 'harness', 'workflows', 'prevc.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.context', 'workflow', 'status.yaml'))).toBe(false);
  });

  it('creates a fresh canonical binding when a workflow is reinitialized', async () => {
    await service.init({
      name: 'alpha',
      scale: 'SMALL',
      autonomous: true,
    });

    const firstTask = await service.defineHarnessTask({
      title: 'Implement alpha',
      requiredSensors: ['build'],
    });
    const firstHarness = await service.getHarnessStatus();

    await service.init({
      name: 'beta',
      scale: 'SMALL',
      autonomous: true,
      archivePrevious: false,
    });

    const secondHarness = await service.getHarnessStatus();
    const workflowState = new HarnessWorkflowStateService({
      contextPath: path.join(tempDir, '.context'),
    });
    const binding = await workflowState.getBinding();

    expect(firstHarness).not.toBeNull();
    expect(secondHarness).not.toBeNull();
    expect(secondHarness?.session.name).toBe('beta');
    expect(secondHarness?.session.id).not.toBe(firstHarness?.session.id);
    expect(secondHarness?.binding.activeTaskId).toBeUndefined();
    expect(binding?.workflowName).toBe('beta');
    expect(binding?.sessionId).toBe(secondHarness?.session.id);
    expect(binding?.activeTaskId).toBeUndefined();
    expect(binding?.sessionId).not.toBe(firstHarness?.session.id);
    expect(firstTask.id).not.toBe(binding?.activeTaskId);
  });

  it('persists collaboration sessions across fresh workflow service instances', async () => {
    const session = await service.startCollaboration('Architecture review', ['architect', 'developer']);
    const sessionId = session.getId();

    service.contributeToCollaboration(
      sessionId,
      'architect',
      'I recommend extracting collaboration persistence into a file-backed store.'
    );

    const reloadedService = new WorkflowService(tempDir);
    reloadedService.contributeToCollaboration(
      sessionId,
      'developer',
      'We should keep the session durable across MCP calls.'
    );

    const synthesis = await reloadedService.endCollaboration(sessionId);
    const persisted = await fs.readJson(
      path.join(tempDir, '.context', 'workflow', 'collaboration-sessions.json')
    );

    expect(synthesis).not.toBeNull();
    expect(synthesis?.participants).toEqual(['architect', 'developer']);
    expect(synthesis?.contributions).toHaveLength(2);
    expect(synthesis?.contributions.map((contribution) => contribution.role)).toEqual([
      'architect',
      'developer',
    ]);
    expect(persisted.version).toBe(1);
    expect(persisted.sessions).toHaveLength(1);
    expect(persisted.sessions[0].id).toBe(sessionId);
    expect(persisted.sessions[0].status).toBe('concluded');
    expect(persisted.sessions[0].contributions).toHaveLength(2);
  });

  it('bootstraps a task contract for the linked plan phase and rotates it on workflow advance', async () => {
    await service.init({
      name: 'plan-bootstrap',
      scale: 'MEDIUM',
      autonomous: true,
    });

    await fs.ensureDir(path.join(tempDir, '.context', 'plans'));
    await fs.writeFile(
      path.join(tempDir, '.context', 'plans', 'plan-bootstrap.md'),
      `---
type: plan
name: "Plan Bootstrap"
description: "Bootstrap contract regression."
generated: "2026-04-12"
status: filled
scaffoldVersion: "2.0.0"
planSlug: "plan-bootstrap"
summary: "Bootstrap contract regression."
phases:
  - id: "phase-1"
    name: "Discovery & Alignment"
    prevc: "P"
    summary: "Review the current system state and capture the discovery outputs."
    deliverables:
      - "discovery-brief"
    steps:
      - order: 1
        description: "Review the current system state"
        deliverables:
          - "system-review"
      - order: 2
        description: "Capture the phase bootstrap outputs"
        deliverables:
          - "bootstrap-output"
  - id: "phase-2"
    name: "Implementation"
    prevc: "R"
    summary: "Validate the implementation approach before execution."
    deliverables:
      - "review-signoff"
    steps:
      - order: 1
        description: "Validate the implementation approach"
        deliverables:
          - "implementation-review"
---

# Plan Bootstrap
`,
      'utf-8'
    );

    await new HarnessPlansService({ repoPath: tempDir }).link('plan-bootstrap');

    const beforeAdvance = await service.getHarnessStatus();
    expect(beforeAdvance).not.toBeNull();
    expect(beforeAdvance?.binding.activeTaskId).toBeDefined();
    expect(beforeAdvance?.taskContracts).toHaveLength(1);

    const bootstrapTaskId = beforeAdvance?.binding.activeTaskId;
    const bootstrapTask = beforeAdvance?.taskContracts.find((task) => task.id === bootstrapTaskId);

    expect(bootstrapTask).toBeTruthy();
    expect(bootstrapTask?.status).toBe('ready');
    expect(bootstrapTask?.expectedOutputs).toEqual(['discovery-brief', 'system-review', 'bootstrap-output']);
    expect(bootstrapTask?.acceptanceCriteria).toEqual([
      'Review the current system state',
      'Capture the phase bootstrap outputs',
    ]);

    const nextPhase = await service.advance();
    const afterAdvance = await service.getHarnessStatus();

    expect(nextPhase).toBe('R');
    expect(afterAdvance?.taskContracts).toHaveLength(2);
    expect(afterAdvance?.binding.activeTaskId).toBeDefined();
    expect(afterAdvance?.binding.activeTaskId).not.toBe(bootstrapTaskId);
    expect(afterAdvance?.taskContracts.find((task) => task.id === bootstrapTaskId)?.status).toBe('completed');
    expect(afterAdvance?.taskContracts.find((task) => task.id === afterAdvance?.binding.activeTaskId)?.status).toBe('ready');
    expect(afterAdvance?.taskContracts.find((task) => task.id === afterAdvance?.binding.activeTaskId)?.expectedOutputs).toEqual([
      'review-signoff',
      'implementation-review',
    ]);
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
