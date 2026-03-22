import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';

import { getCodebaseMapTool } from './getCodebaseMapTool';
import { scaffoldPlanTool } from './scaffoldPlanTool';

describe('planning tool compact defaults', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-planning-'));
    await fs.ensureDir(path.join(tempDir, '.context', 'docs'));
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'planning-tools-fixture',
      version: '1.0.0',
    });
    await fs.writeJson(path.join(tempDir, '.context', 'docs', 'codebase-map.json'), {
      architecture: { layers: ['cli', 'mcp'] },
      stack: { runtime: 'node' },
      structure: { root: ['src'] },
      symbols: {
        classes: [],
        interfaces: [],
        functions: [],
        types: [],
        enums: [],
      },
      publicAPI: [],
      dependencies: [],
      stats: { files: 1 },
    });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('defaults getCodebaseMap to architecture instead of all', async () => {
    const result = await getCodebaseMapTool.execute!(
      { repoPath: tempDir },
      { toolCallId: '', messages: [] }
    );

    expect(result).toMatchObject({
      success: true,
      section: 'architecture',
      defaultSectionApplied: true,
    });
    expect((result as any).explicitAllHint).toContain('section: "all"');
  });

  it('keeps scaffoldPlan compact unless content/instructions are requested', async () => {
    const compact = await scaffoldPlanTool.execute!(
      {
        planName: 'compact-plan',
        repoPath: tempDir,
      },
      { toolCallId: '', messages: [] }
    );

    expect(compact).toMatchObject({
      success: true,
      contentIncluded: false,
      guidanceIncluded: false,
      contextType: 'plan',
      contextResource: 'context://codebase/plan',
    });
    expect((compact as any).planContent).toBeUndefined();
    expect((compact as any).fillInstructions).toBeUndefined();

    const verbose = await scaffoldPlanTool.execute!(
      {
        planName: 'verbose-plan',
        repoPath: tempDir,
        includeContent: true,
        includeInstructions: true,
      },
      { toolCallId: '', messages: [] }
    );

    expect(verbose).toMatchObject({
      success: true,
      contentIncluded: true,
      guidanceIncluded: true,
    });
    expect((verbose as any).planContent).toEqual(expect.any(String));
    expect((verbose as any).fillInstructions).toEqual(expect.any(String));
  });
});
