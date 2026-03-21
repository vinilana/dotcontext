import ora, { Ora } from 'ora';
import * as cliProgress from 'cli-progress';

import { TranslateFn, TranslationKey, TranslateParams } from './i18n';
import { colors, symbols, typography } from './theme';

export class CLIInterface {
  private spinner: Ora | null = null;
  private progressBar: cliProgress.SingleBar | null = null;
  private startTime: number = Date.now();

  constructor(private readonly translate: TranslateFn) {}

  displayWelcome(version: string): void {
    const name = this.t('cli.name');
    const tagline = this.t('cli.tagline');

    console.log('');
    console.log(typography.header(name));
    console.log(colors.secondary(symbols.dash.repeat(name.length)));
    console.log(colors.secondary(`v${version}`));
    console.log(colors.secondaryDim(tagline));
    console.log('');
  }

  /**
   * Display PREVC workflow explanation with visual diagram
   */
  displayPrevcExplanation(): void {
    const repoUrl = 'https://github.com/ai-coders-academy/ai-coders-context';

    console.log('');
    console.log(colors.accent(this.t('ui.prevc.title')));
    console.log(colors.secondaryDim(this.t('ui.prevc.subtitle')));
    console.log('');

    // Visual PREVC diagram
    console.log(colors.secondary('  ┌─────────────────────────────────────────────────────────────┐'));
    console.log(colors.secondary('  │') + colors.primary('  P → R → E → V → C                                         ') + colors.secondary('│'));
    console.log(colors.secondary('  │                                                             │'));
    console.log(colors.secondary('  │') + colors.accent('  [P]') + colors.primary('lan      ') + colors.secondaryDim('Define specs before coding                  ') + colors.secondary('│'));
    console.log(colors.secondary('  │') + colors.accent('  [R]') + colors.primary('eview    ') + colors.secondaryDim('Validate approach with context              ') + colors.secondary('│'));
    console.log(colors.secondary('  │') + colors.accent('  [E]') + colors.primary('xecute   ') + colors.secondaryDim('Implement following the plan                ') + colors.secondary('│'));
    console.log(colors.secondary('  │') + colors.accent('  [V]') + colors.primary('alidate  ') + colors.secondaryDim('Test and verify against specs               ') + colors.secondary('│'));
    console.log(colors.secondary('  │') + colors.accent('  [C]') + colors.primary('onfirm   ') + colors.secondaryDim('Human approval before merge                 ') + colors.secondary('│'));
    console.log(colors.secondary('  └─────────────────────────────────────────────────────────────┘'));
    console.log('');
    console.log(colors.secondaryDim(`  ${this.t('ui.prevc.specDriven')}`));
    console.log('');
    console.log(colors.secondaryDim(`  ${symbols.pointer} ${repoUrl}`));
    console.log('');
  }

  displayProjectInfo(repoPath: string, outputDir: string, mode: string): void {
    console.log(typography.header(this.t('ui.projectConfiguration.title')));
    console.log('');
    console.log(typography.labeledValue(this.t('ui.projectConfiguration.repository'), repoPath, 14));
    console.log(typography.labeledValue(this.t('ui.projectConfiguration.output'), outputDir, 14));
    console.log(typography.labeledValue(this.t('ui.projectConfiguration.mode'), mode, 14));
    console.log('');
  }

  startSpinner(text: string): void {
    // Stop any existing spinner to prevent orphaned spinners
    if (this.spinner) {
      this.spinner.stop();
    }
    this.spinner = ora({
      text: colors.secondary(text),
      spinner: 'dots',
      color: 'white'
    }).start();
  }

  updateSpinner(text: string, type?: 'success' | 'fail' | 'warn' | 'info'): void {
    if (!this.spinner) return;

    switch (type) {
      case 'success':
        this.spinner.stopAndPersist({
          symbol: colors.success(symbols.success),
          text: colors.primary(text)
        });
        break;
      case 'fail':
        this.spinner.stopAndPersist({
          symbol: colors.error(symbols.error),
          text: colors.primary(text)
        });
        break;
      case 'warn':
        this.spinner.stopAndPersist({
          symbol: colors.warning(symbols.warning),
          text: colors.primary(text)
        });
        break;
      case 'info':
        this.spinner.stopAndPersist({
          symbol: colors.accent(symbols.info),
          text: colors.primary(text)
        });
        break;
      default:
        this.spinner.text = colors.secondary(text);
    }
  }

