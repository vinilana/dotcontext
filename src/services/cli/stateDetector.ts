/**
 * StateDetector - Detects the current state of the project's context documentation.
 *
 * States:
 * - new: No .context directory exists
 * - unfilled: .context exists but files have `status: unfilled` front matter
 * - ready: .context exists with filled content
 * - outdated: .context is older than source code
 *
 * This supports local operator workflows and belongs to the CLI boundary.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { glob } from 'glob';
import { needsFill, getFilledStats } from '../../utils/frontMatter';

export type ProjectState = 'new' | 'unfilled' | 'ready' | 'outdated';

export interface StateDetectionResult {
  state: ProjectState;
  contextDir: string;
  details: {
    hasContextDir: boolean;
    totalFiles: number;
    filledFiles: number;
    unfilledFiles: number;
    codeLastModified?: Date;
    docsLastModified?: Date;
    daysBehind?: number;
  };
}

export interface StateDetectorOptions {
  projectPath: string;
  contextDirName?: string;
  sourceDirs?: string[];
}

const DEFAULT_SOURCE_DIRS = ['src', 'lib', 'app', 'packages'];

export class StateDetector {
  private projectPath: string;
  private contextDirName: string;
  private sourceDirs: string[];

  constructor(options: StateDetectorOptions) {
    this.projectPath = options.projectPath;
    this.contextDirName = options.contextDirName || '.context';
    this.sourceDirs = options.sourceDirs || DEFAULT_SOURCE_DIRS;
  }

  get contextDir(): string {
    return path.join(this.projectPath, this.contextDirName);
  }

  /**
   * Detect the current state of the project
   */
  async detect(): Promise<StateDetectionResult> {
    const hasContextDir = await fs.pathExists(this.contextDir);

    if (!hasContextDir) {
      return {
        state: 'new',
        contextDir: this.contextDir,
        details: {
          hasContextDir: false,
          totalFiles: 0,
          filledFiles: 0,
          unfilledFiles: 0
        }
      };
    }

    // Get stats about filled/unfilled files
    const stats = await getFilledStats(this.contextDir);

    // If there are unfilled files, state is 'unfilled'
    if (stats.unfilled > 0) {
      return {
        state: 'unfilled',
        contextDir: this.contextDir,
        details: {
          hasContextDir: true,
          totalFiles: stats.total,
          filledFiles: stats.filled,
          unfilledFiles: stats.unfilled
        }
      };
    }

    // Check if docs are outdated compared to code
    const codeLastModified = await this.getNewestMtime(this.sourceDirs);
    const docsLastModified = await this.getContextMtime();

    if (codeLastModified && docsLastModified && codeLastModified > docsLastModified) {
      const daysBehind = Math.floor((codeLastModified.getTime() - docsLastModified.getTime()) / (1000 * 60 * 60 * 24));

      return {
        state: 'outdated',
        contextDir: this.contextDir,
        details: {
          hasContextDir: true,
          totalFiles: stats.total,
          filledFiles: stats.filled,
          unfilledFiles: stats.unfilled,
          codeLastModified,
          docsLastModified,
          daysBehind
        }
      };
    }

    // Everything is ready
    return {
      state: 'ready',
      contextDir: this.contextDir,
      details: {
        hasContextDir: true,
        totalFiles: stats.total,
        filledFiles: stats.filled,
        unfilledFiles: stats.unfilled,
        codeLastModified,
        docsLastModified
      }
    };
  }

  /**
   * Get the newest modification time from source directories
   */
  private async getNewestMtime(dirs: string[]): Promise<Date | undefined> {
    let newest: Date | undefined;

    for (const dir of dirs) {
      const fullPath = path.join(this.projectPath, dir);

      if (!await fs.pathExists(fullPath)) {
        continue;
      }

      try {
        const files = await glob(`${fullPath}/**/*.{ts,tsx,js,jsx,py,go,rs,java,rb}`, {
          ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**']
        });

        for (const file of files) {
          const stat = await fs.stat(file);
          if (!newest || stat.mtime > newest) {
            newest = stat.mtime;
          }
        }
      } catch {
        // Ignore errors for individual directories
      }
    }

    return newest;
  }

  /**
   * Get the newest modification time from .context directory
   */
  private async getContextMtime(): Promise<Date | undefined> {
    let newest: Date | undefined;

    try {
      const files = await glob(`${this.contextDir}/**/*.md`);

      for (const file of files) {
        const stat = await fs.stat(file);
        if (!newest || stat.mtime > newest) {
          newest = stat.mtime;
        }
      }
    } catch {
      // Ignore errors
    }

    return newest;
  }

  /**
   * Get a human-readable description of the state
   */
  static describeState(result: StateDetectionResult): string {
    switch (result.state) {
      case 'new':
        return 'No context documentation found';
      case 'unfilled':
        return `${result.details.unfilledFiles} of ${result.details.totalFiles} files need to be filled`;
      case 'outdated':
        return `Documentation is ${result.details.daysBehind} day(s) behind code`;
      case 'ready':
        return `${result.details.totalFiles} documentation files up to date`;
    }
  }
}

export { StateDetector as default };
