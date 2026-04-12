import { parseScaffoldFrontMatter } from '../../utils/frontMatter';
import { PrevcPhase } from '../types';
import {
  PLAN_PHASE_TO_PREVC,
  LinkedPlan,
  PlanDecision,
  PlanPhase,
  PlanReference,
  PlanStep,
} from './types';

export class PlanLinkerParser {
  parsePlanFile(content: string, slug: string): { title: string; summary?: string } {
    const titleMatch = content.match(/^#\s+(.+?)(?:\s+Plan)?$/m);
    const summaryMatch = content.match(/^>\s*(.+)$/m);

    return {
      title: titleMatch?.[1] || slug,
      summary: summaryMatch?.[1],
    };
  }

  parsePlanToLinked(content: string, ref: PlanReference): LinkedPlan {
    const scaffoldFrontMatter = parseScaffoldFrontMatter(content).frontMatter;
    const hasCanonicalPlanFrontMatter = scaffoldFrontMatter?.type === 'plan' && !!scaffoldFrontMatter.planSlug;
    const legacyFrontMatter = hasCanonicalPlanFrontMatter ? null : this.parseLegacyPlanFrontMatter(content);

    const bodyPhases = this.extractPhasesFromBody(content);
    const phases = hasCanonicalPlanFrontMatter
      ? this.buildPhasesFromCanonicalFrontMatter(scaffoldFrontMatter!, bodyPhases)
      : legacyFrontMatter?.phases.length
        ? legacyFrontMatter.phases.map(p => ({
            id: p.id,
            name: p.name,
            prevcPhase: p.prevc as PrevcPhase,
            steps: bodyPhases.find(phase => phase.id === p.id)?.steps ?? [],
            deliverables: bodyPhases.find(phase => phase.id === p.id)?.deliverables,
            status: 'pending' as const,
          }))
        : bodyPhases;

    const agents = hasCanonicalPlanFrontMatter && scaffoldFrontMatter?.agents?.length
      ? scaffoldFrontMatter.agents.map(a => a.type)
      : legacyFrontMatter?.agents.length
        ? legacyFrontMatter.agents.map(a => a.type)
        : this.extractAgentsFromBody(content);

    const docs = hasCanonicalPlanFrontMatter && scaffoldFrontMatter?.docs?.length
      ? scaffoldFrontMatter.docs
      : legacyFrontMatter?.docs.length
        ? legacyFrontMatter.docs
        : this.extractDocsFromBody(content);

    const decisions = this.extractDecisions();

    return {
      ref,
      phases,
      decisions,
      risks: [],
      agents,
      docs,
      progress: 0,
      currentPhase: undefined,
      agentLineup: hasCanonicalPlanFrontMatter && scaffoldFrontMatter?.agents?.length
        ? scaffoldFrontMatter.agents.map(agent => ({
            type: agent.type,
            role: agent.role || undefined,
          }))
        : legacyFrontMatter?.agents.length
          ? legacyFrontMatter.agents
          : agents.map(a => ({ type: a })),
    };
  }

  private parseLegacyPlanFrontMatter(content: string): {
    agents: Array<{ type: string; role?: string }>;
    docs: string[];
    phases: Array<{ id: string; name: string; prevc: string }>;
  } | null {
    if (!content.startsWith('---')) {
      return null;
    }

    const endIndex = content.indexOf('---', 3);
    if (endIndex === -1) {
      return null;
    }

    const frontMatterContent = content.slice(3, endIndex).trim();
    const result: {
      agents: Array<{ type: string; role?: string }>;
      docs: string[];
      phases: Array<{ id: string; name: string; prevc: string }>;
    } = {
      agents: [],
      docs: [],
      phases: [],
    };

    const agentsMatch = frontMatterContent.match(/agents:\s*\n((?:\s+-[^\n]+\n?)+)/);
    if (agentsMatch) {
      const agentLines = agentsMatch[1].split('\n').filter(l => l.trim());
      let currentAgent: { type: string; role?: string } | null = null;

      for (const line of agentLines) {
        const typeMatch = line.match(/type:\s*"([^"]+)"/);
        const roleMatch = line.match(/role:\s*"([^"]+)"/);

        if (typeMatch) {
          if (currentAgent) {
            result.agents.push(currentAgent);
          }
          currentAgent = { type: typeMatch[1] };
        }
        if (roleMatch && currentAgent) {
          currentAgent.role = roleMatch[1];
        }
      }
      if (currentAgent) {
        result.agents.push(currentAgent);
      }
    }

