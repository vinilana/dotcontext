import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { HarnessRuntimeStateService } from '../harness/runtimeStateService';
import { WorkflowService } from '../workflow/workflowService';
import { logMcpAction } from './actionLogger';

describe('logMcpAction', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-action-logger-'));
    await fs.ensureDir(path.join(tempDir, '.context'));
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'mcp-action-logger-test',
      version: '1.0.0',
      scripts: {
        build: 'node -e "process.exit(0)"',
      },
    }, { spaces: 2 });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('records MCP activity in a harness session when no workflow binding exists', async () => {
    await logMcpAction(tempDir, {
      tool: 'context',
      action: 'check',
      status: 'success',
      details: {
        prompt: 'sensitive prompt',
        nested: {
          content: 'secret content',
        },
      },
    });

    const state = new HarnessRuntimeStateService({ repoPath: tempDir });
    const sessions = await state.listSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe('mcp-activity');
    expect(sessions[0].metadata?.transport).toBe('mcp');

    const traces = await state.listTraces(sessions[0].id);
    const mcpTrace = traces.find((trace) => trace.event === 'mcp.tool.succeeded');
    expect(mcpTrace).toBeDefined();
    expect(mcpTrace?.data?.tool).toBe('context');
    expect((mcpTrace?.data as any).details.prompt).toBe('[redacted]');
    expect((mcpTrace?.data as any).details.nested.content).toBe('[redacted]');

    expect(await fs.pathExists(path.join(tempDir, '.context', 'workflow', 'actions.jsonl'))).toBe(false);
  });

  it('reuses the workflow harness session when one is active', async () => {
    const workflow = new WorkflowService(tempDir);
    await workflow.init({
      name: 'workflow-alpha',
      scale: 'SMALL',
      autonomous: true,
    });

    const before = await workflow.getHarnessStatus();
    expect(before).not.toBeNull();

    await logMcpAction(tempDir, {
      tool: 'workflow-status',
      action: 'read',
      status: 'success',
      details: {
        repoPath: tempDir,
      },
    });

    const after = await workflow.getHarnessStatus();
    expect(after).not.toBeNull();
    expect(after?.session.id).toBe(before?.session.id);
    expect(after?.session.traceCount).toBeGreaterThan(before?.session.traceCount || 0);
    expect(after?.sensorRuns).toEqual(before?.sensorRuns || []);

    const state = new HarnessRuntimeStateService({ repoPath: tempDir });
    const traces = await state.listTraces(after!.session.id);
    expect(traces.some((trace) => trace.event === 'mcp.tool.succeeded')).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.context', 'workflow', 'actions.jsonl'))).toBe(false);
  });
});
