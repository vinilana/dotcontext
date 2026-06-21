/**
 * Report Service
 *
 * Generates comprehensive progress reports for PREVC workflows.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import {
  BaseDependencies,
  displayProgressBar,
  createBox,
} from '../../../shared';
import { WorkflowService } from '../../../harness/application/workflow';
import { StackDetector } from '../../../harness/application/context/intelligence/stack';
import {
  PrevcStatus,
  PrevcPhase,
  PHASE_NAMES_EN,
  ROLE_DISPLAY_NAMES_EN,
  getScaleName,
  ProjectScale,
} from '../../../harness/domain/workflow';

export type ReportServiceDependencies = BaseDependencies;

export interface ReportOptions {
  format?: 'markdown' | 'json' | 'console';
  output?: string;
  verbose?: boolean;
  includeStack?: boolean;
  includeDecisions?: boolean;
}

export interface WorkflowReport {
  generated: string;
  project: {
    name: string;
    scale: string;
    description?: string;
  };
  progress: {
    percentage: number;
    completed: number;
    total: number;
    currentPhase: string;
    isComplete: boolean;
  };
  phases: PhaseReport[];
  timeline: TimelineEvent[];
  stack?: StackReport;
  recommendations: string[];
}

interface PhaseReport {
  phase: string;
  name: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  outputs: string[];
  roles: RoleReport[];
}

interface RoleReport {
  role: string;
  name: string;
  status: string;
  outputs: string[];
}

interface TimelineEvent {
  timestamp: string;
  event: string;
  phase?: string;
  role?: string;
}

interface StackReport {
  primaryLanguage: string | null;
  languages: string[];
  frameworks: string[];
  testFrameworks: string[];
}

export class ReportService {
  constructor(private deps: ReportServiceDependencies) {}

  /**
   * Generate a workflow progress report
   */
  async generate(repoPath: string, options: ReportOptions = {}): Promise<WorkflowReport> {
    const absolutePath = path.resolve(repoPath);
    const workflowService = this.createWorkflowService(absolutePath);

    if (!(await workflowService.hasWorkflow())) {
      throw new Error(this.deps.t('errors.report.noWorkflow'));
    }

    const [status, summary, actions] = await Promise.all([
      workflowService.getStatus(),
      workflowService.getSummary(),
      workflowService.getRecommendedActions(),
    ]);

    const report: WorkflowReport = {
      generated: new Date().toISOString(),
      project: {
        name: status.project.name,
        scale: getScaleName(status.project.scale as ProjectScale),
      },
      progress: {
        percentage: summary.progress.percentage,
        completed: summary.progress.completed,
        total: summary.progress.total,
        currentPhase: summary.currentPhase,
        isComplete: summary.isComplete,
      },
      phases: this.buildPhasesReport(status),
      timeline: this.buildTimeline(status),
      recommendations: actions,
    };

    if (options.includeStack) {
      report.stack = await this.detectStack(absolutePath);
    }

    return report;
  }

  /**
   * Output report in requested format
   */
  async output(report: WorkflowReport, options: ReportOptions = {}): Promise<void> {
    const format = options.format || 'console';
    const outputFn = {
      json: () => this.outputJson(report, options),
      markdown: () => this.outputMarkdown(report, options),
      console: () => this.outputConsole(report),
    }[format];

    await outputFn?.();
  }

  /**
   * Create a silent workflow service instance
   */
  private createWorkflowService(repoPath: string): WorkflowService {
    return new WorkflowService(repoPath, {
      ui: {
        displaySuccess: () => {},
        displayError: () => {},
        displayInfo: () => {},
      },
    });
  }

  /**
   * Detect technology stack
   */
  private async detectStack(repoPath: string): Promise<StackReport> {
    const detector = new StackDetector();
    const stack = await detector.detect(repoPath);
    return {
      primaryLanguage: stack.primaryLanguage,
      languages: stack.languages,
      frameworks: stack.frameworks,
      testFrameworks: stack.testFrameworks,
    };
  }

  /**
   * Build phases report from status
   */
  private buildPhasesReport(status: PrevcStatus): PhaseReport[] {
    return Object.entries(status.phases).map(([phase, phaseStatus]) => ({
      phase,
      name: PHASE_NAMES_EN[phase as PrevcPhase] || phase,
      status: phaseStatus.status,
      startedAt: phaseStatus.started_at,
      completedAt: phaseStatus.completed_at,
      outputs: this.mapOutputs(phaseStatus.outputs),
      roles: this.buildRolesForPhase(status, phase),
    }));
  }

  /**
   * Build roles for a specific phase
   */
  private buildRolesForPhase(status: PrevcStatus, phase: string): RoleReport[] {
    return Object.entries(status.roles || {})
      .filter(([, roleStatus]) => roleStatus?.phase === phase)
      .map(([role, roleStatus]) => ({
        role,
        name: ROLE_DISPLAY_NAMES_EN[role as keyof typeof ROLE_DISPLAY_NAMES_EN] || role,
        status: roleStatus?.status || 'pending',
        outputs: roleStatus?.outputs || [],
      }));
  }

  /**
   * Map outputs to string array
   */
  private mapOutputs(outputs?: Array<{ path: string } | string>): string[] {
    return (outputs || []).map(o => (typeof o === 'string' ? o : o.path));
  }

  /**
   * Build timeline from status
   */
  private buildTimeline(status: PrevcStatus): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    // Workflow start
    if (status.project.started) {
      events.push({ timestamp: status.project.started, event: 'Workflow started' });
    }

    // Phase events
    for (const [phase, phaseStatus] of Object.entries(status.phases)) {
      if (phaseStatus.started_at) {
        events.push({ timestamp: phaseStatus.started_at, event: `Phase ${phase} started`, phase });
      }
      if (phaseStatus.completed_at) {
        events.push({ timestamp: phaseStatus.completed_at, event: `Phase ${phase} completed`, phase });
      }
    }

    // Role events
    for (const [role, roleStatus] of Object.entries(status.roles || {})) {
      if (roleStatus?.last_active) {
        events.push({
          timestamp: roleStatus.last_active,
          event: `Role ${role} active`,
          phase: roleStatus.phase,
          role,
        });
      }
    }

    return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Output report as JSON
   */
  private async outputJson(report: WorkflowReport, options: ReportOptions): Promise<void> {
    const json = JSON.stringify(report, null, 2);
    await this.writeOutput(json, options);
  }

  /**
   * Output report as Markdown
   */
  private async outputMarkdown(report: WorkflowReport, options: ReportOptions): Promise<void> {
    const md = this.generateMarkdown(report);
    await this.writeOutput(md, options);
  }

  /**
   * Write output to file or console
   */
  private async writeOutput(content: string, options: ReportOptions): Promise<void> {
    if (options.output) {
      await fs.writeFile(options.output, content, 'utf-8');
      this.deps.ui.displaySuccess(this.deps.t('success.report.saved', { path: options.output }));
    } else {
      console.log(content);
    }
  }

  /**
   * Output report to console with visual dashboard
   */
  private outputConsole(report: WorkflowReport): void {
    console.log('\n' + this.generateVisualDashboard(report) + '\n');
  }

  /**
   * Generate visual dashboard string
   */
  generateVisualDashboard(report: WorkflowReport): string {
    const width = 50;
    const innerWidth = width - 2;

    // Build phase status line
    const phaseDisplay = report.phases
      .map(p => `${this.getStatusIcon(p.status)} ${p.phase}`)
      .join(' → ');

    // Build content lines
    const content = [
      this.centerText(report.project.name, innerWidth),
      this.centerText(`[${report.project.scale}]`, innerWidth),
      '─'.repeat(innerWidth),
      this.centerText(displayProgressBar(report.progress.completed, report.progress.total, { width: innerWidth - 10 }), innerWidth),
      this.centerText(`Progress: ${report.progress.percentage}% (${report.progress.completed}/${report.progress.total} phases)`, innerWidth),
      '─'.repeat(innerWidth),
      this.centerText(phaseDisplay, innerWidth),
    ];

    // Current phase indicator
    if (!report.progress.isComplete) {
      const current = report.phases.find(p => p.status === 'in_progress');
      if (current) {
        content.push(this.centerText(`↑ Current: ${current.name}`, innerWidth));
      }
    }

    // Add phase details
    content.push('─'.repeat(innerWidth));
    for (const phase of report.phases) {
      const icon = this.getStatusLabel(phase.status);
      content.push(this.padText(` ${icon} ${phase.phase}: ${phase.name}`, innerWidth));
      if (phase.outputs.length > 0 && phase.status === 'completed') {
        content.push(this.padText(`    Outputs: ${phase.outputs.length} file(s)`, innerWidth));
      }
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      content.push('─'.repeat(innerWidth));
      content.push(this.padText(' Next Actions:', innerWidth));
      for (const action of report.recommendations.slice(0, 3)) {
        content.push(this.padText(`  - ${action.slice(0, innerWidth - 6)}`, innerWidth));
      }
    }

    const box = createBox(content, { width, title: 'Workflow Dashboard' });
    return report.progress.isComplete ? box + '\n\nWorkflow Complete.' : box;
  }

  private getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      completed: '[x]',
      in_progress: '[>]',
      skipped: '[-]',
      pending: '[ ]',
    };
    return icons[status] || '[ ]';
  }

  private getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      completed: '[done]',
      in_progress: '[...]',
      skipped: '[skip]',
      pending: '[wait]',
    };
    return labels[status] || '[wait]';
  }

  private centerText(text: string, width: number): string {
    const padding = Math.max(0, width - text.length);
    const left = Math.floor(padding / 2);
    return ' '.repeat(left) + text + ' '.repeat(padding - left);
  }

  private padText(text: string, width: number): string {
    return text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length);
  }

  /**
   * Generate Markdown report
   */
  private generateMarkdown(report: WorkflowReport): string {
    const sections = [
      `# Workflow Report: ${report.project.name}`,
      '',
      `> Generated: ${new Date(report.generated).toLocaleString()}`,
      '',
      this.generateSummaryTable(report),
      this.generatePhasesSection(report.phases),
      this.generateTimelineSection(report.timeline),
      report.stack ? this.generateStackSection(report.stack) : '',
      this.generateRecommendationsSection(report.recommendations),
    ];

    return sections.filter(Boolean).join('\n');
  }

  private generateSummaryTable(report: WorkflowReport): string {
    return [
      '## Summary',
      '',
      '| Property | Value |',
      '|----------|-------|',
      `| Scale | ${report.project.scale} |`,
      `| Progress | ${report.progress.percentage}% |`,
      `| Current Phase | ${report.progress.currentPhase} |`,
      `| Status | ${report.progress.isComplete ? 'Complete' : 'In Progress'} |`,
      '',
    ].join('\n');
  }

  private generatePhasesSection(phases: PhaseReport[]): string {
    return [
      '## Phases',
      '',
      ...phases.flatMap(phase => [
        `### ${this.getStatusLabel(phase.status)} ${phase.phase} - ${phase.name}`,
        '',
        `**Status:** ${phase.status}`,
        phase.startedAt ? `**Started:** ${new Date(phase.startedAt).toLocaleString()}` : '',
        phase.completedAt ? `**Completed:** ${new Date(phase.completedAt).toLocaleString()}` : '',
        phase.outputs.length > 0 ? `\n**Outputs:**\n${phase.outputs.map(o => `- ${o}`).join('\n')}` : '',
        '',
      ].filter(Boolean)),
    ].join('\n');
  }

  private generateTimelineSection(timeline: TimelineEvent[]): string {
    if (timeline.length === 0) return '';
    return [
      '## Timeline',
      '',
      ...timeline.map(e => `- **${new Date(e.timestamp).toLocaleString()}**: ${e.event}`),
      '',
    ].join('\n');
  }

  private generateStackSection(stack: StackReport): string {
    return [
      '## Technology Stack',
      '',
      `- **Primary Language:** ${stack.primaryLanguage || 'Unknown'}`,
      `- **Languages:** ${stack.languages.join(', ') || 'None detected'}`,
      `- **Frameworks:** ${stack.frameworks.join(', ') || 'None detected'}`,
      `- **Test Frameworks:** ${stack.testFrameworks.join(', ') || 'None detected'}`,
      '',
    ].join('\n');
  }

  private generateRecommendationsSection(recommendations: string[]): string {
    if (recommendations.length === 0) return '';
    return [
      '## Recommended Actions',
      '',
      ...recommendations.map(a => `- [ ] ${a}`),
      '',
    ].join('\n');
  }
}
