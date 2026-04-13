import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessSessionFacade } from './harnessSessionFacade';
import { WorkflowService } from './workflowService';

async function makeRepo(): Promise<{ repo: string; facade: HarnessSessionFacade }> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-facade-'));
  await fs.writeJson(path.join(repo, 'package.json'), {
    name: 'facade-test',
    version: '0.0.0',
    scripts: { build: 'node -e "process.exit(0)"' },
  });
  // Bootstrap a workflow so the state service will accept binding writes.
  const service = new WorkflowService(repo);
  await service.init({ name: 'wf-1', scale: 'MEDIUM' });
  const facade = new HarnessSessionFacade({
    repoPath: repo,
    contextPath: path.join(repo, '.context'),
  });
  return { repo, facade };
}

describe('HarnessSessionFacade', () => {
  let repo: string;
  let facade: HarnessSessionFacade;

  beforeEach(async () => {
    ({ repo, facade } = await makeRepo());
  });

  afterEach(async () => {
    await fs.remove(repo);
  });

  it('ensureHarnessSession returns a binding for an initialized workflow', async () => {
    const binding = await facade.ensureHarnessSession('wf-1');
    expect(binding.workflowName).toBe('wf-1');
    expect(binding.sessionId).toBeTruthy();
  });

  it('ensureHarnessSession reuses an existing live session for the same workflow name', async () => {
    const first = await facade.ensureHarnessSession('wf-1');
    const second = await facade.ensureHarnessSession('wf-1');
    expect(second.sessionId).toBe(first.sessionId);
  });

  it('defineHarnessTask stamps the contract as the active task on the binding', async () => {
    const binding = await facade.ensureHarnessSession('wf-1');
    const contract = await facade.defineHarnessTask(binding, {
      title: 'write code',
      requiredSensors: ['tests'],
    });
    expect(contract.title).toBe('write code');
    expect(binding.activeTaskId).toBe(contract.id);
  });

  it('recordHarnessArtifact attaches the artifact to the session', async () => {
    const binding = await facade.ensureHarnessSession('wf-1');
    const artifact = await facade.recordHarnessArtifact(binding, {
      name: 'notes.md',
      kind: 'file',
      path: 'notes.md',
    });
    expect(artifact.name).toBe('notes.md');
    expect(binding.updatedAt).toBe(artifact.createdAt);
  });

  it('checkpointHarnessSession records progress and bumps updatedAt', async () => {
    const binding = await facade.ensureHarnessSession('wf-1');
    const before = binding.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const result = await facade.checkpointHarnessSession(binding, { note: 'halfway' });
    expect(result.session.id).toBe(binding.sessionId);
    expect(result.binding.updatedAt).not.toBe(before);
  });

  it('getHarnessStatus reports no taskCompletion when there is no active task', async () => {
    const status = await facade.getHarnessStatus('wf-1');
    expect(status.completionCheck.taskCompletion).toBeNull();
    expect(Array.isArray(status.sensorRuns)).toBe(true);
  });

  it('runHarnessSensors executes a registered sensor and returns backpressure', async () => {
    const binding = await facade.ensureHarnessSession('wf-1');
    const available = facade.listAvailableSensors();
    if (available.length === 0) {
      return; // no default sensors resolved in this env; smoke only
    }
    const sensorId = available[0].id;
    const { runs, backpressure } = await facade.runHarnessSensors(binding, [sensorId]);
    expect(runs).toHaveLength(1);
    expect(backpressure).toHaveProperty('reasons');
  });
});
