import { PlanExecutionTracking } from './types';

export class PlanMarkdownProjector {
  project(content: string, tracking: PlanExecutionTracking): string {
    let nextContent = this.updateFrontmatterProgress(content, tracking);
    nextContent = this.updateTaskTables(nextContent, tracking);
    nextContent = this.updateStepCheckboxes(nextContent, tracking);
    nextContent = this.updateExecutionHistorySection(nextContent, tracking);
    return nextContent;
  }

  private updateFrontmatterProgress(content: string, tracking: PlanExecutionTracking): string {
    if (!content.startsWith('---')) {
      return content;
    }

    const endIndex = content.indexOf('---', 3);
    if (endIndex === -1) {
      return content;
    }

    let frontmatter = content.slice(0, endIndex);
    const body = content.slice(endIndex);

    if (frontmatter.includes('progress:')) {
      frontmatter = frontmatter.replace(/progress:\s*\d+/, `progress: ${tracking.progress}`);
    } else {
      if (frontmatter.includes('status:')) {
        frontmatter = frontmatter.replace(/(status:\s*\w+)/, `$1\nprogress: ${tracking.progress}`);
      } else {
        frontmatter = frontmatter.trimEnd() + `\nprogress: ${tracking.progress}\n`;
      }
    }

    if (frontmatter.includes('lastUpdated:')) {
      frontmatter = frontmatter.replace(/lastUpdated:\s*"[^"]*"/, `lastUpdated: "${tracking.lastUpdated}"`);
    } else {
      frontmatter = frontmatter.trimEnd() + `\nlastUpdated: "${tracking.lastUpdated}"\n`;
    }

    return frontmatter + body;
  }

  private updateStepCheckboxes(content: string, tracking: PlanExecutionTracking): string {
    const lines = content.split('\n');
    const updatedLines: string[] = [];
    let currentPhaseId: string | null = null;

    for (const line of lines) {
      const phaseMatch = line.match(/^###\s+Phase\s+(\d+)/);
      if (phaseMatch) {
        currentPhaseId = `phase-${phaseMatch[1]}`;
        updatedLines.push(line);
        continue;
      }

      const stepMatch = line.match(/^(\d+)\.\s*(?:\[[ x]\]\s*)?(.+?)(?:\s*\*\([^)]*\)\*)?$/);
      if (stepMatch && currentPhaseId) {
        const stepNum = parseInt(stepMatch[1], 10);
        const stepText = stepMatch[2].trim();

        const phaseTracking = tracking.phases[currentPhaseId];
        const stepTracking = phaseTracking?.steps.find(s => s.stepIndex === stepNum);

        if (stepTracking) {
          const checkMark = stepTracking.status === 'completed' ? '[x]' : '[ ]';
          let timestamp = '';
          if (stepTracking.completedAt) {
            timestamp = ` *(completed: ${stepTracking.completedAt})*`;
          } else if (stepTracking.startedAt && stepTracking.status === 'in_progress') {
            timestamp = ` *(in progress since: ${stepTracking.startedAt})*`;
          }
          updatedLines.push(`${stepNum}. ${checkMark} ${stepText}${timestamp}`);
          continue;
        }
      }

      updatedLines.push(line);
    }

    return updatedLines.join('\n');
  }

  private updateTaskTables(content: string, tracking: PlanExecutionTracking): string {
    const lines = content.split('\n');
    const updatedLines: string[] = [];
    let currentPhaseId: string | null = null;
    let currentTableColumnMap: Record<string, number> | null = null;

    for (const line of lines) {
      const phaseMatch = line.match(/^###\s+Phase\s+(\d+)/);
      if (phaseMatch) {
        currentPhaseId = `phase-${phaseMatch[1]}`;
        currentTableColumnMap = null;
        updatedLines.push(line);
        continue;
      }

      const tableCells = this.parseMarkdownTableRow(line);
      if (!tableCells || !currentPhaseId) {
        updatedLines.push(line);
        continue;
      }

      if (this.isTableSeparatorRow(tableCells)) {
        updatedLines.push(line);
        continue;
      }

      if (this.looksLikeTaskTableHeader(tableCells)) {
        currentTableColumnMap = this.buildColumnMap(tableCells);
        updatedLines.push(line);
        continue;
      }

      if (!currentTableColumnMap) {
        updatedLines.push(line);
        continue;
      }

      const stepIndex = this.parseTableStepIndex(tableCells[0]);
      if (stepIndex === null) {
        updatedLines.push(line);
        continue;
      }

      const phaseTracking = tracking.phases[currentPhaseId];
      const stepTracking = phaseTracking?.steps.find((step) => step.stepIndex === stepIndex);
      if (!stepTracking) {
        updatedLines.push(line);
        continue;
      }

      const nextCells = [...tableCells];
      const statusColumnIndex = currentTableColumnMap.status;
      if (typeof statusColumnIndex === 'number') {
        nextCells[statusColumnIndex] = stepTracking.status;
      }

      const deliverableIndex = currentTableColumnMap.deliverable ?? currentTableColumnMap.deliverables ?? currentTableColumnMap.output ?? currentTableColumnMap.outputs;
      if (typeof deliverableIndex === 'number') {
        const deliverables = this.uniqueStrings([
          ...(stepTracking.deliverables ?? []),
          ...(stepTracking.output ? [stepTracking.output] : []),
        ]);
        if (deliverables.length > 0) {
          nextCells[deliverableIndex] = deliverables.join(', ');
        }
      }

      updatedLines.push(this.renderMarkdownTableRow(nextCells));
    }

    return updatedLines.join('\n');
  }

  private parseMarkdownTableRow(line: string): string[] | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      return null;
    }

