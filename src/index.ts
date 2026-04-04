#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import inquirer from 'inquirer';

import { colors, typography } from './utils/theme';
import {
  formatSplashDirectory,
  packageNameToDisplayName,
  renderSplashScreen
} from './utils/splashScreen';
import { themedSelect, Separator } from './utils/themedPrompt';
import { CLIInterface } from './utils/cliUI';
import { checkForUpdates } from './utils/versionChecker';
import { createTranslator, detectLocale, SUPPORTED_LOCALES, normalizeLocale } from './utils/i18n';
import type { TranslateFn, Locale, TranslationKey } from './utils/i18n';
import { SyncService } from './services/sync/syncService';
import { ImportRulesService, ImportAgentsService } from './services/import';
import { startMCPServer, MCPInstallService } from './services/mcp';
import { StateDetector } from './services/state';
import { WorkflowService, WorkflowServiceDependencies } from './services/workflow';
import { ExportRulesService } from './services/export';
import { ReportService } from './services/report';
import { QuickSyncService, QuickSyncOptions } from './services/quickSync';
import { ReverseQuickSyncService, type MergeStrategy } from './services/reverseSync';
import { getScaleName, PHASE_NAMES_PT, ROLE_DISPLAY_NAMES, type PrevcRole } from './workflow';
import {
  detectSmartDefaults,
  displayConfigSummary,
  type ConfigSummary
} from './utils/prompts';
import { VERSION, PACKAGE_NAME } from './version';

const rawArgs = process.argv.slice(2);
const isMcpCommand = rawArgs.includes('mcp');

// Determine if we're in interactive mode (no command args, only flags like --lang)
const isInteractiveMode = rawArgs.every(arg =>
  arg.startsWith('-') ||
  rawArgs[rawArgs.indexOf(arg) - 1]?.startsWith('--lang') ||
  rawArgs[rawArgs.indexOf(arg) - 1]?.startsWith('--language') ||
  rawArgs[rawArgs.indexOf(arg) - 1]?.startsWith('-l')
);

const initialLocale = detectLocale(rawArgs, process.env.DOTCONTEXT_LANG, [
  process.env.LC_ALL,
  process.env.LC_MESSAGES,
  process.env.LANG
]);
let currentLocale: Locale = initialLocale;
let translateFn = createTranslator(initialLocale);
const t: TranslateFn = (key, params) => translateFn(key, params);

const localeLabelKeys: Record<Locale, TranslationKey> = {
  en: 'prompts.language.option.en',
  'pt-BR': 'prompts.language.option.pt-BR'
};

const program = new Command();
const ui = new CLIInterface(t);

const syncService = new SyncService({
  ui,
  t,
  version: VERSION
});

const importRulesService = new ImportRulesService({
  ui,
  t,
  version: VERSION
});

const importAgentsService = new ImportAgentsService({
  ui,
  t,
  version: VERSION
});

program
  .name('dotcontext')
  .description(t('cli.description'))
  .version(VERSION);

program.option('-l, --lang <locale>', t('global.options.lang'), initialLocale);

let versionCheckPromise: Promise<void> | null = null;

function scheduleVersionCheck(force: boolean = false): Promise<void> {
  if (!versionCheckPromise || force) {
    versionCheckPromise = checkForUpdates({
      packageName: PACKAGE_NAME,
      currentVersion: VERSION,
      ui,
      t,
      force
    }).catch(() => { });
  }

  return versionCheckPromise;
}

function buildMcpToolChoices(
  supportedTools: Array<{ id: string; displayName: string }>,
  detectedTools: string[],
): Array<{ name: string; value: string }> {
  const detectedSet = new Set(detectedTools);
  const orderedTools = [
    ...supportedTools.filter(tool => detectedSet.has(tool.id)),
    ...supportedTools.filter(tool => !detectedSet.has(tool.id)),
  ];

  return [
    {
      name: t('commands.mcpInstall.allDetected'),
      value: 'all',
    },
    ...orderedTools.map(tool => ({
      name: detectedSet.has(tool.id)
        ? `${tool.displayName} (${t('labels.detected')})`
        : tool.displayName,
      value: tool.id,
    })),
  ];
}

program.hook('preAction', () => {
  void scheduleVersionCheck();
});

program
  .command('sync-agents')
  .description(t('commands.sync.description'))
  .option('-s, --source <dir>', t('commands.sync.options.source'), './.context/agents')
  .option('-t, --target <paths...>', t('commands.sync.options.target'))
  .option('-m, --mode <type>', t('commands.sync.options.mode'), 'symlink')
  .option('-p, --preset <name>', t('commands.sync.options.preset'))
  .option('--force', t('commands.sync.options.force'))
  .option('--dry-run', t('commands.sync.options.dryRun'))
  .option('-v, --verbose', t('commands.sync.options.verbose'))
  .action(async (options: any) => {
    try {
      await syncService.run(options);
    } catch (error) {
      ui.displayError(t('errors.sync.failed'), error as Error);
      process.exit(1);
    }
  });

