/**
 * Export Rules Service
 *
 * Bidirectional sync: export rules from .context to AI tool directories.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import {
  BaseDependencies,
  OperationResult,
  createEmptyResult,
  addError,
  globFiles,
  resolveAbsolutePath,
  ensureParentDirectory,
  ensureDirectory,
  pathExists,
  getBasename,
  displayOperationSummary,
  getRulesExportPresets,
} from '../shared';

export type ExportRulesServiceDependencies = BaseDependencies;

export interface ExportTarget {
  name: string;
  path: string;
  format: 'single' | 'directory';
  fileExtension?: string;
  filename?: string;
  description: string;
}

export interface ExportOptions {
  source?: string;
  targets?: string[];
  preset?: string;
  force?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  /** Index mode: 'readme' exports only README.md files, 'all' exports all matching files */
  indexMode?: 'readme' | 'all';
}

export interface ExportResult extends OperationResult {
  targets: string[];
}

interface RuleFile {
  name: string;
  content: string;
  path: string;
}

/**
 * Build export presets from the unified tool registry
 */
function buildExportPresets(): Record<string, ExportTarget[]> {
  const registryPresets = getRulesExportPresets();
  const presets: Record<string, ExportTarget[]> = {};

  // Add presets from registry
  for (const [toolId, targets] of Object.entries(registryPresets)) {
    presets[toolId] = targets;
  }

  // Add cursor legacy .cursorrules file (in addition to directory)
  if (presets.cursor) {
    presets.cursor = [
      { name: 'cursorrules', path: '.cursorrules', format: 'single', description: 'Cursor AI rules file' },
      ...presets.cursor,
    ];
  }

  // Add universal AGENTS.md
  presets.agents = [
    { name: 'agents-md', path: 'AGENTS.md', format: 'single', description: 'Universal AGENTS.md file' },
  ];

  // Build 'all' preset
  presets.all = deduplicateTargets(
    Object.entries(presets)
    .filter(([key]) => key !== 'all')
    .flatMap(([, targets]) => targets)
  );

  return presets;
}