    return trimmed
      .slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((cell) => cell.trim());
  }

  private renderMarkdownTableRow(cells: string[]): string {
    return `| ${cells.join(' | ')} |`;
  }

  private isTableSeparatorRow(row: string[]): boolean {
    return row.every((cell) => /^:?-{3,}:?$/.test(cell));
  }

  private looksLikeTaskTableHeader(row: string[]): boolean {
    const lowered = row.map((cell) => cell.toLowerCase());
    return lowered.some((cell) => cell === '#' || cell.includes('task')) &&
      lowered.some((cell) => cell.includes('status')) &&
      lowered.some((cell) => cell.includes('deliverable') || cell.includes('output'));
  }

  private buildColumnMap(header: string[]): Record<string, number> {
    const map: Record<string, number> = {};
    header.forEach((cell, index) => {
      const normalized = cell.toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (normalized) {
        map[normalized] = index;
      }
    });
    return map;
  }

  private parseTableStepIndex(value: string): number | null {
    const normalized = value.trim();
    const match = normalized.match(/^(\d+)(?:\.(\d+))?$/);
    if (!match) {
      return null;
    }

    return typeof match[2] === 'string' ? Number(match[2]) : Number(match[1]);
  }

  private uniqueStrings(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private updateExecutionHistorySection(content: string, tracking: PlanExecutionTracking): string {
    const historySection = this.generateExecutionHistoryMarkdown(tracking);
    const historyMarker = '## Execution History';
    const existingIndex = content.indexOf(historyMarker);

    if (existingIndex > -1) {
      const afterHistory = content.slice(existingIndex);
      const nextSectionMatch = afterHistory.match(/\n##\s+/);
      if (nextSectionMatch && typeof nextSectionMatch.index === 'number') {
        const endIndex = existingIndex + nextSectionMatch.index;
        return content.slice(0, existingIndex) + historySection + content.slice(endIndex);
      }

      return content.slice(0, existingIndex) + historySection;
    }

    const insertPoints = ['## Evidence', '## Rollback'];
    let insertIndex = -1;

    for (const marker of insertPoints) {
      const idx = content.indexOf(marker);
      if (idx > -1) {
        insertIndex = idx;
        break;
      }
    }

    if (insertIndex > -1) {
      return content.slice(0, insertIndex) + historySection + '\n\n' + content.slice(insertIndex);
    }

    return content.trimEnd() + '\n\n' + historySection;
  }

  private generateExecutionHistoryMarkdown(tracking: PlanExecutionTracking): string {
    const lines = [
      '## Execution History',
      '',
      `> Last updated: ${tracking.lastUpdated} | Progress: ${tracking.progress}%`,
      '',
    ];

    const sortedPhases = Object.entries(tracking.phases).sort(([a], [b]) => a.localeCompare(b));

    for (const [phaseId, phase] of sortedPhases) {
      const statusIcon = phase.status === 'completed' ? '[DONE]' :
                         phase.status === 'in_progress' ? '[IN PROGRESS]' :
                         phase.status === 'skipped' ? '[SKIPPED]' :
                         '[PENDING]';

      lines.push(`### ${phaseId} ${statusIcon}`);

      if (phase.startedAt) {
        lines.push(`- Started: ${phase.startedAt}`);
      }
      if (phase.completedAt) {
        lines.push(`- Completed: ${phase.completedAt}`);
      }

      if (phase.steps.length > 0) {
        lines.push('');
        const sortedSteps = [...phase.steps].sort((a, b) => a.stepIndex - b.stepIndex);
        for (const step of sortedSteps) {
          const check = step.status === 'completed' ? 'x' : ' ';
          let line = `- [${check}] Step ${step.stepIndex}: ${step.description}`;

          if (step.completedAt) {
            line += ` *(${step.completedAt})*`;
          } else if (step.startedAt && step.status === 'in_progress') {
            line += ` *(in progress)*`;
          }

          lines.push(line);

          if (step.output) {
            lines.push(`  - Output: ${step.output}`);
          }
          if (step.notes) {
            lines.push(`  - Notes: ${step.notes}`);
          }
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

}