program
  .command('import-rules')
  .description(t('commands.importRules.description'))
  .argument('[repo-path]', 'Repository path to scan', process.cwd())
  .option('-s, --source <paths...>', t('commands.importRules.options.source'))
  .option('-t, --target <dir>', t('commands.importRules.options.target'))
  .option('-f, --format <format>', t('commands.importRules.options.format'), 'markdown')
  .option('--force', t('commands.importRules.options.force'))
  .option('--dry-run', t('commands.importRules.options.dryRun'))
  .option('-v, --verbose', t('commands.importRules.options.verbose'))
  .option('--no-auto-detect', 'Disable auto-detection')
  .action(async (repoPath: string, options: any) => {
    try {
      await importRulesService.run({
        source: options.source,
        target: options.target,
        format: options.format,
        force: options.force,
        dryRun: options.dryRun,
        verbose: options.verbose,
        autoDetect: options.autoDetect !== false
      }, repoPath);
    } catch (error) {
      ui.displayError(t('errors.import.failed'), error as Error);
      process.exit(1);
    }
  });

program
  .command('import-agents')
  .description(t('commands.importAgents.description'))
  .argument('[repo-path]', 'Repository path to scan', process.cwd())
  .option('-s, --source <paths...>', t('commands.importAgents.options.source'))
  .option('-t, --target <dir>', t('commands.importAgents.options.target'))
  .option('--force', t('commands.importAgents.options.force'))
  .option('--dry-run', t('commands.importAgents.options.dryRun'))
  .option('-v, --verbose', t('commands.importAgents.options.verbose'))
  .option('--no-auto-detect', 'Disable auto-detection')
  .action(async (repoPath: string, options: any) => {
    try {
      await importAgentsService.run({
        source: options.source,
        target: options.target,
        force: options.force,
        dryRun: options.dryRun,
        verbose: options.verbose,
        autoDetect: options.autoDetect !== false
      }, repoPath);
    } catch (error) {
      ui.displayError(t('errors.import.failed'), error as Error);
      process.exit(1);
    }
  });

program
  .command('reverse-sync')
  .description('Import rules, agents, and skills from AI tool directories into .context/')
  .argument('[repo-path]', 'Repository path to scan', process.cwd())
  .option('--dry-run', 'Preview changes without importing')
  .option('-f, --force', 'Overwrite existing files')
  .option('--skip-agents', 'Skip importing agents')
  .option('--skip-skills', 'Skip importing skills')
  .option('--skip-rules', 'Skip importing rules')
  .option('--merge-strategy <strategy>', 'How to handle conflicts: skip|overwrite|merge|rename', 'skip')
  .option('--format <format>', 'Output format for rules: markdown|raw|formatted', 'formatted')
  .option('--no-metadata', 'Do not add import metadata to files')
  .option('-v, --verbose', 'Verbose output')
  .action(async (repoPath: string, options: any) => {
    try {
      const service = new ReverseQuickSyncService({ ui, t, version: VERSION });
      await service.run(repoPath, {
        dryRun: options.dryRun,
        force: options.force,
        skipAgents: options.skipAgents,
        skipSkills: options.skipSkills,
        skipRules: options.skipRules,
        mergeStrategy: options.mergeStrategy as MergeStrategy,
        format: options.format,
        metadata: options.metadata !== false,
        verbose: options.verbose,
      });
    } catch (error) {
      ui.displayError(t('errors.reverseSync.failed'), error as Error);
      process.exit(1);
    }
  });

program
  .command('mcp')
  .description('Start MCP (Model Context Protocol) server for Claude Code integration')
  .option('-r, --repo-path <path>', 'Default repository path for tools')
  .option('-v, --verbose', 'Enable verbose logging to stderr')
  .action(async (options: any) => {
    try {
      const server = await startMCPServer({
        repoPath: options.repoPath,
        verbose: options.verbose
      });

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        await server.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await server.stop();
        process.exit(0);
      });
    } catch (error) {
      if (options.verbose) {
        process.stderr.write(`[mcp] Error: ${error}\n`);
      }
      process.exit(1);
    }
  });

// MCP Install Command
program
  .command('mcp:install [tool]')
  .description(t('commands.mcpInstall.description'))
  .option('-g, --global', t('commands.mcpInstall.options.global'), true)
  .option('-l, --local', t('commands.mcpInstall.options.local'))
  .option('--dry-run', t('commands.mcpInstall.options.dryRun'))
  .option('-v, --verbose', t('commands.mcpInstall.options.verbose'))
  .action(async (tool: string | undefined, options: any) => {
    try {
      const mcpInstallService = new MCPInstallService({ ui, t, version: VERSION });

      // If no tool specified and not in CI, show interactive prompt
      if (!tool && process.stdin.isTTY) {
        const supportedTools = mcpInstallService.getSupportedTools();
        const detectedTools = await mcpInstallService.detectInstalledTools();
        const choices = buildMcpToolChoices(supportedTools, detectedTools);

        const { selectedTool } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedTool',
            message: t('commands.mcpInstall.selectTool'),
            choices,
          },
        ]);

        tool = selectedTool;
      }

      const result = await mcpInstallService.run({
        tool,
        global: options.local ? false : options.global,
        dryRun: options.dryRun,
        verbose: options.verbose,
        repoPath: process.cwd(),
      });

      if (result.installations.length > 0) {
        ui.displayInfo('MCP', t('info.mcp.restartTools'));
      }
    } catch (error) {
      ui.displayError(t('errors.mcp.installFailed', { tool: tool || 'unknown' }), error as Error);
      process.exit(1);
    }
  });

