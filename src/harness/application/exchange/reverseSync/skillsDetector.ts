/**
 * Skills Detector
 *
 * Detects skill files from AI tool directories
 * Pattern follows AgentsDetector from import/agentsDetector.ts
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { glob } from 'glob';
import type { SkillFileInfo, SkillDetectionResult, SkillMetadata } from './types';
import { SKILL_SOURCES, getToolIdFromPath } from './presets';

export class SkillsDetector {
  /**
   * Detect skill files in the repository from known AI tool locations
   */
  async detectSkills(repoPath: string, autoDetect: boolean = true): Promise<SkillDetectionResult> {
    const absoluteRepoPath = path.resolve(repoPath);
    const detectedFiles: SkillFileInfo[] = [];
    const sources: string[] = [];
    const seenPaths = new Set<string>();

    if (!autoDetect) {
      return { files: detectedFiles, sources };
    }

    // Check each skill source
    for (const source of SKILL_SOURCES) {
      // Check explicit paths
      for (const sourcePath of source.paths) {
        const fullPath = path.isAbsolute(sourcePath)
          ? sourcePath
          : path.join(absoluteRepoPath, sourcePath);

        try {
          if (await fs.pathExists(fullPath)) {
            const stat = await fs.stat(fullPath);

            if (stat.isDirectory()) {
              // Find all SKILL.md files and other markdown files
              const files = await glob('**/SKILL.md', {
                cwd: fullPath,
                absolute: true,
                ignore: ['node_modules/**', '.git/**'],
              });

              for (const file of files) {
                if (seenPaths.has(file)) continue;
                seenPaths.add(file);

                const skillInfo = await this.createSkillFileInfo(file, absoluteRepoPath);
                if (skillInfo) {
                  detectedFiles.push(skillInfo);
                }
              }

              if (files.length > 0 && !sources.includes(fullPath)) {
                sources.push(fullPath);
              }
            }
          }
        } catch {
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
            ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
          });

          for (const match of matches) {
            if (seenPaths.has(match)) continue;
            seenPaths.add(match);

            const skillInfo = await this.createSkillFileInfo(match, absoluteRepoPath);
            if (skillInfo) {
              detectedFiles.push(skillInfo);
              const dir = path.dirname(match);
              if (!sources.includes(dir)) {
                sources.push(dir);
              }
            }
          }
        } catch {
          // Skip pattern if it fails
          continue;
        }
      }
    }

    return {
      files: detectedFiles.sort((a, b) => a.name.localeCompare(b.name)),
      sources: [...new Set(sources)],
    };
  }

  /**
   * Detect skills from specific source paths
   */
  async detectFromPaths(sourcePaths: string[], repoPath: string): Promise<SkillDetectionResult> {
    const absoluteRepoPath = path.resolve(repoPath);
    const detectedFiles: SkillFileInfo[] = [];
    const sources: string[] = [];
    const seenPaths = new Set<string>();

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
          if (seenPaths.has(fullPath)) continue;
          seenPaths.add(fullPath);

          const skillInfo = await this.createSkillFileInfo(fullPath, absoluteRepoPath);
          if (skillInfo) {
            detectedFiles.push(skillInfo);
            sources.push(path.dirname(fullPath));
          }
        } else if (stat.isDirectory()) {
          // Find all markdown files in directory
          const files = await glob('**/SKILL.md', {
            cwd: fullPath,
            absolute: true,
            ignore: ['node_modules/**', '.git/**'],
          });

          for (const file of files) {
            if (seenPaths.has(file)) continue;
            seenPaths.add(file);

            const skillInfo = await this.createSkillFileInfo(file, absoluteRepoPath);
            if (skillInfo) {
              detectedFiles.push(skillInfo);
            }
          }

          if (files.length > 0) {
            sources.push(fullPath);
          }
        }
      } catch {
        // Skip inaccessible paths
        continue;
      }
    }

    return {
      files: detectedFiles.sort((a, b) => a.name.localeCompare(b.name)),
      sources: [...new Set(sources)],
    };
  }

  /**
   * Create a SkillFileInfo from a file path
   */
  private async createSkillFileInfo(
    filePath: string,
    repoPath: string
  ): Promise<SkillFileInfo | null> {
    try {
      const relativePath = path.relative(repoPath, filePath);
      const filename = path.basename(filePath);
      const sourceTool = getToolIdFromPath(relativePath);

      // Derive name and slug from path
      // For skills, typically the parent directory name is the skill slug
      // e.g., .claude/skills/commit-message/SKILL.md -> slug: commit-message
      const dirName = path.basename(path.dirname(filePath));
      const slug = filename === 'SKILL.md' ? dirName : path.basename(filename, '.md');
      const name = this.slugToName(slug);

      // Try to parse metadata from content
      let metadata: SkillMetadata | undefined;
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        metadata = this.parseSkillMetadata(content);
      } catch {
        // Metadata parsing is optional
      }

      return {
        name: metadata?.name || name,
        slug,
        sourcePath: filePath,
        relativePath,
        filename,
        sourceTool,
        metadata,
      };
    } catch {
      return null;
    }
  }

  /**
   * Parse skill metadata from YAML frontmatter
   */
  private parseSkillMetadata(content: string): SkillMetadata | undefined {
    const lines = content.split('\n');

    if (lines[0]?.trim() !== '---') {
      return undefined;
    }

    const endIndex = lines.findIndex((line, i) => i > 0 && line.trim() === '---');

    if (endIndex === -1) {
      return undefined;
    }

    const frontMatterLines = lines.slice(1, endIndex);
    const metadata: SkillMetadata = {};

    for (const line of frontMatterLines) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        const key = match[1];
        const value = match[2].trim();

        switch (key) {
          case 'name':
            metadata.name = value;
            break;
          case 'description':
            metadata.description = value;
            break;
          case 'phases':
            // Parse array format: [P, E, V] or comma-separated
            metadata.phases = this.parseArrayValue(value);
            break;
          case 'triggers':
            metadata.triggers = this.parseArrayValue(value);
            break;
          case 'tags':
            metadata.tags = this.parseArrayValue(value);
            break;
        }
      }
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  /**
   * Parse an array value from YAML (simplified)
   * Handles: [a, b, c] or "a, b, c"
   */
  private parseArrayValue(value: string): string[] {
    // Remove brackets if present
    let cleaned = value.replace(/^\[|\]$/g, '').trim();
    // Split by comma
    return cleaned.split(',').map((s) => s.trim()).filter(Boolean);
  }

  /**
   * Convert a slug to a human-readable name
   * e.g., "commit-message" -> "Commit Message"
   */
  private slugToName(slug: string): string {
    return slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
