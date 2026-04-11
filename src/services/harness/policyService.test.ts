import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessPolicyService } from './policyService';

describe('HarnessPolicyService', () => {
  let tempDir: string;
  let service: HarnessPolicyService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-policy-'));
    service = new HarnessPolicyService({ repoPath: tempDir });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('allows actions by default and persists policy changes', async () => {
    const decision = await service.evaluate({ action: 'addArtifact', path: 'src/index.ts' });
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(false);

    await service.setPolicy({
      version: 1,
      defaultEffect: 'deny',
      rules: [
        { id: 'allow-src', target: 'path', pattern: 'src/**', effect: 'allow' },
      ],
    });

    await expect(service.assertAllowed({ action: 'addArtifact', path: 'docs/readme.md' })).rejects.toThrow('Policy blocked');
    await expect(service.assertAllowed({ action: 'addArtifact', path: 'src/index.ts' })).resolves.toBeUndefined();
  });

  it('can require approval for risk-based operations', async () => {
    await service.setPolicy({
      version: 1,
      defaultEffect: 'allow',
      rules: [
        { id: 'approve-high-risk', target: 'risk', pattern: 'high', effect: 'require_approval', approvalRole: 'reviewer' },
      ],
    });

    const decision = await service.evaluate({ action: 'completeSession', risk: 'high' });
    expect(decision.requiresApproval).toBe(true);
    await expect(service.assertAllowed({ action: 'completeSession', risk: 'high' })).rejects.toThrow('Policy approval required');
  });
});