program
  .command('preview-splash')
  .description(t('commands.previewSplash.description'))
  .option('--title <title>', t('commands.previewSplash.options.title'))
  .option('--directory <path>', t('commands.previewSplash.options.directory'), process.cwd())
  .action(async (options: any) => {
    try {
      await renderStartupSplash(options.directory, options.title);
    } catch (error) {
      ui.displayError(t('errors.cli.executionFailed'), error as Error);
      process.exit(1);
    }
  });

// Export Rules Command
program
  .command('export-rules')
  .description(t('commands.export.description'))
  .argument('[repo-path]', 'Repository path', process.cwd())
  .option('-s, --source <dir>', t('commands.export.options.source'), '.context/docs')
  .option('-t, --targets <paths...>', t('commands.export.options.targets'))
  .option('--preset <name>', t('commands.export.options.preset'))
  .option('--force', t('commands.export.options.force'))
  .option('--dry-run', t('commands.export.options.dryRun'))
  .option('-v, --verbose', t('commands.fill.options.verbose'))
  .action(async (repoPath: string, options: any) => {
    try {
      const exportService = new ExportRulesService({
        ui,
        t,
        version: VERSION,
      });

      await exportService.run(repoPath, {
        source: options.source,
        targets: options.targets,
        preset: options.preset,
        force: options.force,
        dryRun: options.dryRun,
        verbose: options.verbose,
      });
    } catch (error) {
      ui.displayError(t('errors.cli.executionFailed'), error as Error);
      process.exit(1);
    }
  });

// Report Command
program
  .command('report')
  .description(t('commands.report.description'))
  .argument('[repo-path]', 'Repository path', process.cwd())
  .option('-f, --format <format>', t('commands.report.options.format'), 'console')
  .option('-o, --output <path>', t('commands.report.options.output'))
  .option('--include-stack', t('commands.report.options.includeStack'))
  .option('-v, --verbose', t('commands.fill.options.verbose'))
  .action(async (repoPath: string, options: any) => {
    try {
      const reportService = new ReportService({
        ui,
        t,
        version: VERSION,
      });

      const report = await reportService.generate(repoPath, {
        format: options.format,
        output: options.output,
        includeStack: options.includeStack,
        verbose: options.verbose,
      });

      await reportService.output(report, options);
    } catch (error) {
      ui.displayError(t('errors.cli.executionFailed'), error as Error);
      process.exit(1);
    }
  });

// Skill Commands
const skillCommand = program
  .command('skill')
  .description(t('commands.skill.description'));

skillCommand
  .command('list')
  .description(t('commands.skill.list.description'))
  .argument('[repo-path]', 'Repository path', process.cwd())
  .option('--json', 'Output as JSON')
  .action(async (repoPath: string, options: any) => {
    try {
      const { createSkillRegistry } = await import('./workflow/skills');
      const registry = createSkillRegistry(repoPath);
      const discovered = await registry.discoverAll();

      if (options.json) {
        console.log(JSON.stringify({
          builtIn: discovered.builtIn.map(s => s.slug),
          custom: discovered.custom.map(s => s.slug),
          total: discovered.all.length,
        }, null, 2));
        return;
      }

      console.log('\nBuilt-in Skills:');
      for (const skill of discovered.builtIn) {
        const projectSkill = discovered.all.find(s => s.slug === skill.slug && s.path.includes('.context'));
        const status = projectSkill ? '[project]' : '[available]';
        console.log(`  ${skill.slug} ${status}`);
        console.log(`    ${skill.metadata.description}`);
      }

      if (discovered.custom.length > 0) {
        console.log('\nCustom Skills:');
        for (const skill of discovered.custom) {
          console.log(`  ${skill.slug}`);
          console.log(`    ${skill.metadata.description}`);
        }
      }

      console.log(`\nTotal: ${discovered.all.length} skills (${discovered.builtIn.length} built-in, ${discovered.custom.length} custom)`);
    } catch (error) {
      ui.displayError('Failed to list skills', error as Error);
      process.exit(1);
    }
  });

skillCommand
  .command('export')
  .description(t('commands.skill.export.description'))
  .argument('[repo-path]', 'Repository path', process.cwd())
  .option('-p, --preset <preset>', 'Export preset: claude, gemini, codex, all', 'all')
  .option('-f, --force', 'Overwrite existing files')
  .option('--include-builtin', 'Include built-in skills even if not scaffolded')
  .option('--dry-run', 'Preview changes without writing')
  .action(async (repoPath: string, options: any) => {
    try {
      const { SkillExportService } = await import('./services/export/skillExportService');
      const exportService = new SkillExportService({
        ui,
        t,
        version: VERSION,
      });

      const result = await exportService.run(repoPath, {
        preset: options.preset,
        force: options.force,
        includeBuiltIn: options.includeBuiltin,
        dryRun: options.dryRun,
      });

      if (options.dryRun) {
        ui.displayInfo('Dry run', 'No files were written');
      } else {
        ui.displaySuccess(`Exported ${result.skillsExported.length} skills to ${result.targets.length} targets`);
      }
    } catch (error) {
      ui.displayError('Failed to export skills', error as Error);
      process.exit(1);
    }
  });

