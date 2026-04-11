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
});

