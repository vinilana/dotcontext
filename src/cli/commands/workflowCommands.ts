/**
 * Workflow CLI Commands
 *
 * Extracted from index.ts to reduce monolith size.
 * Registers: workflow init, workflow status, workflow advance,
 *            workflow handoff, workflow collaborate, workflow role
 */

import type { CLIDependencies } from '../types';
import { WorkflowService, type WorkflowServiceDependencies } from '../../services/workflow';
import { getScaleName, PHASE_NAMES_PT, ROLE_DISPLAY_NAMES, type PrevcRole } from '../../workflow';

/**
 * Create workflow service dependencies from CLI dependencies.
 */
function getWorkflowDeps(deps: CLIDependencies): WorkflowServiceDependencies {
    return {
        ui: {
            displaySuccess: (msg: string) => deps.ui.displaySuccess(msg),
            displayError: (msg: string, err?: Error) => deps.ui.displayError(msg, err),
            displayInfo: (title: string, detail?: string) => deps.ui.displayInfo(title, detail || '')
        }
    };
}

/**
 * Register all workflow-related subcommands on the program.
 */
export function registerWorkflowCommands(deps: CLIDependencies): void {
    const { program, ui } = deps;
    const workflowDeps = getWorkflowDeps(deps);

    const workflowCommand = program
        .command('workflow')
        .description('PREVC workflow management (Planning, Review, Execution, Validation, Confirmation)');

    // workflow init
    workflowCommand
        .command('init <name>')
        .description('Initialize a new PREVC workflow')
        .option('-d, --description <text>', 'Project description for scale detection')
        .option('-s, --scale <scale>', 'Project scale: QUICK, SMALL, MEDIUM, LARGE')
        .option('-r, --repo-path <path>', 'Repository path', process.cwd())
        .action(async (name: string, options: Record<string, unknown>) => {
            try {
                const workflowService = new WorkflowService(options.repoPath as string, workflowDeps);
                const status = await workflowService.init({
                    name,
                    description: options.description as string | undefined,
                    scale: options.scale as string | undefined
                });

                ui.displaySuccess(`Workflow PREVC initialized: ${name}`);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ui.displayInfo('Scale', getScaleName(status.project.scale as any));
                ui.displayInfo('Current Phase', `${status.project.current_phase} - ${PHASE_NAMES_PT[status.project.current_phase]}`);
            } catch (error) {
                ui.displayError('Failed to initialize workflow', error as Error);
                process.exit(1);
            }
        });

    // workflow status
    workflowCommand
        .command('status')
        .description('Show current workflow status')
        .option('-r, --repo-path <path>', 'Repository path', process.cwd())
        .action(async (options: { repoPath: string }) => {
            try {
                const workflowService = new WorkflowService(options.repoPath, workflowDeps);

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

    // workflow advance
    workflowCommand
        .command('advance')
        .description('Complete current phase and advance to next')
        .option('-r, --repo-path <path>', 'Repository path', process.cwd())
        .option('-o, --outputs <files...>', 'Output files generated in current phase')
        .action(async (options: { repoPath: string; outputs?: string[] }) => {
            try {
                const workflowService = new WorkflowService(options.repoPath, workflowDeps);

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

    // workflow handoff
    workflowCommand
        .command('handoff <from> <to>')
        .description('Perform handoff between roles')
        .option('-r, --repo-path <path>', 'Repository path', process.cwd())
        .option('-a, --artifacts <files...>', 'Artifacts to hand off')
        .action(async (from: string, to: string, options: { repoPath: string; artifacts?: string[] }) => {
            try {
                const workflowService = new WorkflowService(options.repoPath, workflowDeps);

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

    // workflow collaborate
    workflowCommand
        .command('collaborate <topic>')
        .description('Start a collaboration session between roles')
        .option('-r, --repo-path <path>', 'Repository path', process.cwd())
        .option('-p, --participants <roles...>', 'Participating roles')
        .action(async (topic: string, options: { repoPath: string; participants?: string[] }) => {
            try {
                const workflowService = new WorkflowService(options.repoPath, workflowDeps);

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

    // workflow role
    workflowCommand
        .command('role <action> <role>')
        .description('Manage role status (start/complete)')
        .option('-r, --repo-path <path>', 'Repository path', process.cwd())
        .option('-o, --outputs <files...>', 'Output files (for complete action)')
        .action(async (action: string, role: string, options: { repoPath: string; outputs?: string[] }) => {
            try {
                const workflowService = new WorkflowService(options.repoPath, workflowDeps);

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
}