// PREVC Workflow Commands
const workflowCommand = program
  .command('workflow')
  .description('PREVC workflow management (Planning, Review, Execution, Validation, Confirmation)');

// Helper to create workflow service dependencies
const getWorkflowDeps = (): WorkflowServiceDependencies => ({
  ui: {
    displaySuccess: (msg: string) => ui.displaySuccess(msg),
    displayError: (msg: string, err?: Error) => ui.displayError(msg, err),
    displayInfo: (title: string, detail?: string) => ui.displayInfo(title, detail || '')
  }
});

workflowCommand
  .command('init <name>')
  .description('Initialize a new PREVC workflow')
  .option('-d, --description <text>', 'Project description for scale detection')
  .option('-s, --scale <scale>', 'Project scale: QUICK, SMALL, MEDIUM, LARGE')
  .option('-r, --repo-path <path>', 'Repository path', process.cwd())
  .action(async (name: string, options: any) => {
    try {
      const workflowService = new WorkflowService(options.repoPath, getWorkflowDeps());
      const status = await workflowService.init({
        name,
        description: options.description,
        scale: options.scale
      });

      ui.displaySuccess(`Workflow PREVC initialized: ${name}`);
      ui.displayInfo('Scale', getScaleName(status.project.scale as any));
      ui.displayInfo('Current Phase', `${status.project.current_phase} - ${PHASE_NAMES_PT[status.project.current_phase]}`);
    } catch (error) {
      ui.displayError('Failed to initialize workflow', error as Error);
      process.exit(1);
    }
  });

workflowCommand
  .command('status')
  .description('Show current workflow status')
  .option('-r, --repo-path <path>', 'Repository path', process.cwd())
  .action(async (options: any) => {
    try {
      const workflowService = new WorkflowService(options.repoPath, getWorkflowDeps());

      if (!await workflowService.hasWorkflow()) {
        ui.displayError('No workflow found. Run "workflow init <name>" first.');
        process.exit(1);
      }

      const formattedStatus = await workflowService.getFormattedStatus();
      console.log(formattedStatus);

      const actions = await workflowService.getRecommendedActions();
      if (actions.length > 0) {
        console.log('\nRecommended actions:');
        actions.forEach((action, i) => console.log(`  ${i + 1}. ${action}`));
      }
    } catch (error) {
      ui.displayError('Failed to get workflow status', error as Error);
      process.exit(1);
    }
  });

workflowCommand
  .command('advance')
  .description('Complete current phase and advance to next')
  .option('-r, --repo-path <path>', 'Repository path', process.cwd())
  .option('-o, --outputs <files...>', 'Output files generated in current phase')
  .action(async (options: any) => {
    try {
      const workflowService = new WorkflowService(options.repoPath, getWorkflowDeps());

      if (!await workflowService.hasWorkflow()) {
        ui.displayError('No workflow found. Run "workflow init <name>" first.');
        process.exit(1);
      }

      const nextPhase = await workflowService.advance(options.outputs);

      if (nextPhase) {
        ui.displaySuccess(`Advanced to phase: ${nextPhase} - ${PHASE_NAMES_PT[nextPhase]}`);
      } else {
        ui.displaySuccess('Workflow completed!');
      }
    } catch (error) {
      ui.displayError('Failed to advance workflow', error as Error);
      process.exit(1);
    }
  });

workflowCommand
  .command('handoff <from> <to>')
  .description('Perform handoff between roles')
  .option('-r, --repo-path <path>', 'Repository path', process.cwd())
  .option('-a, --artifacts <files...>', 'Artifacts to hand off')
  .action(async (from: string, to: string, options: any) => {
    try {
      const workflowService = new WorkflowService(options.repoPath, getWorkflowDeps());

      if (!await workflowService.hasWorkflow()) {
        ui.displayError('No workflow found. Run "workflow init <name>" first.');
        process.exit(1);
      }

      await workflowService.handoff(from as PrevcRole, to as PrevcRole, options.artifacts || []);
      ui.displaySuccess(`Handoff: ${ROLE_DISPLAY_NAMES[from as PrevcRole]} → ${ROLE_DISPLAY_NAMES[to as PrevcRole]}`);
    } catch (error) {
      ui.displayError('Failed to perform handoff', error as Error);
      process.exit(1);
    }
  });

workflowCommand
  .command('collaborate <topic>')
  .description('Start a collaboration session between roles')
  .option('-r, --repo-path <path>', 'Repository path', process.cwd())
  .option('-p, --participants <roles...>', 'Participating roles')
  .action(async (topic: string, options: any) => {
    try {
      const workflowService = new WorkflowService(options.repoPath, getWorkflowDeps());

      const session = await workflowService.startCollaboration(
        topic,
        options.participants as PrevcRole[]
      );

      ui.displaySuccess(`Collaboration started: ${topic}`);
      ui.displayInfo('Session ID', session.getId());
      ui.displayInfo('Participants', session.getParticipantNames().join(', '));
      console.log('\nUse MCP tools to contribute and synthesize the collaboration.');
    } catch (error) {
      ui.displayError('Failed to start collaboration', error as Error);
      process.exit(1);
    }
  });

