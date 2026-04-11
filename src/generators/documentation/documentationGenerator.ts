import * as path from 'path';
import * as fs from 'fs-extra';
import { RepoStructure } from '../../types';
import { GeneratorUtils } from '../shared';
import {
  DocumentationTemplateContext,
  GuideMeta,
  renderIndex,
} from './templates';
import { getGuidesByKeys, DOCUMENT_GUIDES } from './guideRegistry';
import { CodebaseAnalyzer, SemanticContext, SemanticSnapshotService } from '../../services/semantic';
import { StackDetector } from '../../services/stack';
import {
  createDocFrontmatter,
  serializeFrontmatter,
  DocScaffoldFrontmatter,
} from '../../types/scaffoldFrontmatter';
import { getScaffoldStructure, ScaffoldStructure, serializeStructureAsMarkdown } from '../shared/scaffoldStructures';
import { AutoFillService, AutoFillContext } from '../../services/autoFill';

/**
 * Category mapping from document name to frontmatter category.
 * Using SCAFFOLD_STRUCTURES as single source of truth for descriptions/titles.
 */
const DOC_CATEGORY_MAP: Record<string, DocScaffoldFrontmatter['category']> = {
  'project-overview': 'overview',
  'architecture': 'architecture',
  'development-workflow': 'workflow',
  'testing-strategy': 'testing',
  'glossary': 'glossary',
  'data-flow': 'data-flow',
  'security': 'security',
  'tooling': 'tooling',
};

/**
 * Get document info from scaffold structure (single source of truth)
 */
function getDocInfo(key: string): { title: string; description: string; category: DocScaffoldFrontmatter['category'] } | undefined {
  const structure = getScaffoldStructure(key);
  if (!structure || structure.fileType !== 'doc') {
    return undefined;
  }
  return {
    title: structure.title,
    description: structure.description,
    category: DOC_CATEGORY_MAP[key],
  };
}

interface DocumentationGenerationConfig {
  selectedDocs?: string[];
  semantic?: boolean;
  /** Filtered list of docs based on project type classification */
  filteredDocs?: string[];
  /** Include section headings and guidance in scaffolds (CLI mode) */
  includeContentStubs?: boolean;
  /** Fill scaffolds with semantic data (no LLM required) */
  autoFill?: boolean;
}

export class DocumentationGenerator {
  private analyzer?: CodebaseAnalyzer;

  constructor(..._legacyArgs: unknown[]) {}

  async generateDocumentation(
    repoStructure: RepoStructure,
    outputDir: string,
    config: DocumentationGenerationConfig = {},
    verbose: boolean = false
  ): Promise<number> {
    const docsDir = path.join(outputDir, 'docs');
    await GeneratorUtils.ensureDirectoryAndLog(docsDir, verbose, 'Generating documentation scaffold in');
    const snapshotService = config.semantic ? new SemanticSnapshotService() : null;

    // Perform semantic analysis if enabled
    let semantics: SemanticContext | undefined;
    let snapshotFingerprint: string | undefined;
    if (config.semantic) {
      GeneratorUtils.logProgress('Running semantic analysis...', verbose);
      this.analyzer = new CodebaseAnalyzer();
      try {
        snapshotFingerprint = await snapshotService!.captureRepoFingerprint(repoStructure.rootPath);
        semantics = await this.analyzer.analyze(repoStructure.rootPath);
        GeneratorUtils.logProgress(
          `Analyzed ${semantics.stats.totalFiles} files, found ${semantics.stats.totalSymbols} symbols in ${semantics.stats.analysisTimeMs}ms`,
          verbose
        );
      } catch (error) {
        GeneratorUtils.logError('Semantic analysis failed, continuing without it', error, verbose);
      }
    }

    // Detect stack info for codebase map and autoFill
    let stackInfo;
    if (semantics || config.autoFill) {
      try {
        const stackDetector = new StackDetector();
        stackInfo = await stackDetector.detect(repoStructure.rootPath);
      } catch (error) {
        GeneratorUtils.logError('Stack detection failed, continuing without it', error, verbose);
      }
    }

    // Persist semantic snapshot and publish docs/codebase-map.json from it
    if (semantics) {
      try {
        GeneratorUtils.logProgress('Persisting semantic snapshot...', verbose);
        const snapshot = await snapshotService!.writeSnapshot(repoStructure, {
          outputDir,
          semantics,
          stackInfo,
          repoFingerprint: snapshotFingerprint,
        });

        GeneratorUtils.logProgress(
          `Created semantic snapshot and published summary at ${path.relative(outputDir, snapshot.publishedSummaryPath)}`,
          verbose
        );
      } catch (error) {
        GeneratorUtils.logError('Semantic snapshot generation failed, continuing without it', error, verbose);
      }
    }

    // Prioritize explicitly selected docs, then filtered by project type
    const docKeys = config.selectedDocs ?? config.filteredDocs;
    const guidesToGenerate = getGuidesByKeys(docKeys);
    const context = this.buildContext(repoStructure, guidesToGenerate, semantics);

    let created = 0;

    // Generate README.md index (still uses template rendering for summary)
    const readmePath = path.join(docsDir, 'README.md');
    const readmeContent = renderIndex(context);
    await GeneratorUtils.writeFileWithLogging(readmePath, readmeContent, verbose, 'Created README.md');
    created += 1;

    // Generate frontmatter-only files for each guide (scaffold v2)
    for (const guide of guidesToGenerate) {
      const docInfo = getDocInfo(guide.key);
      if (!docInfo) {
        continue;
      }

      const filename = `${guide.key}.md`;
      const targetPath = path.join(docsDir, filename);
      const frontmatter = createDocFrontmatter(
        guide.key,
        docInfo.description,
        docInfo.category
      );
      let content = serializeFrontmatter(frontmatter) + '\n';

      // Add content based on mode
      const structure = getScaffoldStructure(guide.key);
      if (structure) {
        if (config.autoFill && semantics) {
          // AutoFill: generate content from semantic analysis (no LLM needed)
          const autoFillService = new AutoFillService();
          const autoFillContext: AutoFillContext = {
            semantics,
            stackInfo,
            repoPath: repoStructure.rootPath,
            topLevelDirectories: context.topLevelDirectories
          };
          content += autoFillService.fillDocumentation(guide.key, structure, autoFillContext);
        } else if (config.includeContentStubs) {
          // Content stubs: section headings with guidance comments
          content += serializeStructureAsMarkdown(structure);
        }
      }

      await GeneratorUtils.writeFileWithLogging(targetPath, content, verbose, `Created ${filename}`);
      created += 1;
    }

    await this.updateAgentGuideReferences(repoStructure, verbose);

    return created;
  }