  stopSpinner(success: boolean = true): void {
    if (!this.spinner) return;

    if (success) {
      this.spinner.stop();
    } else {
      this.spinner.fail();
    }
    this.spinner = null;
  }

  createProgressBar(total: number, title: string): void {
    this.progressBar = new cliProgress.SingleBar({
      format: `${colors.secondary(title)} {bar} {percentage}% ${colors.secondaryDim('{value}/{total}')} ${colors.secondaryDim('{task}')}`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      stopOnComplete: true,
      clearOnComplete: false
    }, cliProgress.Presets.rect);

    this.progressBar.start(total, 0, {
      task: this.t('ui.progress.starting')
    });
  }

  updateProgress(current: number, task: string): void {
    if (!this.progressBar) return;
    this.progressBar.update(current, { task });
  }

  completeProgress(): void {
    if (!this.progressBar) return;
    this.progressBar.stop();
    this.progressBar = null;
  }

  displayAnalysisResults(totalFiles: number, totalDirs: number, totalSize: string): void {
    console.log('');
    console.log(typography.header(this.t('ui.analysis.complete.title')));
    console.log('');
    console.log(typography.labeledValue(this.t('ui.analysis.files'), totalFiles.toString()));
    console.log(typography.labeledValue(this.t('ui.analysis.directories'), totalDirs.toString()));
    console.log(typography.labeledValue(this.t('ui.analysis.totalSize'), totalSize));
    console.log('');
  }

  displayFileTypeDistribution(distribution: Map<string, number>, totalFiles: number): void {
    console.log(typography.header(this.t('ui.fileTypeDistribution.title')));
    console.log('');

    const sorted = Array.from(distribution.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    sorted.forEach(([ext, count]) => {
      const percentage = ((count / totalFiles) * 100).toFixed(1);
      const barLength = Math.round((count / totalFiles) * 30);
      const bar = '\u2588'.repeat(barLength) + '\u2591'.repeat(30 - barLength);

      console.log(
        `  ${colors.primary(ext.padEnd(12))} ${colors.secondaryDim(bar)} ${colors.secondary(count.toString().padStart(4))} ${colors.secondaryDim(`(${percentage}%)`)}`
      );
    });
    console.log('');
  }

  displayGenerationSummary(docsGenerated: number, agentsGenerated: number, skillsGenerated?: number): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    console.log('');
    console.log(typography.separator());
    console.log(typography.header(this.t('ui.generationSummary.title')));
    console.log('');
    console.log(typography.labeledValue(this.t('ui.generationSummary.documentation'), `${docsGenerated} files`));
    console.log(typography.labeledValue(this.t('ui.generationSummary.agents'), `${agentsGenerated} playbooks`));
    if (skillsGenerated !== undefined && skillsGenerated > 0) {
      console.log(typography.labeledValue(this.t('ui.generationSummary.skills'), `${skillsGenerated} skills`));
    }
    console.log(typography.labeledValue(this.t('ui.generationSummary.timeElapsed'), `${elapsed}s`));
    console.log('');
    console.log(colors.secondaryDim(this.t('ui.generationSummary.nextStep')));
    console.log('');
  }

  displayError(message: string, error?: Error): void {
    console.log('');
    console.log(`${colors.error(symbols.error)} ${colors.primaryBold(this.t('ui.error.title'))}`);
    console.log('');
    console.log(`  ${colors.primary(message)}`);
    if (error?.stack) {
      console.log('');
      console.log(colors.secondaryDim(error.stack));
    }
    console.log('');
  }

  displayInfo(title: string, message: string): void {
    console.log('');
    console.log(`${colors.accent(symbols.info)} ${typography.header(title)}`);
    console.log('');
    console.log(`  ${colors.primary(message)}`);
    console.log('');
  }

  displaySuccess(message: string): void {
    console.log(typography.success(message));
  }

  displayWarning(message: string): void {
    console.log(typography.warning(message));
  }

  displayStep(step: number, total: number, description: string): void {
    console.log(
      colors.secondaryDim(`[${step}/${total}]`) + ' ' +
      colors.primary(description)
    );
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private t(key: TranslationKey, params?: TranslateParams): string {
    return this.translate(key, params);
  }
}