workflowCommand
  .command('role <action> <role>')
  .description('Manage role status (start/complete)')
  .option('-r, --repo-path <path>', 'Repository path', process.cwd())
  .option('-o, --outputs <files...>', 'Output files (for complete action)')
  .action(async (action: string, role: string, options: any) => {
    try {
      const workflowService = new WorkflowService(options.repoPath, getWorkflowDeps());

      if (!await workflowService.hasWorkflow()) {
        ui.displayError('No workflow found. Run "workflow init <name>" first.');
        process.exit(1);
      }

      if (action === 'start') {
        await workflowService.startRole(role as PrevcRole);
        ui.displaySuccess(`Started role: ${ROLE_DISPLAY_NAMES[role as PrevcRole]}`);
      } else if (action === 'complete') {
        await workflowService.completeRole(role as PrevcRole, options.outputs || []);
        ui.displaySuccess(`Completed role: ${ROLE_DISPLAY_NAMES[role as PrevcRole]}`);
      } else {
        ui.displayError(`Unknown action: ${action}. Use 'start' or 'complete'.`);
        process.exit(1);
      }
    } catch (error) {
      ui.displayError('Failed to manage role', error as Error);
      process.exit(1);
    }
  });

async function selectLocale(): Promise<void> {
  const locale = await themedSelect<Locale>({
    message: t('prompts.language.select'),
    default: currentLocale,
    choices: SUPPORTED_LOCALES.map(option => ({
      value: option,
      name: t(localeLabelKeys[option])
    }))
  });

  const normalizedLocale = normalizeLocale(locale);
  currentLocale = normalizedLocale;
  translateFn = createTranslator(normalizedLocale);
}

type InteractiveAction = 'syncAgents' | 'update' | 'changeLanguage' | 'exit' | 'quickSync' | 'reverseSync' | 'settings' | 'mcpInstall' | 'viewPending';
type StateAction = 'exit' | 'mcpInstall' | 'reverseSync' | 'settings';

async function runInteractive(): Promise<void> {
  const projectPath = process.cwd();
  const detector = new StateDetector({ projectPath });
  const result = await detector.detect();

  // Detect smart defaults for display
  const defaults = await detectSmartDefaults(projectPath);

  console.log('');
  console.log(renderSplashScreen({
    title: packageNameToDisplayName(PACKAGE_NAME),
    version: VERSION,
    lines: [
      {
        label: t('ui.splash.directoryLabel'),
        value: formatSplashDirectory(projectPath)
      }
    ]
  }));

  // Show what was detected from environment/project
  const detectedParts: string[] = [];
  if (defaults.detectedLanguages.length > 0) {
    const langs = defaults.detectedLanguages.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(', ');
    detectedParts.push(t('status.detected.project', { languages: langs }));
  }
  if (detectedParts.length > 0) {
    console.log(colors.secondaryDim(detectedParts.join(', ')));
  }

  // Show compact status line based on state
  if (result.state === 'new') {
    console.log(colors.secondaryDim(t('status.new')));
  } else if (result.state === 'unfilled') {
    console.log(colors.secondaryDim(t('status.unfilled', { count: result.details.unfilledFiles })));
  } else {
    // Get quick stats only when we have context
    const quickSyncService = new QuickSyncService({
      ui,
      t,
      version: VERSION,
    });
    const stats = await quickSyncService.getStats(projectPath);

    if (result.state === 'outdated') {
      console.log(colors.warning(
        t('status.outdated', { days: result.details.daysBehind || 0 })
      ));
    } else {
      console.log(colors.success(
        t('status.compact', {
          docs: stats.docs,
          agents: stats.agents,
          skills: stats.skills
        })
      ));
    }
  }
  console.log('');

  // Handle state-based flow: auto-detect what to show
  if (result.state === 'new') {
    const action = await themedSelect<StateAction>({
      message: t('prompts.main.action'),
      choices: [
        { name: t('prompts.main.choice.mcpInstall'), value: 'mcpInstall' },
        { name: t('prompts.main.choice.reverseSync'), value: 'reverseSync' },
        { name: t('prompts.main.choice.settings'), value: 'settings' },
        { name: t('prompts.main.choice.exit'), value: 'exit' }
      ]
    });

    if (action === 'mcpInstall') {
      await runMcpInstall();
    } else if (action === 'reverseSync') {
      await runReverseSync();
    } else if (action === 'settings') {
      await runSettings();
    }

    const postOnboardingState = await detector.detect();
    if (postOnboardingState.state !== 'new') {
      await runFullMenu();
    }
    return;
  }

  // For any project that has completed onboarding, always show the full menu.
  await runFullMenu();
}

