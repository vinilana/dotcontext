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

  it('matches declarative tool/action/path rules and respects approval role', async () => {
    await service.setPolicy({
      version: 1,
      defaultEffect: 'allow',
      rules: [
        {
          id: 'mcp-write-review',
          effect: 'require_approval',
          when: {
            tools: ['harness'],
            actions: ['addArtifact'],
            paths: ['src/services/mcp/**'],
            risk: 'medium',
          },
          approvalRole: 'reviewer',
        },
      ],
    });

    const denied = await service.evaluate({
      tool: 'harness',
      action: 'addArtifact',
      path: 'src/services/mcp/gateway/harness.ts',
      risk: 'high',
    });
    expect(denied.requiresApproval).toBe(true);
    expect(denied.allowed).toBe(false);

    const approved = await service.evaluate({
      tool: 'harness',
      action: 'addArtifact',
      path: 'src/services/mcp/gateway/harness.ts',
      risk: 'high',
      approval: { approvedBy: 'alice' },
      approvalRole: 'reviewer',
    });
    expect(approved.allowed).toBe(true);
    expect(approved.blocked).toBe(false);
  });

  it('builds bootstrap rules from the initialized repository instead of static dotcontext paths', async () => {
    await fs.ensureDir(path.join(tempDir, 'packages', 'api'));
    await fs.ensureDir(path.join(tempDir, '.github', 'workflows'));
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'policy-bootstrap-test',
      version: '1.0.0',
      workspaces: ['packages/*'],
    }, { spaces: 2 });
    await fs.writeFile(path.join(tempDir, 'packages', 'api', 'index.ts'), 'export const api = true;\n', 'utf-8');
    await fs.writeFile(path.join(tempDir, '.github', 'workflows', 'ci.yml'), 'name: ci\n', 'utf-8');

    const policy = await service.createBootstrapPolicy();
    const coreRule = policy.rules.find((rule) => rule.id === 'protect-repository-core');
    const configRule = policy.rules.find((rule) => rule.id === 'protect-repository-config');

    expect(coreRule?.when?.paths).toEqual(expect.arrayContaining(['packages/**']));
    expect(coreRule?.when?.paths).not.toEqual(expect.arrayContaining(['src/services/mcp/**', 'src/workflow/**']));
    expect(configRule?.when?.paths).toEqual(expect.arrayContaining(['package.json', '.github/workflows/**']));
  });
});
