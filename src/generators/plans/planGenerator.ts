import * as path from 'path';
import * as fs from 'fs-extra';

import { GeneratorUtils } from '../shared';
import { AgentType, AGENT_TYPES } from '../agents/agentTypes';
import { AGENT_RESPONSIBILITIES } from '../agents/agentConfig';
import { getGuidesByKeys } from '../documentation/guideRegistry';
import { renderPlanTemplate } from './templates/planTemplate';
import { renderPlanIndex } from './templates/indexTemplate';
import { PlanAgentSummary, PlanIndexEntry, CodebaseSnapshot } from './templates/types';
import { CodebaseAnalyzer, SemanticContext } from '../../services/semantic';
import {
  suggestPhaseRequirements,
  type PhaseRequirementSuggestions,
} from '../../workflow/plans/scaffoldSuggestions';

interface PlanGeneratorOptions {
  planName: string;
  outputDir: string;
  title?: string;
  summary?: string;
  selectedAgentTypes?: string[] | null;
  selectedDocKeys?: string[] | null;
  force?: boolean;
  verbose?: boolean;
  semantic?: boolean;
  projectPath?: string;
}

interface PlanGenerationResult {
  planPath: string;
  relativePath: string;
  slug: string;
}

export class PlanGenerator {
  private analyzer?: CodebaseAnalyzer;

  async generatePlan(options: PlanGeneratorOptions): Promise<PlanGenerationResult> {
    const {
      planName,
      outputDir,
      title,
      summary,
      selectedAgentTypes,
      selectedDocKeys,
      force = false,
      verbose = false,
      semantic = false,
      projectPath
    } = options;

    const slug = GeneratorUtils.slugify(planName);
    if (!slug) {
      throw new Error('Plan name must contain at least one alphanumeric character.');
    }

    const planTitle = title?.trim() || GeneratorUtils.formatTitle(slug);
    const resolvedOutput = path.resolve(outputDir);
    const plansDir = path.join(resolvedOutput, 'plans');

    await fs.ensureDir(resolvedOutput);
    await GeneratorUtils.ensureDirectoryAndLog(plansDir, verbose, 'Ensuring plans directory');

    const planFileName = `${slug}.md`;
    const planPath = path.join(plansDir, planFileName);

    if (!force && await fs.pathExists(planPath)) {
      throw new Error(`Plan already exists at ${planPath}. Use --force to overwrite.`);
    }

    // Perform semantic analysis if enabled
    let semantics: SemanticContext | undefined;
    let codebaseSnapshot: CodebaseSnapshot | undefined;

    if (semantic && projectPath) {
      GeneratorUtils.logProgress('Running semantic analysis for plan...', verbose);
      this.analyzer = new CodebaseAnalyzer();
      try {
        semantics = await this.analyzer.analyze(projectPath);
        codebaseSnapshot = this.buildCodebaseSnapshot(semantics);
        GeneratorUtils.logProgress(
          `Analyzed ${semantics.stats.totalFiles} files, found ${semantics.stats.totalSymbols} symbols`,
          verbose
        );
      } catch (error) {
        GeneratorUtils.logError('Semantic analysis failed, continuing without it', error, verbose);
      }
    }

    const agentSummaries = this.resolveAgents(selectedAgentTypes);
    const docGuides = selectedDocKeys === null
      ? []
      : getGuidesByKeys(selectedDocKeys || undefined);

    let phaseSuggestions: PhaseRequirementSuggestions = {};
    if (projectPath) {
      try {
        phaseSuggestions = await suggestPhaseRequirements(projectPath);
      } catch (error) {
        GeneratorUtils.logError('Phase requirement detection failed; continuing without suggestions', error, verbose);
      }
    }

    const content = renderPlanTemplate({
      title: planTitle,
      slug,
      summary,
      agents: agentSummaries,
      docs: docGuides,
      semantics,
      codebaseSnapshot,
      phaseSuggestions,
    });

    await GeneratorUtils.writeFileWithLogging(
      planPath,
      content,
      verbose,
      `Created ${planFileName}`
    );

    await this.updatePlanIndex(plansDir, verbose);

    return {
      planPath,
      relativePath: path.relative(resolvedOutput, planPath),
      slug
    };
  }

  private resolveAgents(selected?: string[] | null): PlanAgentSummary[] {
    const allowed = new Set<AgentType>(Array.from(AGENT_TYPES));

    if (selected === null) {
      return [];
    }

    const chosen: AgentType[] = selected && selected.length > 0
      ? Array.from(new Set(selected.map(value => value.toLowerCase().trim())))
          .filter(value => allowed.has(value as AgentType)) as AgentType[]
      : Array.from(allowed);

    return chosen.map(type => ({
      type,
      title: GeneratorUtils.formatTitle(type),
      responsibility: AGENT_RESPONSIBILITIES[type]?.[0] || 'Document this agent\'s primary responsibility.'
    }));
  }

  private buildCodebaseSnapshot(semantics: SemanticContext): CodebaseSnapshot {
    const { architecture, stats } = semantics;

    return {
      totalFiles: stats.totalFiles,
      totalSymbols: stats.totalSymbols,
      layers: architecture.layers.map(layer => layer.name),
      patterns: architecture.patterns.map(pattern => pattern.name),
      entryPoints: architecture.entryPoints
    };
  }

  private async updatePlanIndex(plansDir: string, verbose: boolean): Promise<void> {
    const files = await fs.readdir(plansDir);
    const entries: PlanIndexEntry[] = files
      .filter(file => file.toLowerCase().endsWith('.md') && file.toLowerCase() !== 'readme.md')
      .map(file => file.replace(/\.md$/i, ''))
      .map(slug => ({ slug, title: GeneratorUtils.formatTitle(slug) }))
      .sort((a, b) => a.title.localeCompare(b.title));

    const indexContent = renderPlanIndex(entries);
    const indexPath = path.join(plansDir, 'README.md');

    await GeneratorUtils.writeFileWithLogging(
      indexPath,
      indexContent,
      verbose,
      'Updated plans index'
    );
  }
}