async function runFullMenu(): Promise<void> {
  let exitRequested = false;
  while (!exitRequested) {
    const detector = new StateDetector({ projectPath: process.cwd() });
    const state = await detector.detect();
    const isUnfilled = state.state === 'unfilled';

    const choices = isUnfilled
      ? [
        { name: t('prompts.main.choice.viewPending'), value: 'viewPending' as InteractiveAction },
        { name: t('prompts.main.choice.mcpInstall'), value: 'mcpInstall' as InteractiveAction },
        new Separator(),
        { name: t('prompts.main.choice.quickSync'), value: 'quickSync' as InteractiveAction },
        { name: t('prompts.main.choice.reverseSync'), value: 'reverseSync' as InteractiveAction },
        { name: t('prompts.main.choice.settings'), value: 'settings' as InteractiveAction },
        { name: t('prompts.main.choice.exit'), value: 'exit' as InteractiveAction }
      ]
      : [
        { name: t('prompts.main.choice.quickSync'), value: 'quickSync' as InteractiveAction },
        { name: t('prompts.main.choice.reverseSync'), value: 'reverseSync' as InteractiveAction },
        { name: t('prompts.main.choice.mcpInstall'), value: 'mcpInstall' as InteractiveAction },
        { name: t('prompts.main.choice.settings'), value: 'settings' as InteractiveAction },
        { name: t('prompts.main.choice.exit'), value: 'exit' as InteractiveAction }
      ];

    const action = await themedSelect<InteractiveAction>({
      message: isUnfilled
        ? t('prompts.main.unfilledPrompt', { count: state.details.unfilledFiles })
        : t('prompts.main.action'),
      choices
    });

    if (action === 'exit') {
      exitRequested = true;
      break;
    }

    if (action === 'viewPending') {
      await displayPendingFiles(state.contextDir);
      continue;
    }

    if (action === 'quickSync') {
      await runQuickSync();
    } else if (action === 'reverseSync') {
      await runReverseSync();
    } else if (action === 'mcpInstall') {
      await runMcpInstall();
    } else if (action === 'settings') {
      await runSettings();
    }
  }

  ui.displaySuccess(t('success.interactive.goodbye'));
}

async function displayPendingFiles(contextDir: string): Promise<void> {
  const { getUnfilledFiles } = await import('./utils/frontMatter');
  const unfilled = await getUnfilledFiles(contextDir);

  console.log();
  console.log(typography.subheader(t('prompts.main.pendingFilesHeader')));
  for (const file of unfilled) {
    const relative = path.relative(contextDir, file);
    console.log(`  ${colors.secondary('•')} ${colors.primary(relative)}`);
  }
  console.log();
}

async function runMcpInstall(): Promise<void> {
  const mcpInstallService = new MCPInstallService({ ui, t, version: VERSION });
  const supportedTools = mcpInstallService.getSupportedTools();
  const detectedTools = await mcpInstallService.detectInstalledTools();
  const mcpChoices = buildMcpToolChoices(supportedTools, detectedTools);

  const { selectedTool } = await inquirer.prompt([{
    type: 'list',
    name: 'selectedTool',
    message: t('commands.mcpInstall.selectTool'),
    choices: mcpChoices,
  }]);

  const mcpResult = await mcpInstallService.run({
    tool: selectedTool,
    global: true,
    dryRun: false,
    verbose: false,
    repoPath: process.cwd(),
  });

  if (mcpResult.installations.length > 0) {
    ui.displayInfo('MCP', t('info.mcp.restartTools'));
  }
}

async function runInteractiveSync(): Promise<void> {
  const defaults = await detectSmartDefaults();
  const defaultSource = path.resolve(defaults.repoPath, '.context/agents');

  // Simplified: single prompt for target selection with common presets
  const { quickTarget } = await inquirer.prompt<{ quickTarget: string }>([
    {
      type: 'list',
      name: 'quickTarget',
      message: t('prompts.sync.quickTarget'),
      choices: [
        { name: t('prompts.sync.quickTarget.common'), value: 'common' },
        { name: t('prompts.sync.quickTarget.claude'), value: 'claude' },
        { name: t('prompts.sync.quickTarget.all'), value: 'all' },
        { name: t('prompts.sync.quickTarget.custom'), value: 'custom' }
      ],
      default: 'common'
    }
  ]);

  let preset: string | undefined;
  let target: string[] | undefined;
  let sourcePath = defaultSource;

  if (quickTarget === 'custom') {
    // Custom path: ask for source and target
    const answers = await inquirer.prompt<{ sourcePath: string; customPath: string }>([
      {
        type: 'input',
        name: 'sourcePath',
        message: t('prompts.sync.source'),
        default: defaultSource
      },
      {
        type: 'input',
        name: 'customPath',
        message: t('prompts.sync.customPath')
      }
    ]);
    sourcePath = answers.sourcePath;
    target = [answers.customPath];
  } else if (quickTarget === 'common') {
    // Common: Claude + GitHub - use explicit target paths instead of preset
    target = [
      path.resolve(defaults.repoPath, '.claude/agents'),
      path.resolve(defaults.repoPath, '.github/agents')
    ];
  } else {
    preset = quickTarget;
  }

  // Show summary
  const summary: ConfigSummary = {
    operation: 'sync',
    repoPath: sourcePath,
    options: {
      Target: quickTarget === 'custom' ? (target?.[0] || 'custom') : quickTarget,
      Mode: 'symlink'
    }
  };

  displayConfigSummary(summary, t);

  try {
    await syncService.run({
      source: sourcePath,
      mode: 'symlink',
      preset: preset as any,
      target,
      force: false,
      dryRun: false
    });
  } catch (error) {
    ui.displayError(t('errors.sync.failed'), error as Error);
  }
}


