import * as path from 'path';
import * as fs from 'fs-extra';
import { glob } from 'glob';
import type { RuleFileInfo, DetectionResult } from './types';
import { AGENT_SOURCES } from './presets';

function normalizeAgentFilename(filePath: string): string {
  return path.basename(filePath).replace(/\.agent\.md$/i, '.md');
}

function normalizeAgentName(filePath: string): string {
  return normalizeAgentFilename(filePath).replace(/\.md$/i, '');
}

export class AgentsDetector {
  /**
   * Detect agent files in the repository and common locations
   */
  async detectAgents(repoPath: string, autoDetect: boolean = true): Promise<DetectionResult> {
    const absoluteRepoPath = path.resolve(repoPath);
    const detectedFiles: RuleFileInfo[] = [];
    const sources: string[] = [];

    if (!autoDetect) {
      return { files: detectedFiles, sources };
    }

    // Check each agent source
    for (const source of AGENT_SOURCES) {
      for (const sourcePath of source.paths) {
        const fullPath = path.isAbsolute(sourcePath)
          ? sourcePath
          : path.join(absoluteRepoPath, sourcePath);

        try {
          if (await fs.pathExists(fullPath)) {
            const stat = await fs.stat(fullPath);
            
            if (stat.isDirectory()) {
              // Find all markdown files in directory
              const files = await glob('**/*.md', {
                cwd: fullPath,
                absolute: true,
                ignore: ['node_modules/**', '.git/**']
              });

              for (const file of files) {
                detectedFiles.push({
                  name: normalizeAgentName(file),
                  sourcePath: file,
                  relativePath: path.relative(absoluteRepoPath, file),
                  filename: normalizeAgentFilename(file),
                  type: 'generic'
                });
              }
              if (files.length > 0) {
                sources.push(fullPath);
              }
            }
          }
        } catch (error) {
          // Skip inaccessible paths
          continue;
        }
      }

      // Also try glob patterns from repo root
      for (const pattern of source.patterns) {
        try {
          const matches = await glob(pattern, {
            cwd: absoluteRepoPath,
            absolute: true,
            ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**']
          });

          for (const match of matches) {
            const exists = detectedFiles.some(f => f.sourcePath === match);
            if (!exists) {
              detectedFiles.push({
                name: normalizeAgentName(match),
                sourcePath: match,
                relativePath: path.relative(absoluteRepoPath, match),
                filename: normalizeAgentFilename(match),
                type: 'generic'
              });
              const dir = path.dirname(match);
              if (!sources.includes(dir)) {
                sources.push(dir);
              }
            }
          }
        } catch (error) {
          // Skip pattern if it fails
          continue;
        }
      }
    }

    return {
      files: detectedFiles.sort((a, b) => a.name.localeCompare(b.name)),
      sources: [...new Set(sources)]
    };
  }

  /**
   * Detect agents from specific source paths
   */
  async detectFromPaths(sourcePaths: string[], repoPath: string): Promise<DetectionResult> {
    const absoluteRepoPath = path.resolve(repoPath);
    const detectedFiles: RuleFileInfo[] = [];
    const sources: string[] = [];

    for (const sourcePath of sourcePaths) {
      const fullPath = path.isAbsolute(sourcePath)
        ? sourcePath
        : path.join(absoluteRepoPath, sourcePath);

      try {
        if (!(await fs.pathExists(fullPath))) {
          continue;
        }

        const stat = await fs.stat(fullPath);
        
        if (stat.isFile() && fullPath.endsWith('.md')) {
          detectedFiles.push({
            name: normalizeAgentName(fullPath),
            sourcePath: fullPath,
            relativePath: path.relative(absoluteRepoPath, fullPath),
            filename: normalizeAgentFilename(fullPath),
            type: 'generic'
          });
          sources.push(path.dirname(fullPath));
        } else if (stat.isDirectory()) {
          // Find all markdown files in directory
          const files = await glob('**/*.md', {
            cwd: fullPath,
            absolute: true,
            ignore: ['node_modules/**', '.git/**']
          });

          for (const file of files) {
            detectedFiles.push({
              name: normalizeAgentName(file),
              sourcePath: file,
              relativePath: path.relative(absoluteRepoPath, file),
              filename: normalizeAgentFilename(file),
              type: 'generic'
            });
          }
          if (files.length > 0) {
            sources.push(fullPath);
          }
        }
      } catch (error) {
        // Skip inaccessible paths
        continue;
      }
    }

    return {
      files: detectedFiles.sort((a, b) => a.name.localeCompare(b.name)),
      sources: [...new Set(sources)]
    };
  }
}