  private buildContext(
    repoStructure: RepoStructure,
    guides: GuideMeta[],
    semantics?: SemanticContext
  ): DocumentationTemplateContext {
    const topLevelStats = repoStructure.topLevelDirectoryStats ?? [];
    const topLevelDirectories = topLevelStats.length
      ? topLevelStats.map(stat => stat.name)
      : this.deriveTopLevelDirectories(repoStructure);

    const directoryStats = topLevelStats.length
      ? topLevelStats.map(stat => ({ name: stat.name, fileCount: stat.fileCount }))
      : topLevelDirectories.map(name => ({
          name,
          fileCount: repoStructure.files.filter(file => file.relativePath.startsWith(`${name}/`)).length
        }));
    const primaryLanguages = GeneratorUtils.getTopFileExtensions(repoStructure, 5)
      .filter(([ext]) => !!ext)
      .map(([extension, count]) => ({ extension, count }));

    return {
      repoStructure,
      topLevelDirectories,
      primaryLanguages,
      directoryStats,
      guides,
      semantics
    };
  }

  private deriveTopLevelDirectories(repoStructure: RepoStructure): string[] {
    const directorySet = new Set<string>();
    repoStructure.directories.forEach(dir => {
      const [firstSegment] = dir.relativePath.split(/[\\/]/).filter(Boolean);
      if (firstSegment) {
        directorySet.add(firstSegment);
      }
    });
    return Array.from(directorySet).sort();
  }

  private async updateAgentGuideReferences(repoStructure: RepoStructure, verbose: boolean): Promise<void> {
    const repoRoot = repoStructure.rootPath;
    const agentGuidePath = path.join(repoRoot, 'AGENTS.md');

    try {
      const exists = await fs.pathExists(agentGuidePath);
      if (!exists) {
        const template = this.createDefaultAgentGuide(repoStructure);
        await fs.writeFile(agentGuidePath, template, 'utf-8');
        GeneratorUtils.logProgress('Created AGENTS.md using the agents.md example starter.', verbose);
        return;
      }

      const content = await fs.readFile(agentGuidePath, 'utf-8');
      const docsReference = '.context/docs/README.md';
      const agentsReference = '.context/agents/README.md';

      if (content.includes(docsReference) && content.includes(agentsReference)) {
        return;
      }

      const referencesBlock = `\n## AI Context References\n- Documentation index: \`${docsReference}\`\n- Agent playbooks: \`${agentsReference}\`\n`;
      const updatedContent = `${content.trimEnd()}${referencesBlock}\n`;

      await fs.writeFile(agentGuidePath, updatedContent, 'utf-8');

      GeneratorUtils.logProgress('Linked AGENTS.md to generated docs and agent indexes.', verbose);
    } catch (error) {
      GeneratorUtils.logError('Failed to update AGENTS.md with documentation references', error, verbose);
    }
  }

  private createDefaultAgentGuide(repoStructure: RepoStructure): string {
    const directories = (repoStructure.topLevelDirectoryStats?.length
      ? repoStructure.topLevelDirectoryStats.map(stat => stat.name)
      : this.deriveTopLevelDirectories(repoStructure)
    ).filter(Boolean);

    const directorySection = directories.length
      ? directories
          .slice(0, 8)
          .map(dir => `- \`${dir}/\` — explain what lives here and when agents should edit it.`)
          .join('\n')
      : '- Document the major directories so agents know where to work.';

    return `# AGENTS.md

## Dev environment tips
- Install dependencies with \`npm install\` before running scaffolds.
- Use \`npm run dev\` for the interactive TypeScript session that powers local experimentation.
- Run \`npm run build\` to refresh the CommonJS bundle in \`dist/\` before shipping changes.
- Store generated artefacts in \`.context/\` so reruns stay deterministic.

## Testing instructions
- Execute \`npm run test\` to run the Jest suite.
- Append \`-- --watch\` while iterating on a failing spec.
- Trigger \`npm run build && npm run test\` before opening a PR to mimic CI.
- Add or update tests alongside any generator or CLI changes.

## PR instructions
- Follow Conventional Commits (for example, \`feat(scaffolding): add doc links\`).
- Cross-link new scaffolds in \`docs/README.md\` and \`agents/README.md\` so future agents can find them.
- Attach sample CLI output or generated markdown when behaviour shifts.
- Confirm the built artefacts in \`dist/\` match the new source changes.

## Repository map
${directorySection}

## AI Context References
- Documentation index: \`.context/docs/README.md\`
- Agent playbooks: \`.context/agents/README.md\`
- Contributor guide: \`CONTRIBUTING.md\`
`;
  }
}
