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

  it('passes approval metadata through policy evaluation', async () => {
    await handleHarness(
      {
        action: 'registerPolicy',
        effect: 'require_approval',
        target: 'path',
        pathPattern: 'src/secrets/*',
        approvalRole: 'security',
        description: 'secret paths require approval',
      },
      { repoPath: tempDir }
    );

    const response = await handleHarness(
      {
        action: 'evaluatePolicy',
        scope: 'artifact',
        path: 'src/secrets/token.txt',
        approvedBy: 'alice',
        approvalRole: 'security',
      },
      { repoPath: tempDir }
    );
    const payload = JSON.parse(response.content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.evaluation.allowed).toBe(true);
    expect(payload.evaluation.requiresApproval).toBe(false);
  });

  it('gets, sets, and resets policy documents', async () => {
    const setResponse = await handleHarness(
      {
        action: 'setPolicy',
        policy: {
          defaultEffect: 'deny',
          rules: [
            {
              id: 'allow-src',
              effect: 'allow',
              target: 'path',
              pattern: 'src/**',
            },
          ],
        },
      },
      { repoPath: tempDir }
    );
    const setPayload = JSON.parse(setResponse.content[0].text);
    expect(setPayload.success).toBe(true);
    expect(setPayload.policy.defaultEffect).toBe('deny');

    const getResponse = await handleHarness(
      { action: 'getPolicy' },
      { repoPath: tempDir }
    );
    const getPayload = JSON.parse(getResponse.content[0].text);
    expect(getPayload.success).toBe(true);
    expect(getPayload.policy.rules).toHaveLength(1);

    const resetResponse = await handleHarness(
      { action: 'resetPolicy' },
      { repoPath: tempDir }
    );
    const resetPayload = JSON.parse(resetResponse.content[0].text);
    expect(resetPayload.success).toBe(true);
    expect(Array.isArray(resetPayload.policy.rules)).toBe(true);
    expect(resetPayload.policy.rules.length).toBeGreaterThan(0);
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
