import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  cleanupSharedContext,
  fillSingleFileTool,
  listFilesToFillTool,
} from './fillScaffoldingTool';

const toolOptions = { toolCallId: 'test-call', messages: [] } as any;

async function writeUnfilled(filePath: string): Promise<void> {
  const content = `---
status: unfilled
---

placeholder
`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function writeFilled(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, '# Filled\n', 'utf8');
}

describe('fillScaffoldingTool ordering', () => {
  let tempDir: string;
  let contextDir: string;
  let agentFilePath: string;
  let skillFilePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fill-scaffolding-tool-'));
    contextDir = path.join(tempDir, '.context');
    agentFilePath = path.join(contextDir, 'agents', 'code-reviewer.md');
    skillFilePath = path.join(contextDir, 'skills', 'commit-message', 'SKILL.md');

    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), 'export const value = 42;\n');

    await writeUnfilled(path.join(contextDir, 'docs', 'project-overview.md'));
    await writeFilled(path.join(contextDir, 'docs', 'README.md'));
    await writeUnfilled(skillFilePath);
    await writeUnfilled(agentFilePath);
  });

  afterEach(async () => {
    await cleanupSharedContext();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('lists only unfilled files and keeps docs -> skills -> agents order', async () => {
    const result = await listFilesToFillTool.execute!({
      repoPath: tempDir,
      target: 'all',
    }, toolOptions);

    const typedResult = result as {
      success: boolean;
      totalCount: number;
      files: Array<{ type: 'doc' | 'skill' | 'agent' | 'plan'; relativePath: string }>;
    };

    expect(typedResult.success).toBe(true);
    expect(typedResult.totalCount).toBe(3);
    expect(typedResult.files.map((f) => f.type)).toEqual(['doc', 'skill', 'agent']);
    expect(typedResult.files.some((f) => f.relativePath.toLowerCase() === 'docs/readme.md')).toBe(false);
  });

  it('warns when requesting agents while docs are still pending', async () => {
    const result = await listFilesToFillTool.execute!({
      repoPath: tempDir,
      target: 'agents',
    }, toolOptions);

    const typedResult = result as {
      warning?: string;
      nextRequiredPhase?: string;
      files: Array<{ type: string }>;
    };

    expect(typedResult.files).toHaveLength(1);
    expect(typedResult.files[0]?.type).toBe('agent');
    expect(typedResult.warning).toContain('Fill order warning');
    expect(typedResult.nextRequiredPhase).toBe('docs');
  });

  it('detects skill files and includes warning when filling out of order', async () => {
    const skillResult = await fillSingleFileTool.execute!({
      repoPath: tempDir,
      filePath: skillFilePath,
    }, toolOptions);

    const typedSkillResult = skillResult as {
      success: boolean;
      fileType: string;
      documentName: string;
      warning?: string;
      nextRequiredPhase?: string;
    };

    expect(typedSkillResult.success).toBe(true);
    expect(typedSkillResult.fileType).toBe('skill');
    expect(typedSkillResult.documentName).toBe('commit-message');
    expect(typedSkillResult.warning).toContain('Fill order warning');
    expect(typedSkillResult.nextRequiredPhase).toBe('docs');

    const agentResult = await fillSingleFileTool.execute!({
      repoPath: tempDir,
      filePath: agentFilePath,
    }, toolOptions);

    const typedAgentResult = agentResult as {
      success: boolean;
      fileType: string;
      warning?: string;
      nextRequiredPhase?: string;
    };

    expect(typedAgentResult.success).toBe(true);
    expect(typedAgentResult.fileType).toBe('agent');
    expect(typedAgentResult.warning).toContain('Fill order warning');
    expect(typedAgentResult.nextRequiredPhase).toBe('docs');
  });
});
