import * as path from 'path';
import * as fs from 'fs-extra';
import type { AgentFileInfo, HandlerOptions, HandlerResult } from './types';

function getTargetFilename(agent: AgentFileInfo, options: HandlerOptions): string {
  const suffix = options.filenameSuffix || '';
  return `${agent.name}${suffix}.md`;
}

export async function createSymlinks(
  agentFiles: AgentFileInfo[],
  targetPath: string,
  sourcePath: string,
  options: HandlerOptions
): Promise<HandlerResult> {
  const result: HandlerResult = {
    filesCreated: 0,
    filesSkipped: 0,
    filesFailed: 0,
    errors: []
  };

  for (const agent of agentFiles) {
    const targetFilename = getTargetFilename(agent, options);
    const linkPath = path.join(targetPath, targetFilename);

    try {
      const exists = await fs.pathExists(linkPath);

      if (exists && !options.force) {
        result.filesSkipped++;
        if (options.verbose) {
          console.log(`  Skipped (exists): ${linkPath}`);
        }
        continue;
      }

      if (exists && options.force) {
        if (!options.dryRun) {
          await fs.remove(linkPath);
        }
      }

      if (!options.dryRun) {
        const relativePath = path.relative(targetPath, agent.sourcePath);
        await createPlatformSymlink(relativePath, linkPath, agent.sourcePath);
      }

      result.filesCreated++;

      if (options.verbose) {
        console.log(`  Created: ${linkPath} -> ${agent.sourcePath}`);
      }
    } catch (error) {
      result.filesFailed++;
      result.errors.push({
        file: targetFilename,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return result;
}

async function createPlatformSymlink(
  target: string,
  linkPath: string,
  absoluteTarget: string
): Promise<void> {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    try {
      await fs.symlink(target, linkPath, 'file');
    } catch (windowsError: unknown) {
      const err = windowsError as NodeJS.ErrnoException;
      if (err.code === 'EPERM' || err.code === 'ENOTSUP') {
        await fs.copy(absoluteTarget, linkPath);
      } else {
        throw windowsError;
      }
    }
  } else {
    await fs.symlink(target, linkPath);
  }
}

export async function checkSymlinkSupport(): Promise<{
  supported: boolean;
  message?: string;
}> {
  const isWindows = process.platform === 'win32';

  if (!isWindows) {
    return { supported: true };
  }

  const testDir = path.join(process.cwd(), '.symlink-test');
  const testLink = path.join(testDir, 'test-link');
  const testTarget = path.join(testDir, 'test-target');

  try {
    await fs.ensureDir(testDir);
    await fs.writeFile(testTarget, 'test');
    await fs.symlink(testTarget, testLink, 'file');
    await fs.remove(testDir);
    return { supported: true };
  } catch (error: unknown) {
    await fs.remove(testDir).catch(() => {});

    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EPERM') {
      return {
        supported: false,
        message:
          'Symlinks require Developer Mode or Administrator privileges on Windows. Consider using --mode markdown instead.'
      };
    }

    return { supported: true };
  }
}
