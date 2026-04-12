/**
 * Reverse Quick Sync Service
 *
 * Orchestrates the import of rules, agents, and skills from AI tool
 * directories into .context/. This is the inverse of QuickSyncService.
 */

import * as path from 'path';
import * as fs from 'fs-extra';

import { colors, symbols, typography } from '../../utils/theme';
import type { CLIInterface } from '../../utils/cliUI';
import type { TranslateFn } from '../../utils/i18n';
import type {
  ReverseSyncServiceDependencies,
  ReverseSyncOptions,
  ReverseSyncResult,
  ReverseSyncCommandFlags,
  ToolDetectionResult,
  MergeStrategy,
  ImportAction,
} from './types';
import type { ImportFormat } from '../import/types';
import { ToolDetector, formatDetectionSummary } from './toolDetector';
import { SkillsDetector } from './skillsDetector';
import { ImportSkillsService } from './importSkillsService';
import { ImportRulesService } from '../import/importRulesService';
import { ImportAgentsService } from '../import/importAgentsService';
import { getToolIdFromPath } from './presets';
import { VERSION } from '../../version';

export class ReverseQuickSyncService {
  private readonly ui: CLIInterface;
  private readonly t: TranslateFn;
  private readonly version: string;
  private readonly toolDetector: ToolDetector;
  private readonly skillsDetector: SkillsDetector;
  private readonly importSkillsService: ImportSkillsService;
  private readonly importRulesService: ImportRulesService;
  private readonly importAgentsService: ImportAgentsService;

  constructor(deps: ReverseSyncServiceDependencies) {
    this.ui = deps.ui;
    this.t = deps.t;
    this.version = deps.version;
    this.toolDetector = new ToolDetector();
    this.skillsDetector = new SkillsDetector();
    this.importSkillsService = new ImportSkillsService(deps);
    this.importRulesService = new ImportRulesService(deps);
    this.importAgentsService = new ImportAgentsService(deps);
  }

