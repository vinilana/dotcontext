import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { HarnessRuntimeStateService } from './runtimeStateService';
import { HarnessSensorsService } from './sensorsService';

describe('HarnessSensorsService', () => {
  let tempDir: string;
  let stateService: HarnessRuntimeStateService;
  let service: HarnessSensorsService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sensors-'));
    stateService = new HarnessRuntimeStateService({ repoPath: tempDir });
    service = new HarnessSensorsService({ stateService });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('runs sensors and records traces', async () => {
    service.registerSensor({
      id: 'typecheck',
      name: 'Typecheck',
      severity: 'critical',
      execute: async () => ({
        status: 'failed',
        summary: 'Type errors found',
        evidence: ['tsc output'],
      }),
    });

    const session = await stateService.createSession({ name: 'quality-run' });
    const run = await service.runSensor('typecheck', { sessionId: session.id });
    const traces = await stateService.listTraces(session.id);
    const storedRuns = await service.getSessionSensorRuns(session.id);

    expect(run.status).toBe('failed');
    expect(traces.some((trace) => trace.event === 'sensor.run')).toBe(true);
    expect(storedRuns).toHaveLength(1);
    expect(storedRuns[0].sensorId).toBe('typecheck');
    expect(service.evaluateBackpressure([run]).blocked).toBe(true);
  });
});

