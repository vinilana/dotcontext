import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessExecutionService } from './executionService';
import { HarnessDatasetService } from './datasetService';

describe('HarnessDatasetService', () => {
  let tempDir: string;
  let execution: HarnessExecutionService;
  let service: HarnessDatasetService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-dataset-'));
    execution = new HarnessExecutionService({ repoPath: tempDir });
    service = new HarnessDatasetService({ repoPath: tempDir });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('builds failure datasets and clusters repeated signatures', async () => {
    const first = await execution.createSession({ name: 'first-failure' });
    const second = await execution.createSession({ name: 'second-failure' });

    await execution.runSensor({
      id: 'lint',
      name: 'Lint',
      severity: 'critical',
      blocking: true,
      execute: async () => ({
        status: 'failed',
        summary: 'Lint failed',
        evidence: ['lint output'],
      }),
    }, { sessionId: first.id });

    await execution.runSensor({
      id: 'lint',
      name: 'Lint',
      severity: 'critical',
      blocking: true,
      execute: async () => ({
        status: 'failed',
        summary: 'Lint failed',
        evidence: ['lint output'],
      }),
    }, { sessionId: second.id });

    const dataset = await service.buildFailureDataset({ includeSuccessfulSessions: true });
    const datasets = await service.listDatasets();

    expect(dataset.sessionCount).toBe(2);
    expect(dataset.replayCount).toBe(2);
    expect(dataset.failureCount).toBe(2);
    expect(dataset.clusterCount).toBe(1);
    expect(dataset.failures).toHaveLength(2);
    expect(dataset.clusters[0]?.count).toBe(2);
    expect(datasets).toHaveLength(1);
    expect(await fs.pathExists(path.join(tempDir, '.context', 'harness', 'replays'))).toBe(false);
    expect(await fs.pathExists(path.join(tempDir, '.context', 'harness', 'datasets', `${dataset.id}.json`))).toBe(true);
  });
});
