import * as path from 'path';
import * as fs from 'fs-extra';
import { glob } from 'glob';
import type { RuleFileInfo, DetectionResult, RuleType } from './types';
import { RULE_SOURCES } from './presets';

export class RulesDetector {
  /**
   * Detect rules files in the repository and common locations
   */
  async detectRules(repoPath: string, autoDetect: boolean = true): Promise<DetectionResult> {
    const absoluteRepoPath = path.resolve(repoPath);
    const detectedFiles: RuleFileInfo[] = [];
    const sources: string[] = [];

    if (!autoDetect) {
      return { files: detectedFiles, sources };
    }

    // Check each rule source
    for (const source of RULE_SOURCES) {
      for (const sourcePath of source.paths) {
        const fullPath = path.isAbsolute(sourcePath)
          ? sourcePath
          : path.join(absoluteRepoPath, sourcePath);

        try {
          if (await fs.pathExists(fullPath)) {
            const stat = await fs.stat(fullPath);
            
            if (stat.isFile()) {
              // Single file
              const ruleType = this.determineRuleType(source.name);
              detectedFiles.push({
                name: path.basename(fullPath, path.extname(fullPath)),
                sourcePath: fullPath,
                relativePath: path.relative(absoluteRepoPath, fullPath),
                filename: this.generateTargetFilename(fullPath, ruleType),
                type: ruleType
              });
              sources.push(fullPath);
            } else if (stat.isDirectory()) {
              // Directory - search for files
              const files = await this.findFilesInDirectory(fullPath, source.patterns);
              for (const file of files) {
                const ruleType = this.determineRuleType(source.name);
                detectedFiles.push({
                  name: path.basename(file, path.extname(file)),
                  sourcePath: file,
                  relativePath: path.relative(absoluteRepoPath, file),
                  filename: this.generateTargetFilename(file, ruleType),
                  type: ruleType
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
              const ruleType = this.determineRuleType(source.name);
              detectedFiles.push({
                name: path.basename(match, path.extname(match)),
                sourcePath: match,
                relativePath: path.relative(absoluteRepoPath, match),
                filename: this.generateTargetFilename(match, ruleType),
                type: ruleType
              });
              if (!sources.includes(path.dirname(match))) {
                sources.push(path.dirname(match));
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
   * Detect rules from specific source paths
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
        
        if (stat.isFile()) {
          const ruleType = this.determineRuleTypeFromPath(fullPath);
          detectedFiles.push({
            name: path.basename(fullPath, path.extname(fullPath)),
            sourcePath: fullPath,
            relativePath: path.relative(absoluteRepoPath, fullPath),
            filename: this.generateTargetFilename(fullPath, ruleType),
            type: ruleType
          });
          sources.push(path.dirname(fullPath));
        } else if (stat.isDirectory()) {
          // Find all markdown and text files in directory
          const files = await glob('**/*.{md,txt,mdx}', {
            cwd: fullPath,
            absolute: true,
            ignore: ['node_modules/**', '.git/**']
          });

          for (const file of files) {
            const ruleType = this.determineRuleTypeFromPath(file);
            detectedFiles.push({
              name: path.basename(file, path.extname(file)),
              sourcePath: file,
              relativePath: path.relative(absoluteRepoPath, file),
              filename: this.generateTargetFilename(file, ruleType),
              type: ruleType
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

  private async findFilesInDirectory(dirPath: string, patterns: string[]): Promise<string[]> {
    const files: string[] = [];

    for (const pattern of patterns) {
      try {
        const matches = await glob(pattern, {
          cwd: dirPath,
          absolute: true,
          ignore: ['node_modules/**', '.git/**']
        });
        files.push(...matches);
      } catch {
        // Skip pattern if it fails
      }
    }

    return [...new Set(files)];
  }

  private determineRuleType(sourceName: string): RuleType {
    if (sourceName.includes('cursorrules') || sourceName === 'cursorrules') return 'cursorrules';
    if (sourceName.includes('claude')) return 'claude-memory';
    if (sourceName.includes('github') || sourceName.includes('copilot')) return 'github-copilot';
    if (sourceName.includes('windsurf') || sourceName === 'windsurfrules') return 'windsurfrules';
    if (sourceName.includes('cline') || sourceName === 'clinerules') return 'clinerules';
    if (sourceName.includes('aider')) return 'aider';
    if (sourceName.includes('continue')) return 'continue';
    if (sourceName.includes('codex')) return 'codex';
    if (sourceName.includes('gemini')) return 'gemini';
    if (sourceName.includes('antigravity')) return 'antigravity';
    if (sourceName.includes('trae')) return 'trae';
    if (sourceName.includes('zed')) return 'zed';
    return 'generic';
  }

  private determineRuleTypeFromPath(filePath: string): RuleType {
    const normalized = filePath.toLowerCase();
    if (normalized.includes('.cursorrules') || normalized.includes('.cursor/')) return 'cursorrules';
    if (normalized.includes('.claude/') || normalized.includes('memory')) return 'claude-memory';
    if (normalized.includes('.github/') || normalized.includes('copilot')) return 'github-copilot';
    if (normalized.includes('.windsurfrules') || normalized.includes('.windsurf/')) return 'windsurfrules';
    if (normalized.includes('.clinerules') || normalized.includes('.cline/')) return 'clinerules';
    if (normalized.includes('.aider') || normalized.includes('conventions.md')) return 'aider';
    if (normalized.includes('.continuerules') || normalized.includes('.continue/')) return 'continue';
    if (normalized.includes('.codex/')) return 'codex';
    if (normalized.endsWith('/gemini.md') || normalized === 'gemini.md') return 'gemini';
    if (normalized.includes('.agent/') || normalized.includes('.agents/')) return 'antigravity';
    if (normalized.includes('.trae/')) return 'trae';
    if (normalized.includes('.zed/')) return 'zed';
    return 'generic';
  }

  private generateTargetFilename(sourcePath: string, type: RuleType): string {
    const basename = path.basename(sourcePath, path.extname(sourcePath));
    const ext = '.md';
    
    // Generate meaningful filename based on rule type
    const prefixMap: Record<RuleType, string> = {
      'cursorrules': 'cursor-rules',
      'claude-memory': 'claude-memory',
      'github-copilot': 'github-copilot-rules',
      'windsurfrules': 'windsurf-rules',
      'clinerules': 'cline-rules',
      'aider': 'aider-conventions',
      'continue': 'continue-rules',
      'codex': 'codex-instructions',
      'gemini': 'gemini-instructions',
      'antigravity': 'antigravity-rules',
      'trae': 'trae-rules',
      'zed': 'zed-settings',
      'generic': 'rules'
    };
    
    const prefix = prefixMap[type] || 'rules';

    // If basename is generic, use prefix, otherwise combine
    const genericNames = ['rules', 'cursorrules', 'memory', 'windsurfrules', 'clinerules', 'continuerules', 'config', 'settings', 'instructions'];
    const finalName = genericNames.includes(basename.toLowerCase())
      ? prefix
      : `${prefix}-${basename}`;

    return `${finalName}${ext}`;
  }
}