// ============================================================================
// Quick Sync - Unified sync for agents, skills, and docs
// ============================================================================

async function runQuickSync(): Promise<void> {
  const projectPath = process.cwd();

  // Single prompt: sync all or customize?
  const { syncMode } = await inquirer.prompt<{ syncMode: string }>([
    {
      type: 'list',
      name: 'syncMode',
      message: t('prompts.quickSync.mode'),
      choices: [
        { name: t('prompts.quickSync.mode.syncAll'), value: 'all' },
        { name: t('prompts.quickSync.mode.customize'), value: 'customize' },
        { name: t('prompts.quickSync.mode.cancel'), value: 'cancel' },
      ],
    },
  ]);

  if (syncMode === 'cancel') return;

  let options: QuickSyncOptions;

  if (syncMode === 'all') {
    // Sync all with default targets
    options = {
      skipAgents: false,
      skipSkills: false,
      skipDocs: false,
      agentTargets: ['claude', 'github'],
      skillTargets: ['claude', 'gemini', 'codex'],
      docTargets: ['cursor', 'claude', 'agents'],
      force: false,
      dryRun: false,
      verbose: false,
    };
  } else {
    // Customize: show the existing checkbox prompts
    const { components } = await inquirer.prompt<{ components: string[] }>([
      {
        type: 'checkbox',
        name: 'components',
        message: t('prompts.quickSync.selectComponents'),
        choices: [
          { name: t('prompts.quickSync.components.agents'), value: 'agents', checked: true },
          { name: t('prompts.quickSync.components.skills'), value: 'skills', checked: true },
          { name: t('prompts.quickSync.components.docs'), value: 'docs', checked: true },
        ],
      },
    ]);

    if (components.length === 0) {
      ui.displayWarning(t('prompts.quickSync.noComponentsSelected'));
      return;
    }

    let agentTargets: string[] | undefined;
    let skillTargets: string[] | undefined;
    let docTargets: string[] | undefined;

    if (components.includes('agents')) {
      const { targets } = await inquirer.prompt<{ targets: string[] }>([
        {
          type: 'checkbox',
          name: 'targets',
          message: t('prompts.quickSync.selectAgentTargets'),
          choices: [
            { name: '.claude/agents (Claude Code)', value: 'claude', checked: true },
            { name: '.github/agents (GitHub Copilot)', value: 'github', checked: true },
            { name: '.cursor/agents (Cursor AI)', value: 'cursor', checked: false },
            { name: '.windsurf/agents (Windsurf/Codeium)', value: 'windsurf', checked: false },
            { name: '.cline/agents (Cline)', value: 'cline', checked: false },
            { name: '.continue/agents (Continue.dev)', value: 'continue', checked: false },
          ],
        },
      ]);
      agentTargets = targets.length > 0 ? targets : undefined;
    }

    if (components.includes('skills')) {
      const { targets } = await inquirer.prompt<{ targets: string[] }>([
        {
          type: 'checkbox',
          name: 'targets',
          message: t('prompts.quickSync.selectSkillTargets'),
          choices: [
            { name: '.claude/skills (Claude Code)', value: 'claude', checked: true },
            { name: '.gemini/skills (Gemini CLI)', value: 'gemini', checked: true },
            { name: '.codex/skills (Codex CLI)', value: 'codex', checked: true },
          ],
        },
      ]);
      skillTargets = targets.length > 0 ? targets : undefined;
    }

    if (components.includes('docs')) {
      const { targets } = await inquirer.prompt<{ targets: string[] }>([
        {
          type: 'checkbox',
          name: 'targets',
          message: t('prompts.quickSync.selectDocTargets'),
          choices: [
            { name: '.cursorrules (Cursor AI)', value: 'cursor', checked: true },
            { name: 'CLAUDE.md (Claude Code)', value: 'claude', checked: true },
            { name: 'AGENTS.md (Universal)', value: 'agents', checked: true },
            { name: '.windsurfrules (Windsurf)', value: 'windsurf', checked: false },
            { name: '.clinerules (Cline)', value: 'cline', checked: false },
            { name: 'CONVENTIONS.md (Aider)', value: 'aider', checked: false },
          ],
        },
      ]);
      docTargets = targets.length > 0 ? targets : undefined;
    }

    options = {
      skipAgents: !components.includes('agents'),
      skipSkills: !components.includes('skills'),
      skipDocs: !components.includes('docs'),
      agentTargets,
      skillTargets,
      docTargets,
      force: false,
      dryRun: false,
      verbose: false,
    };
  }

  const quickSyncService = new QuickSyncService({
    ui,
    t,
    version: VERSION,
  });

  await quickSyncService.run(projectPath, options);

  ui.displaySuccess(t('success.quickSync.complete'));
}

// ============================================================================
// Reverse Quick Sync - Import from AI tool directories
// ============================================================================