    const docsMatch = frontMatterContent.match(/docs:\s*\n((?:\s+-[^\n]+\n?)+)/);
    if (docsMatch) {
      const docLines = docsMatch[1].split('\n').filter(l => l.trim());
      for (const line of docLines) {
        const docMatch = line.match(/-\s*"([^"]+)"/);
        if (docMatch) {
          result.docs.push(docMatch[1]);
        }
      }
    }

    const phasesMatch = frontMatterContent.match(/phases:\s*\n((?:\s+-[^\n]+\n?)+)/);
    if (phasesMatch) {
      const phaseLines = phasesMatch[1].split('\n').filter(l => l.trim());
      let currentPhase: { id: string; name: string; prevc: string } | null = null;

      for (const line of phaseLines) {
        const idMatch = line.match(/id:\s*"([^"]+)"/);
        const nameMatch = line.match(/name:\s*"([^"]+)"/);
        const prevcMatch = line.match(/prevc:\s*"([^"]+)"/);

        if (idMatch) {
          if (currentPhase && currentPhase.id && currentPhase.name && currentPhase.prevc) {
            result.phases.push(currentPhase);
          }
          currentPhase = { id: idMatch[1], name: '', prevc: '' };
        }
        if (nameMatch && currentPhase) {
          currentPhase.name = nameMatch[1];
        }
        if (prevcMatch && currentPhase) {
          currentPhase.prevc = prevcMatch[1];
        }
      }
      if (currentPhase && currentPhase.id && currentPhase.name && currentPhase.prevc) {
        result.phases.push(currentPhase);
      }
    }

    return result;
  }

  private extractPhasesFromBody(content: string): PlanPhase[] {
    const lines = content.split('\n');
    const phaseHeaders: Array<{ lineIndex: number; id: string; name: string; prevcPhase: PrevcPhase }> = [];

    lines.forEach((line, lineIndex) => {
      const phaseMatch = line.match(/^###\s+Phase\s+(\d+)\s*[—-]\s*(.+)$/);
      if (!phaseMatch) {
        return;
      }

      const phaseNum = phaseMatch[1];
      const phaseName = phaseMatch[2].trim();
      const phaseId = `phase-${phaseNum}`;
      phaseHeaders.push({
        lineIndex,
        id: phaseId,
        name: phaseName,
        prevcPhase: this.inferPrevcPhaseFromPhaseName(phaseName),
      });
    });

    if (phaseHeaders.length === 0) {
      return [
        { id: 'phase-1', name: 'Discovery & Alignment', prevcPhase: 'P', deliverables: [], steps: [], status: 'pending' },
        { id: 'phase-2', name: 'Implementation', prevcPhase: 'E', deliverables: [], steps: [], status: 'pending' },
        { id: 'phase-3', name: 'Validation & Handoff', prevcPhase: 'V', deliverables: [], steps: [], status: 'pending' },
      ];
    }

    return phaseHeaders.map((phaseHeader, index) => {
      const nextHeader = phaseHeaders[index + 1];
      const sectionLines = lines.slice(phaseHeader.lineIndex + 1, nextHeader?.lineIndex ?? lines.length);
      const steps = this.extractPlanStepsFromBodySection(sectionLines);
      const deliverables = this.uniqueStrings(
        steps.flatMap(step => [...(step.deliverables ?? []), ...(step.outputs ?? [])])
      );

      return {
        id: phaseHeader.id,
        name: phaseHeader.name,
        prevcPhase: phaseHeader.prevcPhase,
        deliverables: deliverables.length > 0 ? deliverables : undefined,
        steps,
        status: 'pending',
      };
    });
  }

  private buildPhasesFromCanonicalFrontMatter(
    frontMatter: NonNullable<ReturnType<typeof parseScaffoldFrontMatter>['frontMatter']>,
    bodyPhases: PlanPhase[]
  ): PlanPhase[] {
    const bodyPhaseMap = new Map(bodyPhases.map(phase => [phase.id, phase]));

    const phases = frontMatter.planPhases?.length
      ? frontMatter.planPhases.map((phase) => {
          const fallbackPhase = bodyPhaseMap.get(phase.id);
          const canonicalSteps = phase.steps ?? [];
          const hasCanonicalSteps = canonicalSteps.length > 0;
          const steps = hasCanonicalSteps
            ? canonicalSteps.map((step) => this.toPlanStep(step.order, step.description, step.assignee, step.deliverables))
            : fallbackPhase?.steps ?? [];
          const deliverables = this.uniqueStrings([
            ...(phase.deliverables ?? []),
            ...(hasCanonicalSteps ? [] : (fallbackPhase?.deliverables ?? [])),
            ...steps.flatMap(step => [...(step.deliverables ?? []), ...(step.outputs ?? [])]),
          ]);

          return {
            id: phase.id,
            name: phase.name,
            prevcPhase: phase.prevc as PrevcPhase,
            summary: phase.summary,
            deliverables: deliverables.length > 0 ? deliverables : undefined,
            steps,
            status: 'pending' as const,
          };
        })
      : bodyPhases;

    return phases.length > 0 ? phases : bodyPhases;
  }

  private toPlanStep(
    order: number,
    description: string,
    assignee?: string,
    deliverables?: string[]
  ): PlanStep {
    const normalizedDeliverables = this.uniqueStrings(deliverables ?? []);

    return {
      order,
      description,
      assignee,
      deliverables: normalizedDeliverables.length > 0 ? normalizedDeliverables : undefined,
      outputs: normalizedDeliverables.length > 0 ? normalizedDeliverables : undefined,
      status: 'pending',
    };
  }

  private extractPlanStepsFromBodySection(sectionLines: string[]): PlanStep[] {
    const tableSteps = this.extractPlanStepsFromTable(sectionLines);
    if (tableSteps.length > 0) {
      return tableSteps;
    }

    const numberedSteps = this.extractNumberedPlanSteps(sectionLines);
    if (numberedSteps.length > 0) {
      return numberedSteps;
    }

    return [];
  }

  private extractPlanStepsFromTable(sectionLines: string[]): PlanStep[] {
    const rows = sectionLines
      .map(line => this.parseMarkdownTableRow(line))
      .filter((row): row is string[] => row !== null);

    if (rows.length === 0) {
      return [];
    }

    let header: string[] | null = null;
    const steps: PlanStep[] = [];
    let nextOrder = 1;

    for (const row of rows) {
      if (this.isTableSeparatorRow(row)) {
        continue;
      }

      if (!header) {
        if (this.looksLikeTaskTableHeader(row)) {
          header = row;
        }
        continue;
      }

      const columnMap = this.buildColumnMap(header);
      const description = this.readTableColumn(row, columnMap, ['task', 'description', 'step']) ?? row[1] ?? row[0] ?? '';
      const assignee = this.stripMarkdownInline(this.readTableColumn(row, columnMap, ['agent', 'assignee', 'owner']));
      const deliverables = this.parseDeliverableCell(this.readTableColumn(row, columnMap, ['deliverable', 'deliverables', 'output', 'outputs']));

      steps.push(this.toPlanStep(nextOrder++, this.stripMarkdownInline(description), assignee || undefined, deliverables));
    }

    return steps;
  }

  private extractNumberedPlanSteps(sectionLines: string[]): PlanStep[] {
    const steps: PlanStep[] = [];
    let nextOrder = 1;

    for (const line of sectionLines) {
      const match = line.match(/^\s*(\d+)\.\s*(?:\[[ x]\]\s*)?(.+)$/);
      if (!match) {
        continue;
      }

      steps.push(this.toPlanStep(nextOrder++, this.stripMarkdownInline(match[2].trim())));
    }

    return steps;
  }

  private parseMarkdownTableRow(line: string): string[] | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      return null;
    }

    const cells = trimmed
      .slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split('|')
      .map(cell => cell.trim());

    if (cells.length === 0) {
      return null;
    }

    return cells;
  }

  private isTableSeparatorRow(row: string[]): boolean {
    return row.every(cell => /^:?-{3,}:?$/.test(cell));
  }

  private looksLikeTaskTableHeader(row: string[]): boolean {
    const lowered = row.map(cell => cell.toLowerCase());
    return lowered.some(cell => cell === '#' || cell.includes('task')) && lowered.some(cell => cell.includes('deliverable') || cell.includes('output'));
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

  private readTableColumn(row: string[], columnMap: Record<string, number>, names: string[]): string | undefined {
    for (const name of names) {
      const index = columnMap[name.replace(/[^a-z0-9]+/g, '')];
      if (typeof index === 'number' && row[index] !== undefined) {
        return row[index];
      }
    }
    return undefined;
  }

  private parseDeliverableCell(value?: string): string[] | undefined {
    if (!value) {
      return undefined;
    }

    const normalized = this.stripMarkdownInline(value);
    const parts = normalized
      .split(/(?:<br\s*\/?>|\n|;)/i)
      .map(part => part.trim())
      .filter(Boolean);

    const unique = this.uniqueStrings(parts.length > 0 ? parts : [normalized]);
    return unique.length > 0 ? unique : undefined;
  }

  private stripMarkdownInline(value?: string): string {
    if (!value) {
      return '';
    }

    return value
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .trim();
  }

  private uniqueStrings(values: string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
  }

  private inferPrevcPhaseFromPhaseName(phaseName: string): PrevcPhase {
    const lowerName = phaseName.toLowerCase();

    for (const [keyword, phase] of Object.entries(PLAN_PHASE_TO_PREVC)) {
      if (lowerName.includes(keyword)) {
        return phase;
      }
    }

    return 'E';
  }

  private extractDecisions(): PlanDecision[] {
    return [];
  }

  private extractAgentsFromBody(content: string): string[] {
    const agents: string[] = [];
    const agentRegex = /\[([^\]]+)\]\(\.\.\/agents\/([^)]+)\.md\)/g;
    let match;

    while ((match = agentRegex.exec(content)) !== null) {
      const agentType = match[2];
      if (!agents.includes(agentType)) {
        agents.push(agentType);
      }
    }

    return agents;
  }

  private extractDocsFromBody(content: string): string[] {
    const docs: string[] = [];
    const docRegex = /\[([^\]]+)\]\(\.\.\/docs\/([^)]+)\)/g;
    let match;

    while ((match = docRegex.exec(content)) !== null) {
      const docPath = match[2];
      if (!docs.includes(docPath)) {
        docs.push(docPath);
      }
    }

    return docs;
  }
}
