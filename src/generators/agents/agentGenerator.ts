import * as path from 'path';
import { RepoStructure } from '../../types';
import { GeneratorUtils } from '../shared';
import { AGENT_TYPES, AgentType } from './agentTypes';
import { renderAgentIndex } from './templates';
import { DOCUMENT_GUIDES } from '../documentation/guideRegistry';
import { CodebaseAnalyzer, SemanticContext, ExtractedSymbol } from '../../services/semantic';
import { KeySymbolInfo } from './templates/types';
import { AGENT_RESPONSIBILITIES } from './agentConfig';
import {
  createAgentFrontmatter,
  serializeFrontmatter,
} from '../../types/scaffoldFrontmatter';
import { PrevcPhase } from '../../workflow/types';
import { getScaffoldStructure, serializeStructureAsMarkdown } from '../shared/scaffoldStructures';
import { AutoFillService, AutoFillContext } from '../../services/autoFill';
import { StackDetector, StackInfo } from '../../services/stack';

interface AgentContext {
  topLevelDirectories: string[];
  semantics?: SemanticContext;
}

/** Skill info that agents can reference */
interface AvailableSkill {
  slug: string;
  name: string;
  description: string;
  phases: string[];
}

interface AgentGenerationConfig {
  selectedAgents?: string[];
  semantic?: boolean;
  /** Filtered list of agents based on project type classification */
  filteredAgents?: AgentType[];
  /** Include section headings and guidance in scaffolds (CLI mode) */
  includeContentStubs?: boolean;
  /** Fill scaffolds with semantic data (no LLM required) */
  autoFill?: boolean;
  /** Available skills that agents can reference */
  availableSkills?: AvailableSkill[];
}

/**
 * Mapping of agent types to relevant skill slugs
 */
const AGENT_SKILL_MAP: Partial<Record<AgentType, string[]>> = {
  'code-reviewer': ['code-review', 'security-audit'],
  'bug-fixer': ['bug-investigation'],
  'feature-developer': ['feature-breakdown', 'commit-message'],
  'refactoring-specialist': ['refactoring'],
  'test-writer': ['test-generation'],
  'documentation-writer': ['documentation', 'commit-message'],
  'security-auditor': ['security-audit'],
};

/**
 * Agent to PREVC phase mapping
 */
const AGENT_PHASES: Record<AgentType, PrevcPhase[]> = {
  'code-reviewer': ['R', 'V'],
  'bug-fixer': ['E', 'V'],
  'feature-developer': ['P', 'E'],
  'refactoring-specialist': ['E'],
  'test-writer': ['E', 'V'],
  'documentation-writer': ['P', 'C'],
  'performance-optimizer': ['E', 'V'],
  'security-auditor': ['R', 'V'],
  'backend-specialist': ['P', 'E'],
  'frontend-specialist': ['P', 'E'],
  'architect-specialist': ['P', 'R'],
  'devops-specialist': ['E', 'C'],
  'database-specialist': ['P', 'E'],
  'mobile-specialist': ['P', 'E'],
};

/**
 * Format agent type as display title
 */