  /**
   * Run unified reverse sync operation
   */
  async run(repoPath: string, options: ReverseSyncCommandFlags = {}): Promise<ReverseSyncResult> {
    const absolutePath = path.resolve(repoPath);
    const resolvedOptions = this.resolveOptions(options, absolutePath);

    const result: ReverseSyncResult = {
      rulesImported: 0,
      agentsImported: 0,
      skillsImported: 0,
      filesSkipped: 0,
      filesMerged: 0,
      filesRenamed: 0,
      filesFailed: 0,
      errors: [],
      importedFiles: [],
    };

    // Step 1: Detect available tools
    this.ui.startSpinner('Detecting AI tool configurations...');
    const detection = await this.toolDetector.detect(absolutePath);
    this.ui.stopSpinner();

    if (detection.summary.totalFiles === 0) {
      this.ui.displayWarning('No AI tool configuration files found');
      return result;
    }

    // Display detection summary
    console.log('');
    console.log(formatDetectionSummary(detection));
    console.log('');

    // Step 2: Import rules
    if (!resolvedOptions.skipRules && detection.summary.totalRules > 0) {
      try {
        this.ui.startSpinner('Importing rules...');

        const rulesResult = await this.importRulesService.run(
          {
            force: resolvedOptions.force,
            dryRun: resolvedOptions.dryRun,
            verbose: resolvedOptions.verbose,
            format: resolvedOptions.format,
            autoDetect: true,
          },
          absolutePath
        );

        result.rulesImported = rulesResult.filesCreated;
        result.filesSkipped += rulesResult.filesSkipped;
        result.filesFailed += rulesResult.filesFailed;
        result.errors.push(...rulesResult.errors);
        this.ui.updateSpinner(`Rules imported: ${result.rulesImported}`, 'success');
      } catch (error) {
        this.ui.updateSpinner('Failed to import rules', 'fail');
        result.errors.push({
          file: 'rules',
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.ui.stopSpinner();
      }
    }

    // Step 3: Import agents
    if (!resolvedOptions.skipAgents && detection.summary.totalAgents > 0) {
      try {
        this.ui.startSpinner('Importing agents...');

        const agentsResult = await this.importAgentsService.run(
          {
            force: resolvedOptions.force,
            dryRun: resolvedOptions.dryRun,
            verbose: resolvedOptions.verbose,
            autoDetect: true,
          },
          absolutePath
        );

        result.agentsImported = agentsResult.filesCreated;
        result.filesSkipped += agentsResult.filesSkipped;
        result.filesFailed += agentsResult.filesFailed;
        result.errors.push(...agentsResult.errors);
        this.ui.updateSpinner(`Agents imported: ${result.agentsImported}`, 'success');
      } catch (error) {
        this.ui.updateSpinner('Failed to import agents', 'fail');
        result.errors.push({
          file: 'agents',
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.ui.stopSpinner();
      }
    }

    // Step 4: Import skills
    if (!resolvedOptions.skipSkills && detection.summary.totalSkills > 0) {
      try {
        this.ui.startSpinner('Importing skills...');

        const skillsResult = await this.importSkillsService.run(
          {
            force: resolvedOptions.force,
            dryRun: resolvedOptions.dryRun,
            verbose: resolvedOptions.verbose,
            autoDetect: true,
            mergeStrategy: resolvedOptions.mergeStrategy,
            metadata: resolvedOptions.addMetadata,
          },
          absolutePath
        );

        result.skillsImported = skillsResult.filesCreated;
        result.filesSkipped += skillsResult.filesSkipped;
        result.filesMerged += skillsResult.filesMerged;
        result.filesRenamed += skillsResult.filesRenamed;
        result.filesFailed += skillsResult.filesFailed;
        result.errors.push(...skillsResult.errors);
        result.importedFiles.push(
          ...skillsResult.importedFiles.map((f) => ({
            ...f,
            type: 'skill' as const,
          }))
        );

        this.ui.updateSpinner(`Skills imported: ${result.skillsImported}`, 'success');
      } catch (error) {
        this.ui.updateSpinner('Failed to import skills', 'fail');
        result.errors.push({
          file: 'skills',
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.ui.stopSpinner();
      }
    }

    // Display final summary
    this.displaySummary(result, resolvedOptions);

    return result;
  }

  /**
   * Detect available tools without importing
   */
  async detect(repoPath: string): Promise<ToolDetectionResult> {
    return this.toolDetector.detect(repoPath);
  }

  /**
   * Preview what would be imported (dry-run)
   */
  async preview(repoPath: string, options: ReverseSyncCommandFlags = {}): Promise<ReverseSyncResult> {
    return this.run(repoPath, { ...options, dryRun: true });
  }

  private resolveOptions(
    options: ReverseSyncCommandFlags,
    repoPath: string
  ): ReverseSyncOptions {
    return {
      repoPath,
      targetPath: path.join(repoPath, '.context'),
      dryRun: Boolean(options.dryRun),
      force: Boolean(options.force),
      skipAgents: Boolean(options.skipAgents),
      skipSkills: Boolean(options.skipSkills),
      skipRules: Boolean(options.skipRules),
      mergeStrategy: options.mergeStrategy || 'skip',
      verbose: Boolean(options.verbose),
      format: options.format || 'formatted',
      addMetadata: options.metadata !== false,
      sourceTools: options.sourceTools,
    };
  }

  private displaySummary(result: ReverseSyncResult, options: ReverseSyncOptions): void {
    console.log('');
    console.log(typography.separator());
    console.log(typography.header('Reverse Sync Summary'));
    console.log('');

    const totalImported = result.rulesImported + result.agentsImported + result.skillsImported;
    const hasErrors = result.filesFailed > 0 || result.errors.length > 0;
    const status = hasErrors ? colors.error(symbols.error) : colors.success(symbols.success);

    console.log(`${status} ${colors.primary(options.targetPath)}`);
    console.log('');

    // Display counts
    if (result.rulesImported > 0) {
      console.log(typography.labeledValue('Rules', result.rulesImported.toString()));
    }
    if (result.agentsImported > 0) {
      console.log(typography.labeledValue('Agents', result.agentsImported.toString()));
    }
    if (result.skillsImported > 0) {
      console.log(typography.labeledValue('Skills', result.skillsImported.toString()));
    }

    console.log('');
    console.log(typography.labeledValue('Total imported', totalImported.toString()));

    if (result.filesSkipped > 0) {
      console.log(typography.labeledValue('Skipped', result.filesSkipped.toString()));
    }
    if (result.filesMerged > 0) {
      console.log(typography.labeledValue('Merged', result.filesMerged.toString()));
    }
    if (result.filesRenamed > 0) {
      console.log(typography.labeledValue('Renamed', result.filesRenamed.toString()));
    }
    if (result.filesFailed > 0) {
      console.log(typography.labeledValue('Failed', result.filesFailed.toString()));
    }

    // Display errors
    if (result.errors.length > 0) {
      console.log('');
      console.log(colors.error('Errors:'));
      result.errors.forEach((err) => {
        console.log(`  ${colors.error(symbols.error)} ${err.file}: ${err.error}`);
      });
    }

    console.log('');
    if (options.dryRun) {
      console.log(typography.warning('DRY RUN - No changes were made'));
      console.log('');
    }
  }
}

/**
 * Factory function
 */
export function createReverseQuickSyncService(
  deps: ReverseSyncServiceDependencies
): ReverseQuickSyncService {
  return new ReverseQuickSyncService(deps);
}
