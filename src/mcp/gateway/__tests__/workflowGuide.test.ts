import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { handleWorkflowGuide } from '../workflowGuide';
import { handleWorkflowInit } from '../workflowInit';

function parseResponse(response: { content: Array<{ text: string }> }) {
  return JSON.parse(response.content[0].text);
}

describe('workflowGuide', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-workflow-guide-mcp-'));
    await fs.ensureDir(path.join(tempDir, '.context'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('returns adapter-neutral guidance through the MCP gateway', async () => {
    await handleWorkflowInit({
      name: 'guide-gateway',
      scale: 'SMALL',
      autonomous: true,
      repoPath: tempDir,
    }, { repoPath: tempDir });

    const response = parseResponse(await handleWorkflowGuide({
      repoPath: tempDir,
      intent: 'session_end',
      format: 'compact',
    }, { repoPath: tempDir }));

    expect(response.success).toBe(true);
    expect(response.workflow.active).toBe(true);
    expect(response.workflow.name).toBe('guide-gateway');
    expect(response.nextSteps.length).toBeGreaterThan(0);
    expect(response.skills.some((skill: { slug: string }) => skill.slug === 'dotcontext-workflow-p')).toBe(true);
    expect(response.decision.allow).toBe(true);
    expect(response.excerpt).toContain('dotcontext workflow guide');
  });
});