function formatAgentTitle(agentType: AgentType): string {
  return agentType
    .split('-')
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export class AgentGenerator {
  private readonly docTouchpoints = [
    {
      title: 'Documentation Index',
      path: '../docs/README.md'
    },
    ...DOCUMENT_GUIDES.map(guide => ({
      title: guide.title,
      path: `../docs/${guide.file}`
    }))
  ];

  private analyzer?: CodebaseAnalyzer;

  constructor(..._legacyArgs: unknown[]) {}

  async generateAgentPrompts(
    repoStructure: RepoStructure,
    outputDir: string,
    config: AgentGenerationConfig | string[] = {},
    verbose: boolean = false
  ): Promise<number> {
    // Support legacy API: if config is an array, treat it as selectedAgents
    const normalizedConfig: AgentGenerationConfig = Array.isArray(config)
      ? { selectedAgents: config }
      : config;

    const agentsDir = path.join(outputDir, 'agents');
    await GeneratorUtils.ensureDirectoryAndLog(agentsDir, verbose, 'Generating agent scaffold in');

    // Perform semantic analysis if enabled
    let semantics: SemanticContext | undefined;
    if (normalizedConfig.semantic) {
      GeneratorUtils.logProgress('Running semantic analysis for agents...', verbose);
      this.analyzer = new CodebaseAnalyzer();
      try {
        semantics = await this.analyzer.analyze(repoStructure.rootPath);
        GeneratorUtils.logProgress(
          `Analyzed ${semantics.stats.totalFiles} files, found ${semantics.stats.totalSymbols} symbols`,
          verbose
        );
      } catch (error) {
        GeneratorUtils.logError('Semantic analysis failed, continuing without it', error, verbose);
      }
    }

    // Detect stack info for autoFill
    let stackInfo: StackInfo | undefined;
    if (normalizedConfig.autoFill) {
      try {
        const stackDetector = new StackDetector();
        stackInfo = await stackDetector.detect(repoStructure.rootPath);
      } catch (error) {
        GeneratorUtils.logError('Stack detection failed, continuing without it', error, verbose);
      }
    }

    const context = this.buildContext(repoStructure, semantics);
    const agentTypes = this.resolveAgentSelection(
      normalizedConfig.selectedAgents,
      normalizedConfig.filteredAgents
    );

    let created = 0;

    // Generate frontmatter-only files for each agent (scaffold v2)
    for (const agentType of agentTypes) {
      const title = formatAgentTitle(agentType);
      const responsibilities = AGENT_RESPONSIBILITIES[agentType] || [];
      const description = responsibilities[0] || `${title} agent playbook`;
      const phases = AGENT_PHASES[agentType];

      const frontmatter = createAgentFrontmatter(
        title,
        description,
        agentType,
        phases
      );
      let content = serializeFrontmatter(frontmatter) + '\n';

      // Add content based on mode
      const structure = getScaffoldStructure(agentType);
      if (structure) {
        if (normalizedConfig.autoFill && semantics) {
          // AutoFill: generate content from semantic analysis (no LLM needed)
          const autoFillService = new AutoFillService();
          const autoFillContext: AutoFillContext = {
            semantics,
            stackInfo,
            repoPath: repoStructure.rootPath,
            topLevelDirectories: context.topLevelDirectories
          };
          content += autoFillService.fillAgent(agentType, structure, autoFillContext);
        } else if (normalizedConfig.includeContentStubs) {
          // Content stubs: section headings with guidance comments
          content += serializeStructureAsMarkdown(structure);
        }
      }

      // Append available skills section if skills are provided
      if (normalizedConfig.availableSkills && normalizedConfig.availableSkills.length > 0) {
        const skillsSection = this.renderSkillsSection(agentType, normalizedConfig.availableSkills);
        if (skillsSection) {
          content += skillsSection;
        }
      }

      const filePath = path.join(agentsDir, `${agentType}.md`);
      await GeneratorUtils.writeFileWithLogging(filePath, content, verbose, `Created ${agentType}.md`);
      created += 1;
    }

    // Generate README.md index
    const indexPath = path.join(agentsDir, 'README.md');
    const indexContent = renderAgentIndex(agentTypes);
    await GeneratorUtils.writeFileWithLogging(indexPath, indexContent, verbose, 'Created README.md');
    created += 1;

    return created;
  }

  /**
   * Render an "Available Skills" markdown section for an agent, filtered to relevant skills.
   */
  private renderSkillsSection(agentType: AgentType, availableSkills: AvailableSkill[]): string | null {
    const relevantSlugs = AGENT_SKILL_MAP[agentType];
    if (!relevantSlugs || relevantSlugs.length === 0) {
      return null;
    }

    const matchedSkills = availableSkills.filter(s => relevantSlugs.includes(s.slug));
    if (matchedSkills.length === 0) {
      return null;
    }

    const rows = matchedSkills.map(
      s => `| [${s.slug}](./../skills/${s.slug}/SKILL.md) | ${s.description} |`
    );

    return `\n## Available Skills\n\nThe following skills provide detailed procedures for specific tasks. Activate them when needed:\n\n| Skill | Description |\n|-------|-------------|\n${rows.join('\n')}\n`;
  }

  private getRelevantSymbolsForAgent(agentType: AgentType, semantics?: SemanticContext): KeySymbolInfo[] {
    if (!semantics) return [];

    const { symbols } = semantics;
    let relevantSymbols: ExtractedSymbol[] = [];

    // Filter symbols based on agent type
    switch (agentType) {
      case 'test-writer':
        // Test writer needs test-related symbols
        relevantSymbols = [
          ...symbols.functions.filter(s => /test|spec|mock|stub/i.test(s.name)),
          ...symbols.classes.filter(s => /test|spec/i.test(s.name)),
        ];
        break;

      case 'code-reviewer':
      case 'refactoring-specialist':
        // These need main classes and interfaces
        relevantSymbols = [
          ...symbols.classes.filter(s => s.exported),
          ...symbols.interfaces.filter(s => s.exported),
        ];
        break;

      case 'documentation-writer':
        // Documentation writer needs exported symbols
        relevantSymbols = [
          ...symbols.classes.filter(s => s.exported),
          ...symbols.interfaces.filter(s => s.exported),
          ...symbols.functions.filter(s => s.exported),
          ...symbols.types.filter(s => s.exported),
        ];
        break;

      case 'security-auditor':
        // Security auditor needs auth-related symbols
        relevantSymbols = [
          ...symbols.functions.filter(s => /auth|security|crypt|token|password|secret/i.test(s.name)),
          ...symbols.classes.filter(s => /auth|security|guard|policy/i.test(s.name)),
        ];
        break;

      case 'performance-optimizer':
        // Performance needs cache, async, and data processing symbols
        relevantSymbols = [
          ...symbols.functions.filter(s => /cache|async|batch|queue|pool/i.test(s.name)),
          ...symbols.classes.filter(s => /cache|pool|buffer|queue/i.test(s.name)),
        ];
        break;

      case 'database-specialist':
        // Database specialist needs repository and model symbols
        relevantSymbols = [
          ...symbols.classes.filter(s => /repository|model|entity|schema|migration/i.test(s.name)),
          ...symbols.interfaces.filter(s => /repository|model|entity/i.test(s.name)),
        ];
        break;

      case 'backend-specialist':
        // Backend needs services, controllers, handlers
        relevantSymbols = [
          ...symbols.classes.filter(s => /service|controller|handler|middleware/i.test(s.name)),
        ];
        break;

      case 'frontend-specialist':
        // Frontend needs components and hooks
        relevantSymbols = [
          ...symbols.functions.filter(s => /^use[A-Z]/i.test(s.name)), // hooks
          ...symbols.classes.filter(s => /component|view|page|screen/i.test(s.name)),
        ];
        break;

      default:
        // Default: top exported symbols
        relevantSymbols = [
          ...symbols.classes.filter(s => s.exported).slice(0, 5),
          ...symbols.interfaces.filter(s => s.exported).slice(0, 5),
        ];
    }

    // Convert to KeySymbolInfo and limit
    return relevantSymbols.slice(0, 15).map(s => ({
      name: s.name,
      kind: s.kind,
      file: s.location.file,
      line: s.location.line,
    }));
  }

  private resolveAgentSelection(
    selected?: string[],
    filteredByProjectType?: AgentType[]
  ): readonly AgentType[] {
    // If explicitly selected agents are provided, use those
    if (selected && selected.length > 0) {
      const allowed = new Set<AgentType>(AGENT_TYPES);
      const filtered = selected.filter((agent): agent is AgentType => allowed.has(agent as AgentType));
      return (filtered.length > 0 ? filtered : AGENT_TYPES) as readonly AgentType[];
    }

    // If filtered by project type, use those
    if (filteredByProjectType && filteredByProjectType.length > 0) {
      return filteredByProjectType;
    }

    // Default: all agents
    return AGENT_TYPES;
  }

  private buildContext(repoStructure: RepoStructure, semantics?: SemanticContext): AgentContext {
    const directorySet = new Set<string>();

    repoStructure.directories.forEach(dir => {
      const [firstSegment] = dir.relativePath.split(/[\\/]/).filter(Boolean);
      if (firstSegment) {
        directorySet.add(firstSegment);
      }
    });

    return {
      topLevelDirectories: Array.from(directorySet).sort(),
      semantics
    };
  }

}
