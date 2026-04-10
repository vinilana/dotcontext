import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { initializeContextTool } from './initializeContextTool';

const toolOptions = { toolCallId: 'test-call', messages: [] } as any;

describe('initializeContextTool', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'initialize-context-tool-'));
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), 'export const value = 1;\n');
    await fs.writeFile(path.join(tempDir, 'package.json'), '{"name":"fixture","version":"1.0.0"}\n');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('includes skills in pendingWrites and preserves docs -> skills -> agents order', async () => {
    const result = await initializeContextTool.execute!({
      repoPath: tempDir,
      type: 'both',
      disableFiltering: true,
      generateQA: false,
      generateSkills: true,
      autoFill: true,
      skipContentGeneration: true,
    }, toolOptions);

    const typedResult = result as {
      status: string;
      pendingWrites?: Array<{ fileType: 'doc' | 'skill' | 'agent'; filePath: string }>;
    };

    expect(typedResult.status).toBe('incomplete');
    expect(Array.isArray(typedResult.pendingWrites)).toBe(true);
    expect(typedResult.pendingWrites && typedResult.pendingWrites.length).toBeGreaterThan(0);

    const pendingWrites = typedResult.pendingWrites || [];
    const fileTypes = pendingWrites.map((item) => item.fileType);

    expect(fileTypes).toContain('doc');
    expect(fileTypes).toContain('skill');
    expect(fileTypes).toContain('agent');

    const rank: Record<'doc' | 'skill' | 'agent', number> = { doc: 1, skill: 2, agent: 3 };
    const ranks = fileTypes.map((fileType) => rank[fileType]);
    const sortedRanks = [...ranks].sort((a, b) => a - b);
    expect(ranks).toEqual(sortedRanks);
  });
});
