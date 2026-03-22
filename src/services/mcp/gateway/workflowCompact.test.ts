import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';

import { handleWorkflowAdvance } from './workflowAdvance';
import { handleWorkflowInit } from './workflowInit';
import { handleWorkflowManage } from './workflowManage';
import { handleWorkflowStatus } from './workflowStatus';

function parseResponse(response: { content: Array<{ text: string }> }): any {
  return JSON.parse(response.content[0].text);
}

describe('compact MCP workflow handlers', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-workflow-'));
    await fs.ensureDir(path.join(tempDir, '.context'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('returns compact workflow-init by default and legacy guidance on request', async () => {
    const compact = parseResponse(await handleWorkflowInit(
      { name: 'token-compact', scale: 'SMALL' },
      { repoPath: tempDir }
    ));

    expect(compact.success).toBe(true);
    expect(compact.bundleId).toEqual(expect.any(String));
    expect(compact.startWith).toEqual(expect.any(String));
    expect(compact.helpRef).toBe('workflow://guide/workflow-init');
    expect(compact.orchestration).toBeUndefined();
    expect(compact.enhancementPrompt).toBeUndefined();

    const legacy = parseResponse(await handleWorkflowInit(
      { name: 'token-legacy', scale: 'SMALL', includeLegacy: true, archive_previous: true },
      { repoPath: tempDir }
    ));

    expect(legacy.orchestration).toBeDefined();
    expect(legacy.enhancementPrompt).toEqual(expect.any(String));
    expect(Array.isArray(legacy.nextSteps)).toBe(true);
  });

  it('returns notModified when workflow-status is polled with the current revision', async () => {
    await handleWorkflowInit(
      { name: 'polling-flow', scale: 'SMALL' },
      { repoPath: tempDir }
    );

    const first = parseResponse(await handleWorkflowStatus({}, { repoPath: tempDir }));
    expect(first.revision).toEqual(expect.any(String));

    const second = parseResponse(await handleWorkflowStatus(
      { revision: first.revision },
      { repoPath: tempDir }
    ));

    expect(second).toEqual({
      success: true,
      notModified: true,
      revision: first.revision,
    });
  });

  it('returns compact workflow-advance and workflow-manage deltas by default', async () => {
    await handleWorkflowInit(
      { name: 'advance-flow', scale: 'SMALL' },
      { repoPath: tempDir }
    );

    const advanced = parseResponse(await handleWorkflowAdvance(
      {},
      { repoPath: tempDir }
    ));

    expect(advanced.success).toBe(true);
    expect(advanced.currentPhase).toEqual({
      code: 'E',
      name: 'Execution',
    });
    expect(advanced.bundleId).toEqual(expect.any(String));
    expect(advanced.orchestration).toBeUndefined();

    const handoff = parseResponse(await handleWorkflowManage(
      {
        action: 'handoff',
        from: 'feature-developer',
        to: 'test-writer',
        artifacts: ['dist/report.json'],
      },
      { repoPath: tempDir }
    ));

    expect(handoff.success).toBe(true);
    expect(handoff.activeAgent).toBe('test-writer');
    expect(handoff.revision).toEqual(expect.any(String));
    expect(handoff.message).toBeUndefined();
  });
});
