/**
 * Skill CLI Commands
 *
 * Extracted from index.ts to reduce monolith size.
 * Registers: skill init, skill fill, skill list, skill export, skill create
 */

import type { CLIDependencies } from '../types';

/**
 * Register all skill-related subcommands on the program.
 */
export function registerSkillCommands(deps: CLIDependencies): void {
    const { program, ui, t, version, defaultModel } = deps;

    const skillCommand = program
        .command('skill')
        .description(t('commands.skill.description'));

    // skill init
    skillCommand
        .command('init')
        .description(t('commands.skill.init.description'))
        .argument('[repo-path]', 'Repository path', process.cwd())
        .option('-f, --force', 'Overwrite existing files')
        .option('--skills <skills...>', 'Specific skills to scaffold')
        .action(async (repoPath: string, options: { skills?: string[]; force?: boolean }) => {
            try {
                const { createSkillGenerator } = await import('../../generators/skills');
                const generator = createSkillGenerator({ repoPath });
                const result = await generator.generate({
                    skills: options.skills,
                    force: options.force,
                });

                ui.displaySuccess(`Skills initialized in ${result.skillsDir}`);
                ui.displayInfo('Generated', result.generatedSkills.join(', ') || 'none');
                if (result.skippedSkills.length > 0) {
                    ui.displayInfo('Skipped (already exist)', result.skippedSkills.join(', '));
                }
            } catch (error) {
                ui.displayError('Failed to initialize skills', error as Error);
                process.exit(1);
            }
        });

    // skill fill
    skillCommand
        .command('fill')
        .description(t('commands.skill.fill.description'))
        .argument('[repo-path]', 'Repository path', process.cwd())
        .option('-o, --output <dir>', 'Output directory', '.context')
        .option('-f, --force', 'Overwrite existing content')
        .option('--skills <skills...>', 'Specific skills to fill')
        .option('--model <model>', 'LLM model to use')
        .option('--provider <provider>', 'LLM provider (anthropic, openai, google, openrouter)')
        .option('--api-key <key>', 'API key for LLM provider')
        .option('--base-url <url>', 'Base URL for custom LLM endpoint')
        .option('--no-semantic', 'Disable semantic context mode')
        .option('--use-lsp', 'Enable LSP for deeper analysis')
        .option('-v, --verbose', 'Show detailed progress')
        .option('--limit <number>', 'Limit number of skills to fill', parseInt)
        .action(async (repoPath: string, options: Record<string, unknown>) => {
            try {
                const { SkillFillService } = await import('../../services/fill/skillFillService');

                const skillFillService = new SkillFillService({
                    ui,
                    t,
                    version,
                    defaultModel,
                });

                const result = await skillFillService.run(repoPath, {
                    output: options.output as string | undefined,
                    skills: options.skills as string[] | undefined,
                    force: options.force as boolean | undefined,
                    model: options.model as string | undefined,
                    provider: options.provider as any,
                    apiKey: options.apiKey as string | undefined,
                    baseUrl: options.baseUrl as string | undefined,
                    semantic: options.semantic as boolean | undefined,
                    useLsp: options.useLsp as boolean | undefined,
                    verbose: options.verbose as boolean | undefined,
                    limit: options.limit as number | undefined,
                });

                if (result.filled.length > 0) {
                    ui.displaySuccess(t('success.skill.filled', { count: result.filled.length }));
                }
            } catch (error) {
                ui.displayError(t('errors.skill.fillFailed'), error as Error);
                process.exit(1);
            }
        });

    // skill list
    skillCommand
        .command('list')
        .description(t('commands.skill.list.description'))
        .argument('[repo-path]', 'Repository path', process.cwd())
        .option('--json', 'Output as JSON')
        .action(async (repoPath: string, options: { json?: boolean }) => {
            try {
                const { createSkillRegistry } = await import('../../workflow/skills');
                const registry = createSkillRegistry(repoPath);
                const discovered = await registry.discoverAll();

                if (options.json) {
                    console.log(JSON.stringify({
                        builtIn: discovered.builtIn.map((s: { slug: string }) => s.slug),
                        custom: discovered.custom.map((s: { slug: string }) => s.slug),
                        total: discovered.all.length,
                    }, null, 2));
                    return;
                }

                console.log('\nBuilt-in Skills:');
                for (const skill of discovered.builtIn) {
                    const scaffolded = discovered.all.find(
                        (s: { slug: string; path: string }) => s.slug === skill.slug && s.path.includes('.context')
                    );
                    const status = scaffolded ? '[scaffolded]' : '[available]';
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

    // skill export
    skillCommand
        .command('export')
        .description(t('commands.skill.export.description'))
        .argument('[repo-path]', 'Repository path', process.cwd())
        .option('-p, --preset <preset>', 'Export preset: claude, gemini, codex, all', 'all')
        .option('-f, --force', 'Overwrite existing files')
        .option('--include-builtin', 'Include built-in skills even if not scaffolded')
        .option('--dry-run', 'Preview changes without writing')
        .action(async (repoPath: string, options: Record<string, unknown>) => {
            try {
                const { SkillExportService } = await import('../../services/export/skillExportService');
                const exportService = new SkillExportService({
                    ui,
                    t,
                    version,
                });

                const result = await exportService.run(repoPath, {
                    preset: options.preset as string,
                    force: options.force as boolean | undefined,
                    includeBuiltIn: options.includeBuiltin as boolean | undefined,
                    dryRun: options.dryRun as boolean | undefined,
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

    // skill create
    skillCommand
        .command('create <name>')
        .description(t('commands.skill.create.description'))
        .argument('[repo-path]', 'Repository path', process.cwd())
        .option('-d, --description <text>', 'Skill description')
        .option('--phases <phases...>', 'PREVC phases (P, R, E, V, C)')
        .option('-f, --force', 'Overwrite if exists')
        .action(async (name: string, repoPath: string, options: Record<string, unknown>) => {
            try {
                const { createSkillGenerator } = await import('../../generators/skills');
                const generator = createSkillGenerator({ repoPath });
                const skillPath = await generator.generateCustomSkill({
                    name,
                    description: (options.description as string) || `TODO: Describe when to use ${name}`,
                    phases: options.phases as any,
                    force: options.force as boolean | undefined,
                });

                ui.displaySuccess(`Created skill: ${name}`);
                ui.displayInfo('Path', skillPath);
            } catch (error) {
                ui.displayError('Failed to create skill', error as Error);
                process.exit(1);
            }
        });
}
