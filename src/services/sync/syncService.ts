import * as path from 'path';
import * as fs from 'fs-extra';

import { colors, symbols, typography } from '../../utils/theme';
import type { CLIInterface } from '../../utils/cliUI';
import type { TranslateFn } from '../../utils/i18n';
import type {
  SyncCommandFlags,
  SyncServiceDependencies,
  SyncOptions,
  SyncResult,
  SyncRunResult,
  SyncMode,
  AgentFileInfo
} from './types';
import { getPresetByPath, resolvePresets } from './presets';
import { createSymlinks } from './symlinkHandler';
import { createMarkdownReferences } from './markdownReferenceHandler';

export class SyncService {
  private readonly ui: CLIInterface;
  private readonly t: TranslateFn;
  private readonly version: string;

  constructor(dependencies: SyncServiceDependencies) {
    this.ui = dependencies.ui;
    this.t = dependencies.t;
    this.version = dependencies.version;
  }

  async run(rawOptions: SyncCommandFlags): Promise<SyncRunResult> {
    const options = await this.resolveOptions(rawOptions);

    await this.validateSource(options.sourcePath);

    this.displayConfig(options);

    const agentFiles = await this.discoverAgentFiles(options.sourcePath);

    if (agentFiles.length === 0) {
      this.ui.displayWarning(this.t('warnings.sync.noAgentsFound'));
      return {
        filesCreated: 0,
        filesSkipped: 0,
        filesFailed: 0,
        targets: [],
      };
    }

    this.ui.displayInfo(
      this.t('info.sync.foundAgents'),
      this.t('info.sync.foundAgentsDetail', { count: agentFiles.length })
    );

    const results: SyncResult[] = [];
    let step = 1;
    const totalSteps = options.targetPaths.length + 1;

    for (const targetPath of options.targetPaths) {
      this.ui.displayStep(
        step,
        totalSteps,
        this.t('steps.sync.processingTarget', { path: targetPath })
      );

      const result = await this.syncToTarget(agentFiles, targetPath, options);

      results.push(result);
      step++;
    }

    this.ui.displayStep(totalSteps, totalSteps, this.t('steps.sync.summary'));
    this.displaySummary(results, options.dryRun);

    if (!options.dryRun) {
      this.ui.displaySuccess(this.t('success.sync.completed'));
    }

    return {
      filesCreated: results.reduce((sum, result) => sum + result.filesCreated, 0),
      filesSkipped: results.reduce((sum, result) => sum + result.filesSkipped, 0),
      filesFailed: results.reduce((sum, result) => sum + result.filesFailed, 0),
      targets: results,
    };
  }

  /**
   * Resolve sync options from raw flags
   *
   * Supports three formats for targets:
   * 1. Preset name via `preset` option (e.g., 'all', 'claude')
   * 2. Preset names in `target` array (e.g., ['claude', 'github'])
   * 3. Direct paths in `target` array (e.g., ['.custom/agents'])
   */
  private async resolveOptions(rawOptions: SyncCommandFlags): Promise<SyncOptions> {
    const sourcePath = path.resolve(rawOptions.source || './.context/agents');

    let targetPaths: string[] = [];

    if (rawOptions.preset) {
      const presets = resolvePresets(rawOptions.preset);
      targetPaths = presets.map(p => path.resolve(p.path));
    }

    if (rawOptions.target && rawOptions.target.length > 0) {
      for (const t of rawOptions.target) {
        // First check if target is a preset name
        const presets = resolvePresets(t as Parameters<typeof resolvePresets>[0]);
        if (presets.length > 0) {
          targetPaths.push(...presets.map(p => path.resolve(p.path)));
        } else {
          // Treat as a direct path
          targetPaths.push(path.resolve(t));
        }
      }
      // Deduplicate
      targetPaths = [...new Set(targetPaths)];
    }

    if (targetPaths.length === 0) {
      throw new Error(this.t('errors.sync.noTargetsSpecified'));
    }

    const mode: SyncMode = rawOptions.mode || 'symlink';

    return {
      sourcePath,
      targetPaths,
      mode,
      force: Boolean(rawOptions.force),
      dryRun: Boolean(rawOptions.dryRun),
      verbose: Boolean(rawOptions.verbose)
    };
  }

  private async validateSource(sourcePath: string): Promise<void> {
    const exists = await fs.pathExists(sourcePath);
    if (!exists) {
      throw new Error(this.t('errors.sync.sourceMissing', { path: sourcePath }));
    }

    const stat = await fs.stat(sourcePath);
    if (!stat.isDirectory()) {
      throw new Error(this.t('errors.sync.sourceNotDirectory', { path: sourcePath }));
    }
  }

