/**
 * SemanticContextBuilder - Generates optimized context strings for LLM prompts
 *
 * Uses pre-computed semantic analysis to provide rich context without
 * requiring the LLM to explore the codebase with tools.
 */

import * as path from 'path';
import { CodebaseAnalyzer } from './codebaseAnalyzer';
import type {
  SemanticContext,
  ExtractedSymbol,
  ArchitectureLayer,
  DetectedPattern,
  AnalyzerOptions,
} from './types';
import { DEFAULT_EXCLUDE_PATTERNS } from './types';

export interface ContextBuilderOptions extends AnalyzerOptions {
  /** Maximum symbols to include per category */
  maxSymbolsPerCategory?: number;
  /** Include full documentation strings */
  includeDocumentation?: boolean;
  /** Include parameter and return type info */
  includeSignatures?: boolean;
  /** Maximum total context length (chars) */
  maxContextLength?: number;
}

export type ContextFormat = 'documentation' | 'playbook' | 'plan' | 'compact';

const DEFAULT_OPTIONS: Required<ContextBuilderOptions> = {
  useLSP: false,
  languages: ['typescript', 'javascript', 'python', 'go'],
  exclude: DEFAULT_EXCLUDE_PATTERNS,
  include: [],
  maxFiles: 5000,
  cacheEnabled: true,
  maxSymbolsPerCategory: 50,
  includeDocumentation: true,
  includeSignatures: true,
  maxContextLength: 32000,
};

export class SemanticContextBuilder {
  private analyzer: CodebaseAnalyzer;
  private options: Required<ContextBuilderOptions>;
  private cachedContext: SemanticContext | null = null;
  private cachedProjectPath: string | null = null;

  constructor(options: ContextBuilderOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.analyzer = new CodebaseAnalyzer(this.options);
  }

  /**
   * Analyze the codebase and cache the result
   */
  async analyze(projectPath: string): Promise<SemanticContext> {
    if (this.cachedContext && this.cachedProjectPath === projectPath) {
      return this.cachedContext;
    }

    this.cachedContext = await this.analyzer.analyze(projectPath);
    this.cachedProjectPath = projectPath;
    return this.cachedContext;
  }

  /**
   * Build context string for documentation generation
   */
  async buildDocumentationContext(
    projectPath: string,
    targetFile?: string
  ): Promise<string> {
    const context = await this.analyze(projectPath);
    const sections: string[] = [];

    // Header
    sections.push('# Codebase Context for Documentation\n');

    // Architecture overview
    sections.push(this.formatArchitectureOverview(context));

    // Public API (most important for docs)
    sections.push(this.formatPublicAPI(context, projectPath));

    // If target file specified, add focused context
    if (targetFile) {
      sections.push(this.formatTargetFileContext(context, targetFile, projectPath));
    }

    // Key symbols by category
    sections.push(this.formatSymbolIndex(context, projectPath));

    // Dependency overview
    sections.push(this.formatDependencyOverview(context, projectPath));

    return this.truncateToLimit(sections.join('\n'));
  }

  /**
   * Build context string for agent playbook generation
   */
  async buildPlaybookContext(
    projectPath: string,
    agentType: string
  ): Promise<string> {
    const context = await this.analyze(projectPath);
    const sections: string[] = [];

    // Header
    sections.push(`# Codebase Context for ${agentType} Agent\n`);

    // Relevant layers for this agent type
    const relevantLayers = this.getRelevantLayersForAgent(agentType, context);
    sections.push(this.formatRelevantLayers(relevantLayers, projectPath));

    // Relevant patterns
    const relevantPatterns = this.getRelevantPatternsForAgent(agentType, context);
    sections.push(this.formatRelevantPatterns(relevantPatterns));

    // Key files for this agent type
    sections.push(this.formatKeyFilesForAgent(agentType, context, projectPath));

    // Relevant symbols
    sections.push(this.formatRelevantSymbolsForAgent(agentType, context, projectPath));

    return this.truncateToLimit(sections.join('\n'));
  }

