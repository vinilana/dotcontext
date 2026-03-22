import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';

import { AgentGenerator } from './agentGenerator';
import { AGENT_TYPES } from './agentTypes';
import type { RepoStructure } from '../../types';

function createRepoStructure(rootPath: string): RepoStructure {
  return {
    rootPath,
    files: [
      {
        path: path.join(rootPath, 'src/index.ts'),
        relativePath: 'src/index.ts',
        extension: '.ts',
        size: 128,
        type: 'file'
      }
    ],
    directories: [
      {
        path: path.join(rootPath, 'src'),
        relativePath: 'src',
        extension: '',
        size: 0,
        type: 'directory'
      },
      {
        path: path.join(rootPath, 'docs'),
        relativePath: 'docs',
        extension: '',
        size: 0,
        type: 'directory'
      },
      {
        path: path.join(rootPath, 'agents'),
        relativePath: 'agents',
        extension: '',
        size: 0,
        type: 'directory'
      }
    ],
    totalFiles: 1,
    totalSize: 128,
    topLevelDirectoryStats: [
      {
        name: 'src',
        fileCount: 1,
        totalSize: 128
      },
      {
        name: 'docs',
        fileCount: 0,
        totalSize: 0
      },
      {
        name: 'agents',
        fileCount: 0,
        totalSize: 0
      }
    ]
  };
}

describe('AgentGenerator', () => {
  let tempDir: string;
  let outputDir: string;
  const generator = new AgentGenerator();

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-agents-'));
    outputDir = path.join(tempDir, '.context');
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  it('generates selected agent playbooks and index', async () => {
    const repoStructure = createRepoStructure(path.join(tempDir, 'repo'));
    const selectedAgents = ['code-reviewer', 'test-writer'];

    const created = await generator.generateAgentPrompts(
      repoStructure,
      outputDir,
      selectedAgents
    );

    expect(created).toBe(selectedAgents.length + 1);

    const agentsDir = path.join(outputDir, 'agents');
    const files = (await fs.readdir(agentsDir)).sort();
    expect(files).toEqual(['README.md', 'code-reviewer.md', 'test-writer.md']);

    // v2.0 scaffold system: files contain only frontmatter, content is AI-generated during fill
    const playbookContent = await fs.readFile(path.join(agentsDir, 'code-reviewer.md'), 'utf8');
    expect(playbookContent).toContain('type: agent');
    expect(playbookContent).toContain('agentType: code-reviewer');
    expect(playbookContent).toContain('status: unfilled');
    expect(playbookContent).toContain('scaffoldVersion: "2.0.0"');

    const indexContent = await fs.readFile(path.join(agentsDir, 'README.md'), 'utf8');
    expect(indexContent).toContain('[Code Reviewer](./code-reviewer.md)');
    expect(indexContent).toContain('[Test Writer](./test-writer.md)');
  });

  it('falls back to all agent types when selection is invalid', async () => {
    const repoStructure = createRepoStructure(path.join(tempDir, 'repo'));

    const created = await generator.generateAgentPrompts(
      repoStructure,
      outputDir,
      ['not-a-real-agent']
    );

    expect(created).toBe(AGENT_TYPES.length + 1);

    const agentsDir = path.join(outputDir, 'agents');
    const files = await fs.readdir(agentsDir);
    AGENT_TYPES.forEach(agent => {
      expect(files).toContain(`${agent}.md`);
    });
  });
});
