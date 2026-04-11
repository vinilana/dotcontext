import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { handleHarness } from './harness';

describe('handleHarness', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-harness-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('creates sessions and records sensor-backed quality state', async () => {
    const created = await handleHarness(
      { action: 'createSession', name: 'runtime-check' },
      { repoPath: tempDir }
    );
    const session = JSON.parse(created.content[0].text).session;

    await handleHarness(
      {
        action: 'recordSensor',
        sessionId: session.id,
        sensorId: 'lint',
        sensorName: 'Lint',
        sensorSeverity: 'critical',
        sensorBlocking: true,
        sensorStatus: 'failed',
        summary: 'Lint failed',
        evidence: ['lint.log'],
      },
      { repoPath: tempDir }
    );

    const quality = await handleHarness(
      { action: 'getSessionQuality', sessionId: session.id },
      { repoPath: tempDir }
    );
    const payload = JSON.parse(quality.content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.quality.backpressure.blocked).toBe(true);
    expect(payload.quality.sensorRuns).toHaveLength(1);
  });

  it('registers and evaluates policy rules', async () => {
    await handleHarness(
      {
        action: 'registerPolicy',
        scope: 'artifact',
        effect: 'deny',
        pathPattern: 'src/secrets/*',
        description: 'secret paths blocked',
      },
      { repoPath: tempDir }
    );

    const response = await handleHarness(
      {
        action: 'evaluatePolicy',
        scope: 'artifact',
        path: 'src/secrets/token.txt',
      },
      { repoPath: tempDir }
    );
    const payload = JSON.parse(response.content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.evaluation.allowed).toBe(false);
    expect(payload.evaluation.blocked).toBe(true);
  });

  it('replays sessions and builds failure datasets', async () => {
    const created = await handleHarness(
      { action: 'createSession', name: 'replay-dataset-run' },
      { repoPath: tempDir }
    );
    const session = JSON.parse(created.content[0].text).session;

    await handleHarness(
      {
        action: 'recordSensor',
        sessionId: session.id,
        sensorId: 'build',
        sensorName: 'Build',
        sensorSeverity: 'critical',
        sensorBlocking: true,
        sensorStatus: 'failed',
        summary: 'Build failed',
        evidence: ['build.log'],
      },
      { repoPath: tempDir }
    );

    const replayResponse = await handleHarness(
      {
        action: 'replaySession',
        sessionId: session.id,
        includePayloads: true,
      },
      { repoPath: tempDir }
    );
    const replayPayload = JSON.parse(replayResponse.content[0].text);

    expect(replayPayload.success).toBe(true);
    expect(replayPayload.replay.events.length).toBeGreaterThan(0);

    const datasetResponse = await handleHarness(
      {
        action: 'buildDataset',
        includeSuccessfulSessions: true,
      },
      { repoPath: tempDir }
    );
    const datasetPayload = JSON.parse(datasetResponse.content[0].text);

    expect(datasetPayload.success).toBe(true);
    expect(datasetPayload.dataset.failureCount).toBeGreaterThan(0);
    expect(datasetPayload.dataset.clusterCount).toBeGreaterThan(0);
  });
});