  /**
   * Build context string for development plan generation
   */
  async buildPlanContext(
    projectPath: string,
    planGoal?: string
  ): Promise<string> {
    const context = await this.analyze(projectPath);
    const sections: string[] = [];

    // Header
    sections.push('# Codebase Context for Development Planning\n');
    if (planGoal) {
      sections.push(`**Plan Goal**: ${planGoal}\n`);
    }

    // Full architecture overview
    sections.push(this.formatFullArchitecture(context, projectPath));

    // Detected patterns
    sections.push(this.formatAllPatterns(context));

    // Entry points
    sections.push(this.formatEntryPoints(context));

    // Layer dependencies (important for planning)
    sections.push(this.formatLayerDependencies(context));

    // Symbol summary by layer
    sections.push(this.formatSymbolsByLayer(context, projectPath));

    return this.truncateToLimit(sections.join('\n'));
  }

  /**
   * Build a compact context suitable for any purpose
   */
  async buildCompactContext(projectPath: string): Promise<string> {
    const context = await this.analyze(projectPath);
    const sections: string[] = [];

    sections.push('# Codebase Summary\n');
    sections.push(this.formatArchitectureOverview(context));
    sections.push(this.formatCompactSymbolList(context, projectPath));

    return this.truncateToLimit(sections.join('\n'));
  }

  /**
   * Build context string for skill personalization
   */
  async buildSkillContext(
    projectPath: string,
    skillType: string,
    docsContext?: string,
    agentsContext?: string
  ): Promise<string> {
    const context = await this.analyze(projectPath);
    const sections: string[] = [];

    // Header
    sections.push(`# Codebase Context for ${skillType} Skill\n`);

    // Relevant patterns for this skill
    const relevantPatterns = this.getRelevantPatternsForSkill(skillType, context);
    if (relevantPatterns.length > 0) {
      sections.push(this.formatRelevantPatterns(relevantPatterns));
    }

    // Key files for this skill
    sections.push(this.formatKeyFilesForSkill(skillType, context, projectPath));

    // Relevant symbols for this skill
    sections.push(this.formatRelevantSymbolsForSkill(skillType, context, projectPath));

    // Include docs context if provided
    if (docsContext) {
      sections.push('## Project Documentation\n');
      sections.push(docsContext);
      sections.push('');
    }

    // Include agents context if provided
    if (agentsContext) {
      sections.push('## Agent Playbooks\n');
      sections.push(agentsContext);
      sections.push('');
    }

    return this.truncateToLimit(sections.join('\n'));
  }

  /**
   * Get raw semantic context for custom processing
   */
  async getSemanticContext(projectPath: string): Promise<SemanticContext> {
    return this.analyze(projectPath);
  }

  // ============ Formatting Methods ============

  private formatArchitectureOverview(context: SemanticContext): string {
    const { architecture } = context;
    if (architecture.layers.length === 0) {
      return '';
    }

    const lines = ['## Architecture\n'];

    for (const layer of architecture.layers.slice(0, 8)) {
      const dirs = layer.directories.length > 0
        ? layer.directories.join(', ')
        : 'various locations';
      const deps = layer.dependsOn.length > 0
        ? ` → depends on: ${layer.dependsOn.join(', ')}`
        : '';
      lines.push(`- **${layer.name}**: \`${dirs}\`${deps}`);
    }

    lines.push('');
    return lines.join('\n');
  }

  private formatPublicAPI(context: SemanticContext, projectPath: string): string {
    const { architecture } = context;
    if (architecture.publicAPI.length === 0) {
      return '';
    }

    const lines = ['## Public API\n'];
    const limited = architecture.publicAPI.slice(0, this.options.maxSymbolsPerCategory);

    for (const symbol of limited) {
      lines.push(this.formatSymbolLine(symbol, projectPath));
    }

    if (architecture.publicAPI.length > limited.length) {
      lines.push(`... and ${architecture.publicAPI.length - limited.length} more exports`);
    }

    lines.push('');
    return lines.join('\n');
  }