function deduplicateTargets(targets: ExportTarget[]): ExportTarget[] {
  const seen = new Set<string>();
  const deduplicated: ExportTarget[] = [];

  for (const target of targets) {
    const key = `${target.path}:${target.format}:${target.fileExtension || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduplicated.push(target);
  }

  return deduplicated;
}

/**
 * Export presets for different AI tools (derived from tool registry)
 */
export const EXPORT_PRESETS: Record<string, ExportTarget[]> = buildExportPresets();

export class ExportRulesService {
  constructor(private deps: ExportRulesServiceDependencies) {}

  /**
   * Export rules to AI tool directories
   */
  async run(repoPath: string, options: ExportOptions = {}): Promise<ExportResult> {
    const absolutePath = path.resolve(repoPath);
    const sourcePath = resolveAbsolutePath(options.source, '.context/docs', absolutePath);

    const result: ExportResult = {
      ...createEmptyResult(),
      targets: [],
    };

    // Determine targets
    const targets = this.resolveTargets(options);
    if (targets.length === 0) {
      this.deps.ui.displayError(this.deps.t('errors.export.noTargets'));
      return result;
    }

    // Read source rules based on indexMode
    const rules = await this.readSourceRules(sourcePath, options.indexMode);
    if (rules.length === 0) {
      this.deps.ui.displayError(this.deps.t('errors.export.noRules'));
      return result;
    }

    // Combine rules into single content
    const combinedContent = this.combineRules(rules);

    // Export to each target
    for (const target of targets) {
      await this.exportToTarget(absolutePath, target, rules, combinedContent, options, result);
    }

    // Display summary
    if (!options.dryRun && result.filesCreated > 0) {
      this.deps.ui.displaySuccess(
        this.deps.t('success.export.completed', { count: result.filesCreated })
      );
    }

    if (options.verbose) {
      displayOperationSummary(result, {
        dryRun: options.dryRun,
        labels: { created: 'Exported' },
      });
    }

    return result;
  }

  /**
   * Export to a single target
   */
  private async exportToTarget(
    repoPath: string,
    target: ExportTarget,
    rules: RuleFile[],
    combinedContent: string,
    options: ExportOptions,
    result: ExportResult
  ): Promise<void> {
    const targetPath = path.join(repoPath, target.path);

    try {
      this.deps.ui.startSpinner(
        this.deps.t('spinner.export.exporting', { target: target.name })
      );

      if (options.dryRun) {
        this.deps.ui.updateSpinner(
          this.deps.t('spinner.export.dryRun', { target: targetPath }),
          'success'
        );
        result.filesSkipped++;
        this.deps.ui.stopSpinner();
        return;
      }

      // Check if target exists and force is not set
      if (await pathExists(targetPath) && !options.force) {
        this.deps.ui.updateSpinner(
          this.deps.t('spinner.export.skipped', { target: targetPath }),
          'warn'
        );
        result.filesSkipped++;
        this.deps.ui.stopSpinner();
        return;
      }

      // Export based on format
      if (target.format === 'single') {
        await ensureParentDirectory(targetPath);
        await fs.writeFile(targetPath, combinedContent, 'utf-8');
      } else {
        await this.exportToDirectory(targetPath, rules, target.fileExtension);
      }

      result.filesCreated++;
      result.targets.push(targetPath);
      this.deps.ui.updateSpinner(
        this.deps.t('spinner.export.exported', { target: targetPath }),
        'success'
      );
    } catch (error) {
      addError(result, target.name, error);
      this.deps.ui.updateSpinner(
        this.deps.t('spinner.export.failed', { target: target.name }),
        'fail'
      );
    } finally {
      this.deps.ui.stopSpinner();
    }
  }

  /**
   * Resolve export targets from options
   *
   * Supports three formats:
   * 1. Preset name via `preset` option (e.g., 'all', 'cursor')
   * 2. Preset names in `targets` array (e.g., ['claude', 'cursor'])
   * 3. Direct paths in `targets` array (e.g., ['.custom/rules'])
   */
  private resolveTargets(options: ExportOptions): ExportTarget[] {
    if (options.preset) {
      const preset = EXPORT_PRESETS[options.preset.toLowerCase()];
      if (preset) return preset;
    }

    if (options.targets?.length) {
      const resolved: ExportTarget[] = [];

      for (const t of options.targets) {
        // First check if target is a preset name
        const preset = EXPORT_PRESETS[t.toLowerCase()];
        if (preset) {
          resolved.push(...preset);
        } else {
          // Treat as a direct path
          resolved.push({
            name: path.basename(t),
            path: t,
            format: 'single' as const,
            description: 'Custom target',
          });
        }
      }

      return deduplicateTargets(resolved);
    }

    // Default: export to common targets
    return deduplicateTargets([
      EXPORT_PRESETS.cursor[0],
      ...EXPORT_PRESETS.claude,
      ...EXPORT_PRESETS.github,
    ]);
  }

  /**
   * Read source rules from .context/docs
   * @param sourcePath - Path to the source directory
   * @param indexMode - 'readme' to only read README.md files, 'all' to read all matching files
   */
  private async readSourceRules(sourcePath: string, indexMode?: 'readme' | 'all'): Promise<RuleFile[]> {
    // Check if source directory exists
    if (!await fs.pathExists(sourcePath)) {
      return [];
    }

    const rules: RuleFile[] = [];

    try {
      if (indexMode === 'readme') {
        // Only read README.md files (indices)
        return await this.readReadmeIndexFiles(sourcePath);
      }

      // Default behavior: read all matching files
      const files = await globFiles(`**/*.md`, sourcePath, { absolute: true });

      for (const file of files) {
        const basename = getBasename(file).toLowerCase();
        const isRuleFile =
          basename.includes('rules') ||
          basename.includes('instructions') ||
          basename.includes('conventions') ||
          basename === 'readme.md' ||
          basename === 'readme';

        if (isRuleFile) {
          try {
            const content = await fs.readFile(file, 'utf-8');
            rules.push({ name: getBasename(file), content, path: file });
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Source path doesn't exist
    }

    return rules;
  }

  /**
   * Read only README.md files as indices
   * This is useful when you want to export just the index files that reference other docs
   */
  private async readReadmeIndexFiles(sourcePath: string): Promise<RuleFile[]> {
    // Check if source directory exists
    if (!await fs.pathExists(sourcePath)) {
      return [];
    }

    const rules: RuleFile[] = [];

    try {
      const files = await globFiles(`**/README.md`, sourcePath, { absolute: true });

      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          // Use relative path from sourcePath for naming
          const relativePath = path.relative(sourcePath, file);
          const dirName = path.dirname(relativePath);
          const name = dirName === '.' ? 'README' : `${dirName}/README`;
          rules.push({ name, content, path: file });
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Source path doesn't exist
    }

    return rules;
  }

  /**
   * Combine multiple rules into a single content block
   */
  private combineRules(rules: RuleFile[]): string {
    const lines = [
      '# Project Rules and Guidelines',
      '',
      `> Auto-generated from .context/docs on ${new Date().toISOString()}`,
      '',
    ];

    for (const rule of rules) {
      lines.push(`## ${rule.name}`, '', rule.content, '');
    }

    return lines.join('\n');
  }

  /**
   * Export rules to a directory (multiple files)
   */
  private async exportToDirectory(
    targetPath: string,
    rules: RuleFile[],
    fileExtension = '.md'
  ): Promise<void> {
    await ensureDirectory(targetPath);

    for (const rule of rules) {
      const filePath = path.join(targetPath, `${rule.name}${fileExtension}`);
      await fs.writeFile(filePath, rule.content, 'utf-8');
    }
  }

  /**
   * Get available presets
   */
  getAvailablePresets(): string[] {
    return Object.keys(EXPORT_PRESETS);
  }
}
