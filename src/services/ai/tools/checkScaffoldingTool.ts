import { tool } from 'ai';
import * as fs from 'fs-extra';
import * as path from 'path';
import { CheckScaffoldingInputSchema, type CheckScaffoldingInput } from '../schemas';

/**
 * Check if a directory exists and has content
 */
async function hasContent(dirPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function hasSkillContent(skillsDir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(skillsDir);
    for (const entry of entries) {
      const skillDir = path.join(skillsDir, entry);
      const stat = await fs.stat(skillDir).catch(() => null);
      if (!stat?.isDirectory()) continue;
      if (await fs.pathExists(path.join(skillDir, 'SKILL.md'))) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function hasHarnessRuntimeContent(harnessDir: string): Promise<boolean> {
  const runtimeEntries = [
    'sessions',
    'traces',
    'artifacts',
    'contracts',
    'workflows',
    'replays',
    'datasets',
  ];

  for (const entry of runtimeEntries) {
    if (await hasContent(path.join(harnessDir, entry))) {
      return true;
    }
  }

  return false;
}

export const checkScaffoldingTool = tool({
  description: 'Check if .context scaffolding exists and return granular status',
  inputSchema: CheckScaffoldingInputSchema,
  execute: async (input: CheckScaffoldingInput) => {
    if (!input.repoPath) {
      throw new Error('repoPath is required for checkScaffolding');
    }
    const repoPath = input.repoPath;
    const outputDir = path.resolve(repoPath, '.context');

    try {
      const sensorsPath = path.join(outputDir, 'harness', 'sensors.json');
      const [initialized, docs, agents, skills, plans, workflow, harness, sensors] = await Promise.all([
        fs.pathExists(outputDir),
        fs.pathExists(path.join(outputDir, 'docs')).then(exists =>
          exists ? hasContent(path.join(outputDir, 'docs')) : false
        ),
        fs.pathExists(path.join(outputDir, 'agents')).then(exists =>
          exists ? hasContent(path.join(outputDir, 'agents')) : false
        ),
        fs.pathExists(path.join(outputDir, 'skills')).then(exists =>
          exists ? hasSkillContent(path.join(outputDir, 'skills')) : false
        ),
        fs.pathExists(path.join(outputDir, 'plans')).then(exists =>
          exists ? hasContent(path.join(outputDir, 'plans')) : false
        ),
        fs.pathExists(path.join(outputDir, 'workflow')).then(exists =>
          exists ? hasContent(path.join(outputDir, 'workflow')) : false
        ),
        fs.pathExists(path.join(outputDir, 'harness')).then(exists =>
          exists ? hasHarnessRuntimeContent(path.join(outputDir, 'harness')) : false
        ),
        fs.pathExists(sensorsPath)
      ]);

      return {
        initialized,
        docs,
        agents,
        skills,
        plans,
        workflow,
        harness,
        sensors,
        outputDir
      };
    } catch (error) {
      return {
        initialized: false,
        docs: false,
        agents: false,
        skills: false,
        plans: false,
        workflow: false,
        harness: false,
        sensors: false,
        outputDir,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});