  private formatSymbolIndex(context: SemanticContext, projectPath: string): string {
    const { symbols } = context;
    const lines = ['## Symbol Index\n'];

    const categories = [
      { name: 'Classes', items: symbols.classes },
      { name: 'Interfaces', items: symbols.interfaces },
      { name: 'Functions', items: symbols.functions },
      { name: 'Types', items: symbols.types },
      { name: 'Enums', items: symbols.enums },
    ];

    for (const cat of categories) {
      if (cat.items.length === 0) continue;

      lines.push(`### ${cat.name}\n`);
      const limited = cat.items.slice(0, this.options.maxSymbolsPerCategory);

      for (const symbol of limited) {
        lines.push(this.formatSymbolLine(symbol, projectPath));
      }

      if (cat.items.length > limited.length) {
        lines.push(`... and ${cat.items.length - limited.length} more`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private formatSymbolLine(symbol: ExtractedSymbol, projectPath: string): string {
    const relPath = path.relative(projectPath, symbol.location.file);
    const loc = `${relPath}:${symbol.location.line}`;
    const exported = symbol.exported ? ' (exported)' : '';

    let signature = '';
    if (this.options.includeSignatures && symbol.parameters) {
      const params = symbol.parameters
        .map((p) => `${p.name}${p.type ? `: ${p.type}` : ''}`)
        .join(', ');
      const ret = symbol.returnType ? `: ${symbol.returnType}` : '';
      signature = `(${params})${ret}`;
    }

    let doc = '';
    if (this.options.includeDocumentation && symbol.documentation) {
      const shortDoc = symbol.documentation.split('\n')[0].slice(0, 80);
      doc = ` - ${shortDoc}`;
    }

    return `- \`${symbol.name}\`${signature}${exported} @ ${loc}${doc}`;
  }

  private formatTargetFileContext(
    context: SemanticContext,
    targetFile: string,
    projectPath: string
  ): string {
    const lines = [`## Target File: ${targetFile}\n`];

    // Find symbols in or related to target file
    const allSymbols = [
      ...context.symbols.classes,
      ...context.symbols.interfaces,
      ...context.symbols.functions,
      ...context.symbols.types,
      ...context.symbols.enums,
    ];

    const relatedSymbols = allSymbols.filter((s) => {
      const relPath = path.relative(projectPath, s.location.file);
      return relPath.includes(targetFile) || targetFile.includes(relPath);
    });

    if (relatedSymbols.length > 0) {
      lines.push('### Symbols in this file:\n');
      for (const symbol of relatedSymbols) {
        lines.push(this.formatSymbolLine(symbol, projectPath));
      }
    }

    lines.push('');
    return lines.join('\n');
  }

  private formatDependencyOverview(context: SemanticContext, projectPath: string): string {
    const { dependencies } = context;
    const lines = ['## Key Dependencies\n'];

    // Find most imported files
    const importCounts = new Map<string, number>();
    for (const [, importers] of dependencies.reverseGraph) {
      for (const importer of importers) {
        const count = importCounts.get(importer) || 0;
        importCounts.set(importer, count + 1);
      }
    }

    const sorted = [...importCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    for (const [file, count] of sorted) {
      const relPath = path.relative(projectPath, file);
      lines.push(`- \`${relPath}\`: imported by ${count} files`);
    }

    lines.push('');
    return lines.join('\n');
  }

  private formatRelevantLayers(
    layers: ArchitectureLayer[],
    projectPath: string
  ): string {
    if (layers.length === 0) return '';

    const lines = ['## Relevant Layers\n'];

    for (const layer of layers) {
      lines.push(`### ${layer.name}\n`);
      lines.push(`${layer.description}\n`);
      lines.push(`**Directories**: \`${layer.directories.join('`, `')}\`\n`);
      lines.push(`**Key Exports**:\n`);

      const keySymbols = layer.symbols
        .filter((s) => s.exported)
        .slice(0, 10);

      for (const symbol of keySymbols) {
        lines.push(this.formatSymbolLine(symbol, projectPath));
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private formatRelevantPatterns(patterns: DetectedPattern[]): string {
    if (patterns.length === 0) return '';

    const lines = ['## Detected Patterns\n'];

    for (const pattern of patterns) {
      const confidence = Math.round(pattern.confidence * 100);
      lines.push(`### ${pattern.name} (${confidence}% confidence)\n`);
      lines.push(`${pattern.description}\n`);
      lines.push('**Locations**:');
      for (const loc of pattern.locations.slice(0, 5)) {
        lines.push(`- \`${loc.symbol}\` in ${loc.file}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private formatKeyFilesForAgent(
    agentType: string,
    context: SemanticContext,
    projectPath: string
  ): string {
    const keyPatterns = this.getKeyPatternsForAgent(agentType);
    const allSymbols = [
      ...context.symbols.classes,
      ...context.symbols.interfaces,
      ...context.symbols.functions,
    ];

    const relevantFiles = new Set<string>();
    for (const symbol of allSymbols) {
      const relPath = path.relative(projectPath, symbol.location.file);
      if (keyPatterns.some((p) => p.test(relPath) || p.test(symbol.name))) {
        relevantFiles.add(relPath);
      }
    }

    if (relevantFiles.size === 0) return '';

    const lines = ['## Key Files\n'];
    for (const file of [...relevantFiles].slice(0, 20)) {
      lines.push(`- \`${file}\``);
    }
    lines.push('');

    return lines.join('\n');
  }

  private formatRelevantSymbolsForAgent(
    agentType: string,
    context: SemanticContext,
    projectPath: string
  ): string {
    const keyPatterns = this.getKeyPatternsForAgent(agentType);
    const allSymbols = [
      ...context.symbols.classes,
      ...context.symbols.interfaces,
      ...context.symbols.functions,
    ];

    const relevantSymbols = allSymbols.filter((s) => {
      const relPath = path.relative(projectPath, s.location.file);
      return keyPatterns.some((p) => p.test(relPath) || p.test(s.name));
    });

    if (relevantSymbols.length === 0) return '';

    const lines = ['## Relevant Symbols\n'];
    for (const symbol of relevantSymbols.slice(0, 30)) {
      lines.push(this.formatSymbolLine(symbol, projectPath));
    }
    lines.push('');

    return lines.join('\n');
  }

  private formatFullArchitecture(
    context: SemanticContext,
    projectPath: string
  ): string {
    const { architecture } = context;
    const lines = ['## Architecture\n'];

    if (architecture.layers.length > 0) {
      lines.push('### Layers\n');
      for (const layer of architecture.layers) {
        lines.push(`**${layer.name}**`);
        lines.push(`- ${layer.description}`);
        lines.push(`- Directories: \`${layer.directories.join('`, `')}\``);
        // Show key exported symbols with their file locations instead of just count
        const keySymbols = layer.symbols.filter(s => s.exported).slice(0, 5);
        if (keySymbols.length > 0) {
          const symbolRefs = keySymbols.map(s => {
            const relPath = path.relative(projectPath, s.location.file);
            return `\`${s.name}\` (${relPath}:${s.location.line})`;
          });
          lines.push(`- Key exports: ${symbolRefs.join(', ')}`);
        }
        if (layer.dependsOn.length > 0) {
          lines.push(`- Depends on: ${layer.dependsOn.join(', ')}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  private formatAllPatterns(context: SemanticContext): string {
    const { architecture } = context;
    if (architecture.patterns.length === 0) return '';

    const lines = ['## Design Patterns\n'];
    for (const pattern of architecture.patterns) {
      const confidence = Math.round(pattern.confidence * 100);
      lines.push(
        `- **${pattern.name}** (${confidence}%): ${pattern.locations.length} occurrences - ${pattern.description}`
      );
    }
    lines.push('');

    return lines.join('\n');
  }

  private formatEntryPoints(context: SemanticContext): string {
    const { architecture } = context;
    if (architecture.entryPoints.length === 0) return '';

    const lines = ['## Entry Points\n'];
    for (const ep of architecture.entryPoints) {
      lines.push(`- \`${ep}\``);
    }
    lines.push('');

    return lines.join('\n');
  }

  private formatLayerDependencies(context: SemanticContext): string {
    const { architecture } = context;
    const layersWithDeps = architecture.layers.filter(
      (l) => l.dependsOn.length > 0
    );

    if (layersWithDeps.length === 0) return '';

    const lines = ['## Layer Dependencies\n'];
    for (const layer of layersWithDeps) {
      lines.push(`- ${layer.name} → ${layer.dependsOn.join(', ')}`);
    }
    lines.push('');

    return lines.join('\n');
  }

  private formatSymbolsByLayer(
    context: SemanticContext,
    projectPath: string
  ): string {
    const { architecture } = context;
    if (architecture.layers.length === 0) return '';

    const lines = ['## Symbols by Layer\n'];

    for (const layer of architecture.layers) {
      const dirs = layer.directories.length > 0
        ? ` (\`${layer.directories.join('`, `')}\`)`
        : '';
      lines.push(`### ${layer.name}${dirs}\n`);

      const exported = layer.symbols.filter((s) => s.exported).slice(0, 15);
      for (const symbol of exported) {
        lines.push(this.formatSymbolLine(symbol, projectPath));
      }

      if (layer.symbols.length > exported.length) {
        const remaining = layer.symbols.length - exported.length;
        lines.push(`... and ${remaining} more in this layer`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private formatCompactSymbolList(
    context: SemanticContext,
    projectPath: string
  ): string {
    const lines = ['## Key Symbols\n'];

    const allExported = [
      ...context.symbols.classes,
      ...context.symbols.interfaces,
      ...context.symbols.functions,
    ].filter((s) => s.exported);

    for (const symbol of allExported.slice(0, 30)) {
      const relPath = path.relative(projectPath, symbol.location.file);
      lines.push(`- ${symbol.kind}: \`${symbol.name}\` @ ${relPath}:${symbol.location.line}`);
    }

    lines.push('');
    return lines.join('\n');
  }

  // ============ Helper Methods ============

  private getRelevantLayersForAgent(
    agentType: string,
    context: SemanticContext
  ): ArchitectureLayer[] {
    const layerPriority: Record<string, string[]> = {
      'code-reviewer': ['Services', 'Controllers', 'Utils'],
      'bug-fixer': ['Services', 'Controllers', 'Utils', 'Models'],
      'feature-developer': ['Services', 'Controllers', 'Models', 'Components'],
      'refactoring-specialist': ['Services', 'Utils', 'Models'],
      'test-writer': ['Services', 'Controllers', 'Utils'],
      'documentation-writer': ['Services', 'Controllers', 'Models', 'Utils'],
      'performance-optimizer': ['Services', 'Repositories', 'Utils'],
      'security-auditor': ['Controllers', 'Services', 'Config'],
      'backend-specialist': ['Services', 'Controllers', 'Repositories', 'Models'],
      'frontend-specialist': ['Components', 'Utils', 'Services'],
      'architect-specialist': ['Services', 'Controllers', 'Models', 'Config'],
      'devops-specialist': ['Config', 'Utils'],
      'database-specialist': ['Repositories', 'Models', 'Services'],
      'mobile-specialist': ['Components', 'Services', 'Utils'],
    };

    const priority = layerPriority[agentType] || ['Services', 'Utils'];
    return context.architecture.layers.filter((l) =>
      priority.includes(l.name)
    );
  }

  private getRelevantPatternsForAgent(
    agentType: string,
    context: SemanticContext
  ): DetectedPattern[] {
    const patternPriority: Record<string, string[]> = {
      'code-reviewer': ['Service Layer', 'Repository', 'Factory'],
      'refactoring-specialist': ['Factory', 'Builder', 'Singleton'],
      'architect-specialist': ['Service Layer', 'Repository', 'Controller', 'Factory'],
      'backend-specialist': ['Service Layer', 'Repository', 'Controller'],
      'database-specialist': ['Repository'],
    };

    const priority = patternPriority[agentType];
    if (!priority) return context.architecture.patterns;

    return context.architecture.patterns.filter((p) =>
      priority.includes(p.name)
    );
  }

  private getKeyPatternsForAgent(agentType: string): RegExp[] {
    const patterns: Record<string, RegExp[]> = {
      'code-reviewer': [/\.(ts|js|tsx|jsx)$/, /service/i, /controller/i],
      'bug-fixer': [/error/i, /exception/i, /handler/i, /\.test\./i],
      'feature-developer': [/service/i, /controller/i, /component/i],
      'refactoring-specialist': [/service/i, /util/i, /helper/i],
      'test-writer': [/\.test\./i, /\.spec\./i, /jest/i, /vitest/i],
      'documentation-writer': [/\.md$/i, /readme/i, /doc/i],
      'performance-optimizer': [/service/i, /repository/i, /cache/i],
      'security-auditor': [/auth/i, /security/i, /credential/i, /\.env/i],
      'backend-specialist': [/service/i, /controller/i, /api/i, /route/i],
      'frontend-specialist': [/component/i, /view/i, /page/i, /\.tsx$/],
      'architect-specialist': [/service/i, /factory/i, /config/i],
      'devops-specialist': [/docker/i, /ci/i, /deploy/i, /config/i],
      'database-specialist': [/model/i, /schema/i, /migration/i, /repository/i],
      'mobile-specialist': [/component/i, /screen/i, /\.tsx$/],
    };

    return patterns[agentType] || [/\.(ts|js)$/];
  }

  private getRelevantPatternsForSkill(
    skillType: string,
    context: SemanticContext
  ): DetectedPattern[] {
    const patternPriority: Record<string, string[]> = {
      'commit-message': ['Service Layer', 'Repository'],
      'pr-review': ['Service Layer', 'Repository', 'Controller'],
      'code-review': ['Factory', 'Service Layer', 'Repository'],
      'test-generation': ['Repository', 'Service Layer'],
      'documentation': ['Service Layer', 'Controller'],
      'refactoring': ['Factory', 'Builder', 'Service Layer'],
      'bug-investigation': ['Service Layer', 'Repository'],
      'feature-breakdown': ['Service Layer', 'Controller', 'Repository'],
      'api-design': ['Controller', 'Service Layer'],
      'security-audit': ['Controller', 'Service Layer'],
    };

    const priority = patternPriority[skillType];
    if (!priority) return context.architecture.patterns;

    return context.architecture.patterns.filter((p) =>
      priority.includes(p.name)
    );
  }

  private getKeyPatternsForSkill(skillType: string): RegExp[] {
    const patterns: Record<string, RegExp[]> = {
      'commit-message': [/\.git/i, /changelog/i, /package\.json$/i, /\.ts$/],
      'pr-review': [/\.github/i, /\.ts$/, /\.test\./i, /spec/i],
      'code-review': [/service/i, /controller/i, /\.ts$/, /eslint/i],
      'test-generation': [/\.test\./i, /\.spec\./i, /jest/i, /vitest/i],
      'documentation': [/\.md$/i, /readme/i, /docs/i],
      'refactoring': [/service/i, /util/i, /helper/i, /\.ts$/],
      'bug-investigation': [/error/i, /exception/i, /log/i, /\.ts$/],
      'feature-breakdown': [/service/i, /component/i, /controller/i],
      'api-design': [/api/i, /route/i, /controller/i, /openapi/i, /swagger/i],
      'security-audit': [/auth/i, /security/i, /\.env/i, /credential/i],
    };

    return patterns[skillType] || [/\.(ts|js)$/];
  }

  private formatKeyFilesForSkill(
    skillType: string,
    context: SemanticContext,
    projectPath: string
  ): string {
    const keyPatterns = this.getKeyPatternsForSkill(skillType);
    const allSymbols = [
      ...context.symbols.classes,
      ...context.symbols.interfaces,
      ...context.symbols.functions,
    ];

    const relevantFiles = new Set<string>();
    for (const symbol of allSymbols) {
      const relPath = path.relative(projectPath, symbol.location.file);
      if (keyPatterns.some((p) => p.test(relPath) || p.test(symbol.name))) {
        relevantFiles.add(relPath);
      }
    }

    if (relevantFiles.size === 0) return '';

    const lines = [`## Key Files for ${skillType}\n`];
    for (const file of [...relevantFiles].slice(0, 20)) {
      lines.push(`- \`${file}\``);
    }
    lines.push('');

    return lines.join('\n');
  }

  private formatRelevantSymbolsForSkill(
    skillType: string,
    context: SemanticContext,
    projectPath: string
  ): string {
    const keyPatterns = this.getKeyPatternsForSkill(skillType);
    const allSymbols = [
      ...context.symbols.classes,
      ...context.symbols.interfaces,
      ...context.symbols.functions,
    ];

    const relevantSymbols = allSymbols.filter((s) => {
      const relPath = path.relative(projectPath, s.location.file);
      return keyPatterns.some((p) => p.test(relPath) || p.test(s.name));
    });

    if (relevantSymbols.length === 0) return '';

    const lines = [`## Relevant Symbols for ${skillType}\n`];
    for (const symbol of relevantSymbols.slice(0, 25)) {
      lines.push(this.formatSymbolLine(symbol, projectPath));
    }
    lines.push('');

    return lines.join('\n');
  }

  private truncateToLimit(content: string): string {
    if (content.length <= this.options.maxContextLength) {
      return content;
    }

    // Truncate at a line boundary
    const truncated = content.slice(0, this.options.maxContextLength);
    const lastNewline = truncated.lastIndexOf('\n');
    return truncated.slice(0, lastNewline) + '\n\n... (truncated)';
  }

  /**
   * Clear cached analysis
   */
  clearCache(): void {
    this.cachedContext = null;
    this.cachedProjectPath = null;
    this.analyzer.clearCache();
  }

  /**
   * Shutdown analyzer (cleanup LSP servers if enabled)
   */
  async shutdown(): Promise<void> {
    await this.analyzer.shutdown();
  }
}
