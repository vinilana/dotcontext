import * as fs from 'fs-extra';
import { glob } from 'glob';
import * as path from 'path';
import { needsFill } from '../../../utils/frontMatter';

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
      const docFiles = await glob('**/*.md', { cwd: docsDir, nodir: true });
      for (const file of docFiles.sort()) {
        const filePath = path.join(docsDir, file);
        if (!await needsFill(filePath)) continue;
        files.push({
          path: filePath,
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
      const agentFiles = await glob('**/*.md', { cwd: agentsDir, nodir: true });
      for (const file of agentFiles.sort()) {
        const filePath = path.join(agentsDir, file);
        if (!await needsFill(filePath)) continue;
        files.push({
          path: filePath,
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
      const skillFiles = await glob('**/SKILL.md', { cwd: skillsDir, nodir: true });
      for (const file of skillFiles.sort()) {
        const skillPath = path.join(skillsDir, file);
        if (!await needsFill(skillPath)) continue;
        const segments = file.split(path.sep);
        const skillSlug = segments[0];

        files.push({
          path: skillPath,
          relativePath: path.join('skills', file),
          type: 'skill',
          documentName: skillSlug,
        });
      }
    }
  }

  if (target === 'all' || target === 'plans') {
    const plansDir = path.join(outputDir, 'plans');
    if (await fs.pathExists(plansDir)) {
      const planFiles = await glob('**/*.md', { cwd: plansDir, nodir: true });
      for (const file of planFiles.sort()) {
        const filePath = path.join(plansDir, file);
        if (!await needsFill(filePath)) continue;
        files.push({
          path: filePath,
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
