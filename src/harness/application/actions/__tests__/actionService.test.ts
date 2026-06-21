import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessActionService } from '../actionService';

describe('HarnessActionService', () => {
  let tempDir: string;
  let service: HarnessActionService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-action-'));
    service = new HarnessActionService({ repoPath: tempDir });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('executes harness runtime actions without an MCP response envelope', async () => {
    const created = await service.execute({
      action: 'createSession',
      name: 'portable-runtime',
    });
    const session = created.session as { id: string };

    await service.execute({
      action: 'recordSensor',
      sessionId: session.id,
      sensorId: 'build',
      sensorStatus: 'failed',
      sensorSeverity: 'critical',
      sensorBlocking: true,
      summary: 'Build failed',
      evidence: ['build.log'],
    });

    const quality = await service.execute({
      action: 'getSessionQuality',
      sessionId: session.id,
    });

    expect(quality.success).toBe(true);
    expect(quality).not.toHaveProperty('content');
    expect((quality.quality as { backpressure: { blocked: boolean } }).backpressure.blocked)
      .toBe(true);
  });

  it('normalizes policy action input for reusable adapters', async () => {
    await service.execute({
      action: 'registerPolicy',
      effect: 'deny',
      scope: 'artifact',
      pathPattern: 'src/secrets/*',
      description: 'secret paths blocked',
    });

    const response = await service.execute({
      action: 'evaluatePolicy',
      scope: 'artifact',
      path: 'src/secrets/token.txt',
    });

    expect((response.evaluation as { blocked: boolean }).blocked).toBe(true);
  });
});
