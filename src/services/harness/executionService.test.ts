import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessExecutionService } from './executionService';

describe('HarnessExecutionService', () => {
  let tempDir: string;
  let service: HarnessExecutionService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-execution-'));
    service = new HarnessExecutionService({ repoPath: tempDir });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('enforces policy before running a sensor', async () => {
    const session = await service.createSession({ name: 'policy-sensor' });
    await fs.ensureDir(path.join(tempDir, '.context', 'harness'));
    await fs.writeJson(
      path.join(tempDir, '.context', 'harness', 'policy.json'),
      {
        version: 1,
        defaultEffect: 'allow',
        rules: [
          {
            id: 'deny-run-sensor',
            effect: 'deny',
            when: {
              tools: ['harness'],
              actions: ['runSensor'],
            },
            reason: 'sensor execution denied',
          },
        ],
      },
      { spaces: 2 }
    );

    await expect(service.runSensor({
      id: 'lint',
      name: 'Lint',
      severity: 'critical',
      blocking: true,
      execute: async () => ({
        status: 'passed',
        summary: 'ok',
      }),
    }, {
      sessionId: session.id,
    })).rejects.toThrow('Policy blocked harness.runSensor');
  });
});
