import * as fs from 'fs-extra';
import * as path from 'path';

export type ScaffoldTarget = 'docs' | 'agents' | 'skills' | 'plans' | 'all';
export type ScaffoldFileType = 'doc' | 'agent' | 'skill' | 'plan';

export interface ScaffoldFileInfo {
  path: string;
  relativePath: string;
  type: ScaffoldFileType;
  documentName: string;
}

export async function collectScaffoldFiles(
  outputDir: string,
  target: ScaffoldTarget = 'all'
): Promise<ScaffoldFileInfo[]> {
  const files: ScaffoldFileInfo[] = [];

  if (target === 'all' || target === 'docs') {
    const docsDir = path.join(outputDir, 'docs');
    if (await fs.pathExists(docsDir)) {
      const docFiles = await fs.readdir(docsDir);
      for (const file of docFiles) {
        if (!file.endsWith('.md')) continue;
        files.push({
          path: path.join(docsDir, file),
          relativePath: path.join('docs', file),
          type: 'doc',
          documentName: path.basename(file, '.md'),
        });
      }
    }
  }

  if (target === 'all' || target === 'agents') {
    const agentsDir = path.join(outputDir, 'agents');
    if (await fs.pathExists(agentsDir)) {
      const agentFiles = await fs.readdir(agentsDir);
      for (const file of agentFiles) {
        if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') continue;
        files.push({
          path: path.join(agentsDir, file),
          relativePath: path.join('agents', file),
          type: 'agent',
          documentName: path.basename(file, '.md'),
        });
      }
    }
  }

  if (target === 'all' || target === 'skills') {
    const skillsDir = path.join(outputDir, 'skills');
    if (await fs.pathExists(skillsDir)) {
      const skillEntries = await fs.readdir(skillsDir);
      for (const entry of skillEntries) {
        const skillDir = path.join(skillsDir, entry);
        const stat = await fs.stat(skillDir).catch(() => null);
        if (!stat?.isDirectory()) continue;

        const skillPath = path.join(skillDir, 'SKILL.md');
        if (!await fs.pathExists(skillPath)) continue;

        files.push({
          path: skillPath,
          relativePath: path.join('skills', entry, 'SKILL.md'),
          type: 'skill',
          documentName: entry,
        });
      }
    }
  }

  if (target === 'all' || target === 'plans') {
    const plansDir = path.join(outputDir, 'plans');
    if (await fs.pathExists(plansDir)) {
      const planFiles = await fs.readdir(plansDir);
      for (const file of planFiles) {
        if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') continue;
        files.push({
          path: path.join(plansDir, file),
          relativePath: path.join('plans', file),
          type: 'plan',
          documentName: path.basename(file, '.md'),
        });
      }
    }
  }

  return files;
}

export function resolveScaffoldFileInfo(outputDir: string, filePath: string): ScaffoldFileInfo {
  const resolvedOutputDir = path.resolve(outputDir);
  const resolvedFilePath = path.resolve(filePath);
  const relativePath = path.relative(resolvedOutputDir, resolvedFilePath);
  const segments = relativePath.split(path.sep);

  if (segments[0] === 'skills' && segments.length >= 3 && segments[2] === 'SKILL.md') {
    return {
      path: resolvedFilePath,
      relativePath,
      type: 'skill',
      documentName: segments[1],
    };
  }

  if (segments[0] === 'agents') {
    return {
      path: resolvedFilePath,
      relativePath,
      type: 'agent',
      documentName: path.basename(resolvedFilePath, '.md'),
    };
  }

  if (segments[0] === 'plans') {
    return {
      path: resolvedFilePath,
      relativePath,
      type: 'plan',
      documentName: path.basename(resolvedFilePath, '.md'),
    };
  }

  return {
    path: resolvedFilePath,
    relativePath,
    type: 'doc',
    documentName: path.basename(resolvedFilePath, '.md'),
  };
}
