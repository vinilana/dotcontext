import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';

import { handleAgent } from './agent';
import { createJsonResponse } from './response';
import { handleWorkflowAdvance } from './workflowAdvance';
import { handleWorkflowInit } from './workflowInit';
import { handleWorkflowStatus } from './workflowStatus';

function parseResponse(response: { content: Array<{ text: string }> }) {
  return JSON.parse(response.content[0].text);
}

describe('MCP workflow handlers', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-workflow-'));
    await fs.ensureDir(path.join(tempDir, '.context'));
    await fs.writeFile(path.join(tempDir, 'index.ts'), 'export const ready = true;\n');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('returns compact workflow-init payloads by default', async () => {
    const response = await handleWorkflowInit(
      {
        name: 'optimize-mcp',
        scale: 'MEDIUM',
        autonomous: true,
      },
      { repoPath: tempDir }
    );

    const payload = parseResponse(response);
    expect(payload.success).toBe(true);
    expect(payload.currentPhase).toEqual({ code: 'P', name: 'Planning' });
    expect(payload.startWith).toBe('architect-specialist');
    expect(payload).toHaveProperty('bundleId');
    expect(payload).toHaveProperty('revision');
    expect(payload.helpRef).toBe('workflow://guide/workflow-init');
    expect(payload.orchestration).toBeUndefined();
    expect(payload.nextSteps).toBeUndefined();
  });

  it('keeps a verbose compatibility path for workflow-init', async () => {
    const response = await handleWorkflowInit(
      {
        name: 'optimize-mcp',
        scale: 'MEDIUM',
        autonomous: true,
        verbose: true,
        includeLegacy: true,
      },
      { repoPath: tempDir }
    );

    const payload = parseResponse(response);
    expect(payload.success).toBe(true);
    expect(payload.orchestration).toBeDefined();
    expect(payload.enhancementPrompt).toContain('WORKFLOW');
    expect(Array.isArray(payload.nextSteps)).toBe(true);
  });

  it('supports workflow-status revision polling', async () => {
    await handleWorkflowInit(
      {
        name: 'optimize-mcp',
        scale: 'MEDIUM',
        autonomous: true,
      },
      { repoPath: tempDir }
    );

    const first = parseResponse(await handleWorkflowStatus({}, { repoPath: tempDir }));
    const second = parseResponse(await handleWorkflowStatus(
      { revision: first.revision },
      { repoPath: tempDir }
    ));

    expect(first.bundleId).toBeDefined();
    expect(first.revision).toBeDefined();
    expect(second).toEqual({
      success: true,
      notModified: true,
      revision: first.revision,
    });
  });

  it('returns compact workflow-advance payloads by default', async () => {
    await handleWorkflowInit(
      {
        name: 'optimize-mcp',
        scale: 'MEDIUM',
        autonomous: true,
      },
      { repoPath: tempDir }
    );

    const response = await handleWorkflowAdvance({}, { repoPath: tempDir });
    const payload = parseResponse(response);

    expect(payload.success).toBe(true);
    expect(payload.currentPhase).toEqual({ code: 'R', name: 'Review' });
    expect(payload).toHaveProperty('bundleId');
    expect(payload).toHaveProperty('revision');
    expect(payload.orchestration).toBeUndefined();
  });

  it('returns compact agent orchestration by default and docs on demand', async () => {
    const compact = parseResponse(await handleAgent(
      {
        action: 'orchestrate',
        phase: 'E',
      },
      { repoPath: tempDir }
    ));

    expect(compact.agentIds).toContain('feature-developer');
    expect(compact.agents).toBeUndefined();

    const verbose = parseResponse(await handleAgent(
      {
        action: 'orchestrate',
        phase: 'E',
        includeDocs: true,
      },
      { repoPath: tempDir }
    ));

    expect(Array.isArray(verbose.agents)).toBe(true);
    expect(verbose.agents[0]).toHaveProperty('docs');
  });
});

describe('MCP response helpers', () => {
  it('serializes JSON responses without pretty printing by default', () => {
    const response = createJsonResponse({ success: true, nested: { value: 1 } });
    expect(response.content[0].text).toBe('{"success":true,"nested":{"value":1}}');
  });
});
