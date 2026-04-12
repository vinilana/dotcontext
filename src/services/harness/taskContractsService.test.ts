import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { HarnessRuntimeStateService } from './runtimeStateService';
import { HarnessSensorsService } from './sensorsService';
import { HarnessTaskContractsService } from './taskContractsService';

describe('HarnessTaskContractsService', () => {
  let tempDir: string;
  let stateService: HarnessRuntimeStateService;
  let sensorsService: HarnessSensorsService;
  let service: HarnessTaskContractsService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-contracts-'));
    stateService = new HarnessRuntimeStateService({ repoPath: tempDir });
    sensorsService = new HarnessSensorsService({ stateService });
    service = new HarnessTaskContractsService({ repoPath: tempDir, stateService });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('persists contracts and evaluates completion against sensors and artifacts', async () => {
    sensorsService.registerSensor({
      id: 'build',
      name: 'Build',
      severity: 'critical',
      execute: async () => ({
        status: 'passed',
        summary: 'Build succeeded',
        evidence: ['build log'],
      }),
    });

    const session = await stateService.createSession({ name: 'task-run' });
    await stateService.addArtifact(session.id, {
      name: 'plans/alpha.md',
      kind: 'file',
      path: 'plans/alpha.md',
    });
    await sensorsService.runSensor('build', { sessionId: session.id });

    const task = await service.createTaskContract({
      title: 'Implement alpha',
      sessionId: session.id,
      requiredSensors: ['build'],
      requiredArtifacts: ['plans/alpha.md'],
      expectedOutputs: ['src/alpha.ts'],
      acceptanceCriteria: ['build passes'],
    });

    const evaluation = await service.evaluateTaskCompletion(task.id, session.id);
    const tasks = await service.listTaskContracts();
    const handoff = await service.createHandoffContract({
      from: 'planner',
      to: 'executor',
      sessionId: session.id,
      taskId: task.id,
      artifacts: ['plans/alpha.md'],
      evidence: ['build log'],
    });

    expect(evaluation.canComplete).toBe(true);
    expect(evaluation.missingSensors).toHaveLength(0);
    expect(evaluation.missingArtifacts).toHaveLength(0);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Implement alpha');
    expect(handoff.from).toBe('planner');

    const contractPath = path.join(tempDir, '.context', 'harness', 'contracts', 'tasks', `${task.id}.json`);
    expect(await fs.pathExists(contractPath)).toBe(true);
  });
});