  private async discoverAgentFiles(sourcePath: string): Promise<AgentFileInfo[]> {
    const files = await fs.readdir(sourcePath);
    const agentFiles: AgentFileInfo[] = [];

    for (const filename of files) {
      if (!filename.endsWith('.md')) continue;

      const fullPath = path.join(sourcePath, filename);
      const stat = await fs.stat(fullPath);

      if (!stat.isFile()) continue;

      const name = filename.replace('.md', '');

      agentFiles.push({
        name,
        sourcePath: fullPath,
        relativePath: filename,
        filename
      });
    }

    return agentFiles.sort((a, b) => a.name.localeCompare(b.name));
  }

  private async syncToTarget(
    agentFiles: AgentFileInfo[],
    targetPath: string,
    options: SyncOptions
  ): Promise<SyncResult> {
    const result: SyncResult = {
      targetPath,
      filesCreated: 0,
      filesSkipped: 0,
      filesFailed: 0,
      errors: []
    };

    if (!options.dryRun) {
      await fs.ensureDir(targetPath);
    }

    this.ui.startSpinner(this.t('spinner.sync.processing', { path: targetPath }));

    try {
      const preset = getPresetByPath(targetPath);
      const handlerResult =
        options.mode === 'symlink'
          ? await createSymlinks(agentFiles, targetPath, options.sourcePath, {
              force: options.force,
              dryRun: options.dryRun,
              verbose: options.verbose,
              filenameSuffix: preset?.filenameSuffix,
            })
          : await createMarkdownReferences(agentFiles, targetPath, options.sourcePath, {
              force: options.force,
              dryRun: options.dryRun,
              verbose: options.verbose,
              filenameSuffix: preset?.filenameSuffix,
            });

      result.filesCreated = handlerResult.filesCreated;
      result.filesSkipped = handlerResult.filesSkipped;
      result.filesFailed = handlerResult.filesFailed;
      result.errors = handlerResult.errors;

      this.ui.updateSpinner(
        this.t('spinner.sync.complete', {
          path: targetPath,
          count: result.filesCreated
        }),
        'success'
      );
    } catch (error) {
      this.ui.updateSpinner(this.t('spinner.sync.failed', { path: targetPath }), 'fail');
      result.filesFailed = agentFiles.length;
      result.errors.push({
        file: targetPath,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      this.ui.stopSpinner();
    }

    return result;
  }

  private displayConfig(options: SyncOptions): void {
    console.log('');
    console.log(typography.header('Sync Configuration'));
    console.log('');
    console.log(typography.labeledValue('Source', options.sourcePath));
    console.log(typography.labeledValue('Mode', options.mode));
    console.log(`  ${colors.secondary('Targets')}`);
    options.targetPaths.forEach(t => {
      console.log(`    ${colors.secondaryDim(symbols.pointer)} ${colors.primary(t)}`);
    });
    if (options.dryRun) {
      console.log('');
      console.log(typography.warning('DRY RUN - No changes will be made'));
    }
    console.log('');
  }

  private displaySummary(results: SyncResult[], dryRun: boolean): void {
    console.log('');
    console.log(typography.separator());
    console.log(typography.header('Sync Summary'));
    console.log('');

    let totalCreated = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const result of results) {
      totalCreated += result.filesCreated;
      totalSkipped += result.filesSkipped;
      totalFailed += result.filesFailed;

      const status = result.filesFailed > 0
        ? colors.error(symbols.error)
        : colors.success(symbols.success);

      console.log(`${status} ${colors.primary(result.targetPath)}`);
      console.log(
        `    ${colors.secondary(`Created: ${result.filesCreated}, Skipped: ${result.filesSkipped}, Failed: ${result.filesFailed}`)}`
      );

      if (result.errors.length > 0) {
        result.errors.forEach(err => {
          console.log(`    ${colors.error(symbols.error)} ${colors.secondaryDim(`${err.file} - ${err.error}`)}`);
        });
      }
    }

    console.log('');
    console.log(typography.labeledValue('Created', `${totalCreated}${dryRun ? ' (dry run)' : ''}`));
    console.log(typography.labeledValue('Skipped', totalSkipped.toString()));
    console.log(typography.labeledValue('Failed', totalFailed.toString()));
    console.log('');
  }
}