async function runReverseSync(): Promise<void> {
  const projectPath = process.cwd();

  // Create service
  const reverseSyncService = new ReverseQuickSyncService({
    ui,
    t,
    version: VERSION,
  });

  // Step 1: Detect available tools
  ui.startSpinner(t('prompts.reverseSync.detecting'));
  const detection = await reverseSyncService.detect(projectPath);
  ui.stopSpinner();

  if (detection.summary.totalFiles === 0) {
    ui.displayWarning(t('prompts.reverseSync.noFilesFound'));
    return;
  }

  // Display detection summary
  console.log('');
  console.log(t('prompts.reverseSync.detected'));
  console.log('');
  for (const tool of detection.tools) {
    if (tool.detected) {
      const parts: string[] = [];
      if (tool.counts.rules > 0) parts.push(`${tool.counts.rules} rules`);
      if (tool.counts.agents > 0) parts.push(`${tool.counts.agents} agents`);
      if (tool.counts.skills > 0) parts.push(`${tool.counts.skills} skills`);
      console.log(`  ${colors.success('✓')} ${colors.primary(tool.displayName)} (${parts.join(', ')})`);
    }
  }
  console.log('');

  // Step 2: Select components to import
  const { components } = await inquirer.prompt<{ components: string[] }>([
    {
      type: 'checkbox',
      name: 'components',
      message: t('prompts.reverseSync.selectComponents'),
      choices: [
        {
          name: `Rules (${detection.summary.totalRules} files)`,
          value: 'rules',
          checked: detection.summary.totalRules > 0,
          disabled: detection.summary.totalRules === 0,
        },
        {
          name: `Agents (${detection.summary.totalAgents} files)`,
          value: 'agents',
          checked: detection.summary.totalAgents > 0,
          disabled: detection.summary.totalAgents === 0,
        },
        {
          name: `Skills (${detection.summary.totalSkills} files)`,
          value: 'skills',
          checked: detection.summary.totalSkills > 0,
          disabled: detection.summary.totalSkills === 0,
        },
      ],
    },
  ]);

  if (components.length === 0) {
    ui.displayWarning(t('prompts.reverseSync.noComponentsSelected'));
    return;
  }

  // Step 3: Select merge strategy
  const { mergeStrategy } = await inquirer.prompt<{ mergeStrategy: MergeStrategy }>([
    {
      type: 'list',
      name: 'mergeStrategy',
      message: t('prompts.reverseSync.mergeStrategy'),
      choices: [
        { name: t('prompts.reverseSync.strategy.skip'), value: 'skip' },
        { name: t('prompts.reverseSync.strategy.overwrite'), value: 'overwrite' },
        { name: t('prompts.reverseSync.strategy.merge'), value: 'merge' },
        { name: t('prompts.reverseSync.strategy.rename'), value: 'rename' },
      ],
    },
  ]);

  // Step 4: Run import
  const result = await reverseSyncService.run(projectPath, {
    skipRules: !components.includes('rules'),
    skipAgents: !components.includes('agents'),
    skipSkills: !components.includes('skills'),
    mergeStrategy,
    verbose: false,
  });

  // Display result
  const totalImported = result.rulesImported + result.agentsImported + result.skillsImported;
  if (totalImported > 0) {
    ui.displaySuccess(t('success.reverseSync.complete', { count: totalImported }));
  }
}

// ============================================================================
// Settings - Submenu for configuration
// ============================================================================

async function runSettings(): Promise<void> {
  // Directly show language selection (the only setting currently)
  await selectLocale();
}

async function renderStartupSplash(
  directory: string,
  titleOverride?: string
): Promise<void> {
  console.log('');
  console.log(renderSplashScreen({
    title: titleOverride || packageNameToDisplayName(PACKAGE_NAME),
    version: VERSION,
    lines: [
      {
        label: t('ui.splash.directoryLabel'),
        value: formatSplashDirectory(directory)
      }
    ]
  }));
  console.log('');
}

function filterOutLocaleArgs(args: string[]): string[] {
  const filtered: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === '--lang' || current === '--language' || current === '-l') {
      index += 1;
      continue;
    }
    if (current.startsWith('--lang=') || current.startsWith('--language=')) {
      continue;
    }
    filtered.push(current);
  }
  return filtered;
}

async function main(): Promise<void> {
  const userArgs = process.argv.slice(2);
  void scheduleVersionCheck();
  const meaningfulArgs = filterOutLocaleArgs(userArgs);
  if (meaningfulArgs.length === 0) {
    await runInteractive();
    return;
  }

  await program.parseAsync(process.argv);
}

/**
 * Check if an error is from user interrupt (Ctrl+C)
 */
function isUserInterrupt(error: unknown): boolean {
  if (error instanceof Error) {
    // Inquirer's ExitPromptError when user presses Ctrl+C
    if (error.name === 'ExitPromptError') return true;
    // Check message patterns
    if (error.message.includes('force closed')) return true;
    if (error.message.includes('User force closed')) return true;
  }
  return false;
}

/**
 * Handle graceful exit
 */
function handleGracefulExit(): void {
  console.log('');
  ui.displaySuccess(t('success.interactive.goodbye'));
  process.exit(0);
}

// Handle SIGINT (Ctrl+C) at process level
process.on('SIGINT', () => {
  handleGracefulExit();
});

if (require.main === module) {
  main().catch(error => {
    if (isUserInterrupt(error)) {
      handleGracefulExit();
    } else {
      ui.displayError(t('errors.cli.executionFailed'), error as Error);
      process.exit(1);
    }
  });
}
