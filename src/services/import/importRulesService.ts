import * as path from 'path';
import * as fs from 'fs-extra';

import { colors, symbols, typography } from '../../utils/theme';
import type { CLIInterface } from '../../utils/cliUI';
import type { TranslateFn } from '../../utils/i18n';
import type {
  ImportRulesCommandFlags,
  ImportServiceDependencies,
  ImportRulesOptions,
  ImportResult,
  RuleFileInfo,
  ImportFormat
} from './types';
import { RulesDetector } from './rulesDetector';

export class ImportRulesService {
  private readonly ui: CLIInterface;
  private readonly t: TranslateFn;
  private readonly version: string;
  private readonly detector: RulesDetector;

  constructor(dependencies: ImportServiceDependencies) {
    this.ui = dependencies.ui;
    this.t = dependencies.t;
    this.version = dependencies.version;
    this.detector = new RulesDetector();
  }

  async run(rawOptions: ImportRulesCommandFlags, repoPath: string = process.cwd()): Promise<ImportResult> {
    const options = await this.resolveOptions(rawOptions, repoPath);

    this.displayConfig(options);

    // Detect rules
    let detectionResult;
    if (options.autoDetect && options.sourcePaths.length === 0) {
      this.ui.startSpinner(this.t('spinner.import.detectingRules'));
      detectionResult = await this.detector.detectRules(repoPath, true);
      this.ui.stopSpinner();
    } else if (options.sourcePaths.length > 0) {
      this.ui.startSpinner(this.t('spinner.import.scanningPaths'));
      detectionResult = await this.detector.detectFromPaths(options.sourcePaths, repoPath);
      this.ui.stopSpinner();
    } else {
      detectionResult = { files: [], sources: [] };
    }

    if (detectionResult.files.length === 0) {
      this.ui.displayWarning(this.t('warnings.import.noRulesFound'));
      return {
        targetPath: options.targetPath,
        filesCreated: 0,
        filesSkipped: 0,
        filesFailed: 0,
        errors: [],
      };
    }

    this.ui.displayInfo(
      this.t('info.import.foundRules'),
      this.t('info.import.foundRulesDetail', { count: detectionResult.files.length })
    );

    if (options.verbose) {
      detectionResult.files.forEach(file => {
        console.log(`  ${colors.secondaryDim(symbols.pointer)} ${colors.primary(file.sourcePath)}`);
      });
    }

    // Import files
    const result = await this.importFiles(detectionResult.files, options);

    this.displaySummary(result, options.dryRun);

    if (!options.dryRun) {
      this.ui.displaySuccess(this.t('success.import.completed'));
    }

    return result;
  }

  private async resolveOptions(
    rawOptions: ImportRulesCommandFlags,
    repoPath: string
  ): Promise<ImportRulesOptions> {
    const targetPath = rawOptions.target
      ? path.resolve(rawOptions.target)
      : path.resolve(repoPath, '.context/docs');

    const sourcePaths = rawOptions.source || [];
    const format: ImportFormat = (rawOptions.format as ImportFormat) || 'markdown';
    const autoDetect = rawOptions.autoDetect !== false;

    return {
      sourcePaths,
      targetPath,
      format,
      force: Boolean(rawOptions.force),
      dryRun: Boolean(rawOptions.dryRun),
      verbose: Boolean(rawOptions.verbose),
      autoDetect
    };
  }

  private async importFiles(
    files: RuleFileInfo[],
    options: ImportRulesOptions
  ): Promise<ImportResult> {
    const result: ImportResult = {
      targetPath: options.targetPath,
      filesCreated: 0,
      filesSkipped: 0,
      filesFailed: 0,
      errors: []
    };

    if (!options.dryRun) {
      await fs.ensureDir(options.targetPath);
    }

    this.ui.startSpinner(this.t('spinner.import.importing', { path: options.targetPath }));

    for (const file of files) {
      try {
        const targetFile = path.join(options.targetPath, file.filename);
        const exists = await fs.pathExists(targetFile);

        if (exists && !options.force) {
          result.filesSkipped++;
          if (options.verbose) {
            console.log(`  ${colors.secondaryDim('Skipped (exists):')} ${targetFile}`);
          }
          continue;
        }

        if (exists && options.force && !options.dryRun) {
          await fs.remove(targetFile);
        }

        if (!options.dryRun) {
          // Read source file
          const content = await fs.readFile(file.sourcePath, 'utf-8');
          
          // Format content based on format option
          const formattedContent = this.formatContent(content, file, options.format);
          
          // Write to target
          await fs.writeFile(targetFile, formattedContent);
        }

        result.filesCreated++;

        if (options.verbose) {
          console.log(`  ${colors.success(symbols.success)} ${colors.primary(targetFile)}`);
        }
      } catch (error) {
        result.filesFailed++;
        result.errors.push({
          file: file.filename,
          error: error instanceof Error ? error.message : String(error)
        });
        if (options.verbose) {
          console.log(`  ${colors.error(symbols.error)} ${file.filename}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    this.ui.updateSpinner(
      this.t('spinner.import.complete', {
        path: options.targetPath,
        count: result.filesCreated
      }),
      'success'
    );
    this.ui.stopSpinner();

    return result;
  }

  private formatContent(content: string, file: RuleFileInfo, format: ImportFormat): string {
    switch (format) {
      case 'markdown':
        return this.formatAsMarkdown(content, file);
      case 'formatted':
        return this.formatAsFormatted(content, file);
      case 'raw':
      default:
        return content;
    }
  }

  private formatAsMarkdown(content: string, file: RuleFileInfo): string {
    const header = `# ${file.name}\n\n`;
    const sourceInfo = `> **Source:** \`${file.relativePath}\`\n`;
    const typeInfo = `> **Type:** ${file.type}\n\n`;
    const separator = '---\n\n';
    
    return `${header}${sourceInfo}${typeInfo}${separator}${content}`;
  }

  private formatAsFormatted(content: string, file: RuleFileInfo): string {
    const frontMatter = `---\nsource: ${file.relativePath}\ntype: ${file.type}\n---\n\n`;
    return `${frontMatter}${content}`;
  }

  private displayConfig(options: ImportRulesOptions): void {
    console.log('');
    console.log(typography.header('Import Rules Configuration'));
    console.log('');
    console.log(typography.labeledValue('Target', options.targetPath));
    console.log(typography.labeledValue('Format', options.format));
    console.log(typography.labeledValue('Auto-detect', options.autoDetect ? 'Yes' : 'No'));
    if (options.sourcePaths.length > 0) {
      console.log(`  ${colors.secondary('Source Paths')}`);
      options.sourcePaths.forEach(p => {
        console.log(`    ${colors.secondaryDim(symbols.pointer)} ${colors.primary(p)}`);
      });
    }
    if (options.dryRun) {
      console.log('');
      console.log(typography.warning('DRY RUN - No changes will be made'));
    }
    console.log('');
  }

  private displaySummary(result: ImportResult, dryRun: boolean): void {
    console.log('');
    console.log(typography.separator());
    console.log(typography.header('Import Summary'));
    console.log('');

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

    console.log('');
    console.log(typography.labeledValue('Created', `${result.filesCreated}${dryRun ? ' (dry run)' : ''}`));
    console.log(typography.labeledValue('Skipped', result.filesSkipped.toString()));
    console.log(typography.labeledValue('Failed', result.filesFailed.toString()));
    console.log('');
  }
}
