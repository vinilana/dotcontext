/**
 * AutoFillService - Generates documentation content from semantic analysis
 *
 * This service fills scaffold templates with actual codebase data without
 * requiring an LLM API key. It maps semantic analysis results to scaffold
 * sections, providing useful starter content based on code structure.
 */

import * as path from 'path';
import { SemanticContext, ExtractedSymbol, ArchitectureLayer, DetectedPattern } from '../semantic/types';
import { StackInfo } from '../stack/stackDetector';
import { ScaffoldStructure, ScaffoldSection } from '../../generators/shared/structures/types';

export interface AutoFillContext {
  semantics?: SemanticContext;
  stackInfo?: StackInfo;
  repoPath: string;
  topLevelDirectories?: string[];
}

interface DirectoryStat {
  name: string;
  fileCount: number;
}

const SEMANTIC_SNAPSHOT_REFERENCE =
  'Use `context({ action: "getMap", section: "all" })` to inspect the generated semantic snapshot for stack, architecture, key files, and dependency hotspots.';

export class AutoFillService {
  /**
   * Fill a documentation scaffold with semantic data
   */
  fillDocumentation(
    docName: string,
    structure: ScaffoldStructure,
    ctx: AutoFillContext
  ): string {
    const sections: string[] = [];
    const sortedSections = [...structure.sections].sort((a, b) => a.order - b.order);

    for (const section of sortedSections) {
      sections.push(this.fillSection(section, docName, ctx));
    }

    // Add cross-references section if present
    if (structure.linkTo && structure.linkTo.length > 0) {
      sections.push('## Related Resources\n');
      for (const link of structure.linkTo) {
        sections.push(`- [${link}](./${link})`);
      }
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Fill an agent playbook scaffold with semantic data
   */
  fillAgent(
    agentType: string,
    structure: ScaffoldStructure,
    ctx: AutoFillContext
  ): string {
    const sections: string[] = [];
    const sortedSections = [...structure.sections].sort((a, b) => a.order - b.order);

    for (const section of sortedSections) {
      sections.push(this.fillAgentSection(section, agentType, ctx));
    }

    return sections.join('\n');
  }

  private fillSection(
    section: ScaffoldSection,
    docName: string,
    ctx: AutoFillContext
  ): string {
    const heading = '#'.repeat(section.headingLevel || 2) + ' ' + section.heading;
    const content = this.generateDocContent(section, docName, ctx);
    return `${heading}\n\n${content}\n`;
  }

  private fillAgentSection(
    section: ScaffoldSection,
    agentType: string,
    ctx: AutoFillContext
  ): string {
    const heading = '#'.repeat(section.headingLevel || 2) + ' ' + section.heading;
    const content = this.generateAgentContent(section, agentType, ctx);
    return `${heading}\n\n${content}\n`;
  }

  private generateDocContent(
    section: ScaffoldSection,
    docName: string,
    ctx: AutoFillContext
  ): string {
    // Map document sections to semantic data
    if (docName === 'project-overview') {
      return this.fillProjectOverviewSection(section, ctx);
    }

    if (docName === 'architecture') {
      return this.fillArchitectureSection(section, ctx);
    }

    if (docName === 'tooling') {
      return this.fillToolingSection(section, ctx);
    }

    // Default: use guidance as placeholder
    return `<!-- ${section.guidance} -->\n\n_Content to be added._`;
  }

  private generateAgentContent(
    section: ScaffoldSection,
    agentType: string,
    ctx: AutoFillContext
  ): string {
    const { semantics, stackInfo } = ctx;

    // Fill "Key Files" section
    if (section.heading.toLowerCase().includes('key files') || section.heading.toLowerCase().includes('relevant files')) {
      return this.generateKeyFilesForAgent(agentType, ctx);
    }

    // Fill "Relevant Symbols" section
    if (section.heading.toLowerCase().includes('symbol') || section.heading.toLowerCase().includes('classes') || section.heading.toLowerCase().includes('functions')) {
      return this.generateRelevantSymbolsForAgent(agentType, ctx);
    }

    // Fill "Technology Context" section
    if (section.heading.toLowerCase().includes('technology') || section.heading.toLowerCase().includes('stack')) {
      if (stackInfo) {
        return this.formatTechStack(stackInfo);
      }
    }

    // Default: use guidance as placeholder
    return `<!-- ${section.guidance} -->\n\n_Content to be added._`;
  }

  // ===== Project Overview Sections =====

  private fillProjectOverviewSection(section: ScaffoldSection, ctx: AutoFillContext): string {
    const { semantics, stackInfo, repoPath, topLevelDirectories } = ctx;

    switch (section.heading) {
      case 'Project Overview':
        return this.generateProjectOverview(ctx);

      case 'Codebase Reference':
        return `> **Semantic Snapshot**: ${SEMANTIC_SNAPSHOT_REFERENCE}`;

      case 'Quick Facts':
        return this.generateQuickFacts(ctx);

      case 'Entry Points':
        return this.formatEntryPoints(semantics?.architecture?.entryPoints || []);

      case 'Key Exports':
        return this.formatPublicAPI(semantics?.architecture?.publicAPI?.slice(0, 10) || []);

      case 'File Structure & Code Organization':
        return this.formatDirectoryStructure(topLevelDirectories || []);

      case 'Technology Stack Summary':
        return this.formatTechStack(stackInfo);

      case 'Core Framework Stack':
        return this.formatFrameworks(stackInfo);

      case 'Getting Started Checklist':
        return this.generateGettingStarted(stackInfo);

      default:
        return `<!-- ${section.guidance} -->\n\n_Content to be added._`;
    }
  }

  // ===== Architecture Sections =====

  private fillArchitectureSection(section: ScaffoldSection, ctx: AutoFillContext): string {
    const { semantics, topLevelDirectories } = ctx;

    switch (section.heading) {
      case 'Architectural Layers':
        return this.formatLayers(semantics?.architecture?.layers || []);

      case 'Detected Design Patterns':
        return this.formatPatterns(semantics?.architecture?.patterns || []);

      case 'Entry Points':
        return this.formatEntryPoints(semantics?.architecture?.entryPoints || []);

      case 'Public API':
        return this.formatPublicAPITable(semantics?.architecture?.publicAPI?.slice(0, 15) || []);

      case 'Top Directories Snapshot':
        return this.formatDirectoryStructure(topLevelDirectories || []);

      default:
        return `<!-- ${section.guidance} -->\n\n_Content to be added._`;
    }
  }

  // ===== Tooling Sections =====

  private fillToolingSection(section: ScaffoldSection, ctx: AutoFillContext): string {
    const { stackInfo } = ctx;

    if (section.heading.toLowerCase().includes('build') || section.heading.toLowerCase().includes('tool')) {
      return this.formatBuildTools(stackInfo);
    }

    if (section.heading.toLowerCase().includes('test')) {
      return this.formatTestFrameworks(stackInfo);
    }

    if (section.heading.toLowerCase().includes('package')) {
      return this.formatPackageManager(stackInfo);
    }

    return `<!-- ${section.guidance} -->\n\n_Content to be added._`;
  }

  // ===== Content Generators =====

  private generateProjectOverview(ctx: AutoFillContext): string {
    const { stackInfo, semantics } = ctx;
    const lines: string[] = [];

    if (stackInfo) {
      const lang = stackInfo.primaryLanguage || 'multi-language';
      const frameworks = stackInfo.frameworks.slice(0, 3).join(', ') || 'custom';

      lines.push(`This is a **${lang}** project${frameworks !== 'custom' ? ` using ${frameworks}` : ''}.`);
    }

    if (semantics?.stats) {
      lines.push(`The codebase contains **${semantics.stats.totalFiles} files** with **${semantics.stats.totalSymbols} symbols**.`);
    }

    return lines.join(' ') || '_Project description to be added._';
  }

  private generateQuickFacts(ctx: AutoFillContext): string {
    const { semantics, stackInfo, repoPath } = ctx;
    const lines: string[] = [];

    lines.push(`- **Root**: \`${repoPath}\``);

    if (stackInfo?.languages.length) {
      const langs = stackInfo.languages.slice(0, 3).map(l => `${l}`).join(', ');
      lines.push(`- **Languages**: ${langs}`);
    }

    if (semantics?.stats) {
      lines.push(`- **Total Files**: ${semantics.stats.totalFiles}`);
      lines.push(`- **Total Symbols**: ${semantics.stats.totalSymbols}`);
    }

    if (semantics?.architecture?.entryPoints?.length) {
      const ep = semantics.architecture.entryPoints[0];
      lines.push(`- **Entry Point**: \`${ep}\``);
    }

    lines.push(`- **Semantic Snapshot**: ${SEMANTIC_SNAPSHOT_REFERENCE}`);

    return lines.join('\n');
  }

  private formatEntryPoints(entryPoints: string[]): string {
    if (!entryPoints.length) {
      return '_No entry points detected. Add main entry files here._';
    }

    return entryPoints.map(ep => `- [\`${ep}\`](../${ep})`).join('\n');
  }

  private formatPublicAPI(symbols: ExtractedSymbol[]): string {
    if (!symbols.length) {
      return '_Document the main exported surfaces here._';
    }

    const lines = symbols.slice(0, 10).map(s => {
      const relPath = s.location.file;
      return `- \`${s.name}\` (${s.kind}) - ${path.basename(relPath)}:${s.location.line}`;
    });

    lines.push(`\n> ${SEMANTIC_SNAPSHOT_REFERENCE}`);
    return lines.join('\n');
  }

  private formatPublicAPITable(symbols: ExtractedSymbol[]): string {
    if (!symbols.length) {
      return '_Document the main exported surfaces here._';
    }

    const lines = [
      '| Symbol | Type | Location |',
      '|--------|------|----------|',
    ];

    for (const s of symbols) {
      const fileName = path.basename(s.location.file);
      lines.push(`| \`${s.name}\` | ${s.kind} | ${fileName}:${s.location.line} |`);
    }

    return lines.join('\n');
  }

  private formatDirectoryStructure(directories: string[]): string {
    if (!directories.length) {
      return '_Add top-level directory descriptions here._';
    }

    return directories
      .slice(0, 10)
      .map(dir => `- \`${dir}/\` — _describe purpose_`)
      .join('\n');
  }

  private formatTechStack(stackInfo?: StackInfo): string {
    if (!stackInfo) {
      return '_Technology stack to be documented._';
    }

    const lines: string[] = [];

    if (stackInfo.primaryLanguage) {
      lines.push(`**Primary Language**: ${stackInfo.primaryLanguage}`);
    }

    if (stackInfo.languages.length > 1) {
      lines.push(`**Other Languages**: ${stackInfo.languages.filter(l => l !== stackInfo.primaryLanguage).join(', ')}`);
    }

    if (stackInfo.frameworks.length) {
      lines.push(`**Frameworks**: ${stackInfo.frameworks.join(', ')}`);
    }

    if (stackInfo.buildTools.length) {
      lines.push(`**Build Tools**: ${stackInfo.buildTools.join(', ')}`);
    }

    if (stackInfo.packageManager) {
      lines.push(`**Package Manager**: ${stackInfo.packageManager}`);
    }

    return lines.join('\n\n') || '_Technology stack to be documented._';
  }

  private formatFrameworks(stackInfo?: StackInfo): string {
    if (!stackInfo?.frameworks.length) {
      return '_No frameworks detected._';
    }

    return stackInfo.frameworks.map(f => `- **${f}**`).join('\n');
  }

  private formatBuildTools(stackInfo?: StackInfo): string {
    if (!stackInfo?.buildTools.length) {
      return '_No build tools detected._';
    }

    return stackInfo.buildTools.map(t => `- **${t}**`).join('\n');
  }

  private formatTestFrameworks(stackInfo?: StackInfo): string {
    if (!stackInfo?.testFrameworks.length) {
      return '_No test frameworks detected._';
    }

    return stackInfo.testFrameworks.map(t => `- **${t}**`).join('\n');
  }

  private formatPackageManager(stackInfo?: StackInfo): string {
    if (!stackInfo?.packageManager) {
      return '_Package manager not detected._';
    }

    return `Using **${stackInfo.packageManager}** for dependency management.`;
  }

  private formatLayers(layers: ArchitectureLayer[]): string {
    if (!layers.length) {
      return '_No architecture layers detected. Document your layers here._';
    }

    const lines = layers.map(layer => {
      const dirs = layer.directories.slice(0, 3).map(d => `\`${d}\``).join(', ');
      return `- **${layer.name}**: ${layer.description} (${dirs})`;
    });

    lines.push(`\n> ${SEMANTIC_SNAPSHOT_REFERENCE}`);

    return lines.join('\n');
  }

  private formatPatterns(patterns: DetectedPattern[]): string {
    if (!patterns.length) {
      return '_No design patterns detected._';
    }

    const lines = [
      '| Pattern | Confidence | Locations | Description |',
      '|---------|------------|-----------|-------------|',
    ];

    for (const p of patterns) {
      const confidence = `${Math.round(p.confidence * 100)}%`;
      const locations = p.locations.slice(0, 2).map(l => `\`${l.symbol}\``).join(', ');
      lines.push(`| ${p.name} | ${confidence} | ${locations} | ${p.description} |`);
    }

    return lines.join('\n');
  }

  private generateGettingStarted(stackInfo?: StackInfo): string {
    const lines: string[] = [];
    let step = 1;

    // Install dependencies
    if (stackInfo?.packageManager) {
      const installCmd = {
        npm: 'npm install',
        yarn: 'yarn',
        pnpm: 'pnpm install',
        bun: 'bun install',
      }[stackInfo.packageManager] || 'npm install';

      lines.push(`${step}. Install dependencies with \`${installCmd}\`.`);
      step++;
    }

    // Run dev command
    if (stackInfo?.primaryLanguage) {
      if (['typescript', 'javascript'].includes(stackInfo.primaryLanguage)) {
        lines.push(`${step}. Start development with \`npm run dev\` or \`npm start\`.`);
      } else if (stackInfo.primaryLanguage === 'python') {
        lines.push(`${step}. Activate virtual environment and run the main script.`);
      } else if (stackInfo.primaryLanguage === 'go') {
        lines.push(`${step}. Run \`go run .\` to start the application.`);
      }
      step++;
    }

    // Run tests
    if (stackInfo?.testFrameworks.length) {
      const testCmd = stackInfo.testFrameworks.includes('jest') ? 'npm test' :
                      stackInfo.testFrameworks.includes('pytest') ? 'pytest' :
                      stackInfo.testFrameworks.includes('vitest') ? 'npm test' : 'npm test';
      lines.push(`${step}. Run tests with \`${testCmd}\`.`);
      step++;
    }

    lines.push(`${step}. Review the development workflow documentation.`);

    return lines.join('\n');
  }

  // ===== Agent-specific content generators =====

  private generateKeyFilesForAgent(agentType: string, ctx: AutoFillContext): string {
    const { semantics, repoPath } = ctx;

    if (!semantics) {
      return '_Key files to be identified._';
    }

    const allFiles = new Set<string>();

    // Collect files based on agent type patterns
    const patterns = this.getFilePatternForAgent(agentType);

    for (const [file] of semantics.dependencies.graph) {
      const relPath = path.relative(repoPath, file);
      if (patterns.some(p => p.test(relPath))) {
        allFiles.add(relPath);
      }
    }

    if (allFiles.size === 0) {
      return '_No specific files detected for this agent type._';
    }

    return Array.from(allFiles)
      .slice(0, 10)
      .map(f => `- [\`${f}\`](../${f})`)
      .join('\n');
  }

  private generateRelevantSymbolsForAgent(agentType: string, ctx: AutoFillContext): string {
    const { semantics } = ctx;

    if (!semantics) {
      return '_Relevant symbols to be identified._';
    }

    const symbols = this.getRelevantSymbolsForAgent(agentType, semantics);

    if (symbols.length === 0) {
      return '_No specific symbols detected for this agent type._';
    }

    return symbols
      .slice(0, 15)
      .map(s => `- \`${s.name}\` (${s.kind}) - ${path.basename(s.location.file)}:${s.location.line}`)
      .join('\n');
  }

  private getFilePatternForAgent(agentType: string): RegExp[] {
    switch (agentType) {
      case 'code-reviewer':
      case 'refactoring-specialist':
        return [/service/i, /controller/i, /handler/i, /repository/i];

      case 'test-writer':
        return [/test|spec/i, /__tests__/i, /mock/i];

      case 'documentation-writer':
        return [/readme/i, /docs?/i, /\.md$/i];

      case 'security-auditor':
        return [/auth/i, /security/i, /middleware/i, /guard/i];

      case 'performance-optimizer':
        return [/cache/i, /queue/i, /pool/i, /buffer/i];

      case 'database-specialist':
        return [/model/i, /entity/i, /repository/i, /migration/i, /schema/i];

      case 'backend-specialist':
        return [/service/i, /controller/i, /handler/i, /api/i];

      case 'frontend-specialist':
        return [/component/i, /hook/i, /view/i, /page/i, /screen/i];

      default:
        return [/service/i, /controller/i, /index/i];
    }
  }

  private getRelevantSymbolsForAgent(agentType: string, semantics: SemanticContext): ExtractedSymbol[] {
    const { symbols } = semantics;

    switch (agentType) {
      case 'test-writer':
        return [
          ...symbols.functions.filter(s => /test|spec|mock|stub/i.test(s.name)),
          ...symbols.classes.filter(s => /test|spec/i.test(s.name)),
        ];

      case 'code-reviewer':
      case 'refactoring-specialist':
        return [
          ...symbols.classes.filter(s => s.exported),
          ...symbols.interfaces.filter(s => s.exported),
        ];

      case 'documentation-writer':
        return [
          ...symbols.classes.filter(s => s.exported),
          ...symbols.interfaces.filter(s => s.exported),
          ...symbols.functions.filter(s => s.exported),
        ];

      case 'security-auditor':
        return [
          ...symbols.functions.filter(s => /auth|security|crypt|token|password|secret/i.test(s.name)),
          ...symbols.classes.filter(s => /auth|security|guard|policy/i.test(s.name)),
        ];

      case 'performance-optimizer':
        return [
          ...symbols.functions.filter(s => /cache|async|batch|queue|pool/i.test(s.name)),
          ...symbols.classes.filter(s => /cache|pool|buffer|queue/i.test(s.name)),
        ];

      case 'database-specialist':
        return [
          ...symbols.classes.filter(s => /repository|model|entity|schema|migration/i.test(s.name)),
          ...symbols.interfaces.filter(s => /repository|model|entity/i.test(s.name)),
        ];

      case 'backend-specialist':
        return [
          ...symbols.classes.filter(s => /service|controller|handler|middleware/i.test(s.name)),
        ];

      case 'frontend-specialist':
        return [
          ...symbols.functions.filter(s => /^use[A-Z]/i.test(s.name)),
          ...symbols.classes.filter(s => /component|view|page|screen/i.test(s.name)),
        ];

      default:
        return [
          ...symbols.classes.filter(s => s.exported).slice(0, 5),
          ...symbols.interfaces.filter(s => s.exported).slice(0, 5),
        ];
    }
  }
}
