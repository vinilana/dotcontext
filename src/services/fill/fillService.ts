import * as path from 'path';
import * as fs from 'fs-extra';
import { glob } from 'glob';

import { colors, symbols, typography } from '../../utils/theme';
import {
  removeFrontMatter,
  parseFrontMatter,
  parseScaffoldFrontMatter,
  getDocumentName,
  isScaffoldContent,
} from '../../utils/frontMatter';

import type { CLIInterface } from '../../utils/cliUI';
import type { TranslateFn } from '../../utils/i18n';
import { resolveScaffoldPrompt } from '../../utils/promptLoader';
import { FileMapper } from '../../utils/fileMapper';
import { LLMClientFactory } from '../llmClientFactory';
import { DocumentationAgent } from '../ai/agents/documentationAgent';
import { PlaybookAgent } from '../ai/agents/playbookAgent';
import type { AgentEventCallbacks } from '../ai/agentEvents';
import type { LLMConfig, RepoStructure, UsageStats } from '../../types';
import type { BaseLLMClient } from '../baseLLMClient';
import { resolveLlmConfig } from '../shared/llmConfig';
import type { AgentType as GeneratorAgentType } from '../../generators/agents/agentTypes';
import {
  getScaffoldStructure,
  serializeStructureForAI,
  type ScaffoldStructure,
} from '../../generators/shared/scaffoldStructures';

export interface FillCommandFlags {
  output?: string;
  prompt?: string;
  include?: string[];
  exclude?: string[];
  verbose?: boolean;
  limit?: number;
  model?: string;
  provider?: LLMConfig['provider'];
  apiKey?: string;
  baseUrl?: string;
  useAgents?: boolean;
  /** Use pre-computed semantic context instead of tool-based exploration */
  semantic?: boolean;
  /** Programming languages to analyze (comma-separated or array) */
  languages?: string | string[];
  /** Enable LSP for deeper semantic analysis (off by default for fill) */
  useLsp?: boolean;
}

interface ResolvedFillOptions {
  repoPath: string;
  outputDir: string;
  docsDir: string;
  skillsDir: string;
  agentsDir: string;
  include?: string[];
  exclude?: string[];
  verbose: boolean;
  limit?: number;
  provider: LLMConfig['provider'];
  model: string;
  apiKey: string;
  baseUrl?: string;
  systemPrompt: string;
  useAgents: boolean;
  useSemanticContext: boolean;
  languages: string[];
  useLSP: boolean;
}

interface TargetFile {
  fullPath: string;
  relativePath: string;
  isAgent: boolean;
  content: string;
  /** Document name extracted from frontmatter */
  documentName?: string;
  /** Scaffold structure for AI context (v2 scaffold system) */
  scaffoldStructure?: ScaffoldStructure;
}

interface FillServiceDependencies {
  ui: CLIInterface;
  t: TranslateFn;
  version: string;
  defaultModel: string;
  fileMapperFactory?: (exclude: string[] | undefined) => FileMapper;
  llmClientFactory?: typeof LLMClientFactory;
}

export class FillService {
  private readonly ui: CLIInterface;
  private readonly t: TranslateFn;
  private readonly version: string;
  private readonly defaultModel: string;
  private readonly fileMapperFactory: (exclude: string[] | undefined) => FileMapper;
  private readonly llmClientFactory: typeof LLMClientFactory;

  constructor(dependencies: FillServiceDependencies) {
    this.ui = dependencies.ui;
    this.t = dependencies.t;
    this.version = dependencies.version;
    this.defaultModel = dependencies.defaultModel;
    this.fileMapperFactory = dependencies.fileMapperFactory ?? ((exclude?: string[]) => new FileMapper(exclude ?? []));
    this.llmClientFactory = dependencies.llmClientFactory ?? LLMClientFactory;
  }

  async run(repoPath: string, rawOptions: FillCommandFlags): Promise<void> {
    const resolvedRepo = path.resolve(repoPath);
    const outputDir = path.resolve(rawOptions.output || './.context');
    const docsDir = path.join(outputDir, 'docs');
    const skillsDir = path.join(outputDir, 'skills');
    const agentsDir = path.join(outputDir, 'agents');

    // At least one fillable scaffold directory must exist
    const docsExists = await fs.pathExists(docsDir);
    const skillsExists = await fs.pathExists(skillsDir);
    const agentsExists = await fs.pathExists(agentsDir);

    if (!docsExists && !skillsExists && !agentsExists) {
      throw new Error(this.t('errors.fill.missingScaffold'));
    }

    const llmConfig = await resolveLlmConfig({
      rawOptions: {
        provider: rawOptions.provider,
        model: rawOptions.model,
        apiKey: rawOptions.apiKey,
        baseUrl: rawOptions.baseUrl
      },
      fallbackModel: this.defaultModel,
      t: this.t,
      factory: this.llmClientFactory
    });

    const scaffoldPrompt = await resolveScaffoldPrompt(
      rawOptions.prompt,
      missingPath => this.t('errors.fill.promptMissing', { path: missingPath })
    );

    // Parse languages option
    const parsedLanguages = this.parseLanguages(rawOptions.languages);

    const options: ResolvedFillOptions = {
      repoPath: resolvedRepo,
      outputDir,
      docsDir,
      skillsDir,
      agentsDir,
      include: rawOptions.include,
      exclude: rawOptions.exclude,
      verbose: Boolean(rawOptions.verbose),
      limit: rawOptions.limit,
      provider: llmConfig.provider,
      model: llmConfig.model,
      apiKey: llmConfig.apiKey,
      baseUrl: llmConfig.baseUrl,
      systemPrompt: scaffoldPrompt.content,
      useAgents: rawOptions.useAgents ?? true, // Enable agents by default
      useSemanticContext: rawOptions.semantic !== false, // Semantic mode enabled by default
      languages: parsedLanguages,
      useLSP: Boolean(rawOptions.useLsp) // LSP off by default for fill
    };

    this.displayPromptSource(scaffoldPrompt.path, scaffoldPrompt.source);

    this.ui.displayWelcome(this.version);
    this.ui.displayProjectInfo(options.repoPath, options.outputDir, `fill:${options.provider}`);

    const fileMapper = this.fileMapperFactory(options.exclude);
    this.ui.displayStep(1, 3, this.t('steps.fill.analyze'));
    this.ui.startSpinner(this.t('spinner.repo.scanning'));
    const repoStructure = await fileMapper.mapRepository(options.repoPath, options.include);
    this.ui.updateSpinner(
      this.t('spinner.repo.scanComplete', {
        fileCount: repoStructure.totalFiles,
        directoryCount: repoStructure.directories.length
      }),
      'success'
    );

    const targets = await this.collectTargets(options);
    if (targets.length === 0) {
      this.ui.displayWarning(this.t('warnings.fill.noTargets'));
      return;
    }

    const results: Array<{ file: string; status: 'updated' | 'skipped' | 'failed'; message?: string }> = [];

    this.ui.displayStep(2, 3, this.t('steps.fill.processFiles', { count: targets.length, model: options.model }));

    if (options.useAgents) {
      // Use agents with tool-based analysis and real-time callbacks
      const callbacks = this.ui.createAgentCallbacks();
      const llmConfig: LLMConfig = {
        apiKey: options.apiKey,
        model: options.model,
        provider: options.provider,
        baseUrl: options.baseUrl
      };

      for (const target of targets) {
        const result = await this.processTargetWithAgent(target, llmConfig, options, callbacks);
        results.push(result);
      }
    } else {
      // Use basic LLM client without tool calls
      const llmClient = this.llmClientFactory.createClient({
        apiKey: options.apiKey,
        model: options.model,
        provider: options.provider,
        baseUrl: options.baseUrl
      });
      const contextSummary = this.buildContextSummary(repoStructure);

      for (const target of targets) {
        const result = await this.processTarget(target, llmClient, options, contextSummary);
        results.push(result);
      }
    }

    this.ui.displayStep(3, 3, this.t('steps.fill.summary'));
    this.printLlmSummarySimple(results, options.model);
    this.ui.displaySuccess(this.t('success.fill.completed'));
  }

  private async processTarget(
    target: TargetFile,
    llmClient: BaseLLMClient,
    options: ResolvedFillOptions,
    contextSummary: string
  ): Promise<{ file: string; status: 'updated' | 'skipped' | 'failed'; message?: string }> {
    this.ui.startSpinner(this.t('spinner.fill.processing', { path: target.relativePath }));

    try {
      const userPrompt = this.buildUserPrompt(target.relativePath, target.content, contextSummary, target.isAgent);
      const updatedContent = await llmClient.generateText(userPrompt, options.systemPrompt);

      if (!updatedContent || !updatedContent.trim()) {
        this.ui.updateSpinner(this.t('spinner.fill.noContent', { path: target.relativePath }), 'warn');
        return { file: target.relativePath, status: 'skipped', message: this.t('messages.fill.emptyResponse') };
      }

      // Remove front matter from filled content (status: unfilled marker)
      const cleanContent = removeFrontMatter(updatedContent);
      await fs.writeFile(target.fullPath, this.ensureTrailingNewline(cleanContent));
      this.ui.updateSpinner(this.t('spinner.fill.updated', { path: target.relativePath }), 'success');
      return { file: target.relativePath, status: 'updated' };
    } catch (error) {
      this.ui.updateSpinner(this.t('spinner.fill.failed', { path: target.relativePath }), 'fail');
      return {
        file: target.relativePath,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async processTargetWithAgent(
    target: TargetFile,
    llmConfig: LLMConfig,
    options: ResolvedFillOptions,
    callbacks: AgentEventCallbacks
  ): Promise<{ file: string; status: 'updated' | 'skipped' | 'failed'; message?: string }> {
    console.log(''); // Add spacing before agent output

    try {
      let updatedContent: string;

      // Serialize scaffold structure for AI context (if available)
      const structureContext = target.scaffoldStructure
        ? serializeStructureForAI(target.scaffoldStructure)
        : undefined;

      if (target.isAgent) {
        // Use PlaybookAgent for agent files
        const agentType = this.extractAgentTypeFromPath(target.relativePath);
        const playbookAgent = new PlaybookAgent(llmConfig);
        const result = await playbookAgent.generatePlaybook({
          repoPath: options.repoPath,
          agentType,
          existingContext: target.content,
          callbacks,
          useSemanticContext: options.useSemanticContext,
          useLSP: options.useLSP,
          scaffoldStructure: structureContext,
        });
        updatedContent = result.text;
      } else {
        // Use DocumentationAgent for documentation files
        const documentationAgent = new DocumentationAgent(llmConfig);
        const result = await documentationAgent.generateDocumentation({
          repoPath: options.repoPath,
          targetFile: target.relativePath,
          context: target.content,
          callbacks,
          useSemanticContext: options.useSemanticContext,
          useLSP: options.useLSP,
          scaffoldStructure: structureContext,
        });
        updatedContent = result.text;
      }

      if (!updatedContent || !updatedContent.trim()) {
        console.log(''); // Spacing after agent output
        this.ui.displayWarning(this.t('spinner.fill.noContent', { path: target.relativePath }));
        return { file: target.relativePath, status: 'skipped', message: this.t('messages.fill.emptyResponse') };
      }

      // Remove front matter from filled content (status: unfilled marker)
      const cleanContent = removeFrontMatter(updatedContent);
      await fs.writeFile(target.fullPath, this.ensureTrailingNewline(cleanContent));
      console.log(''); // Spacing after agent output
      this.ui.displaySuccess(this.t('spinner.fill.updated', { path: target.relativePath }));
      return { file: target.relativePath, status: 'updated' };
    } catch (error) {
      console.log(''); // Spacing after agent output
      this.ui.displayError(this.t('spinner.fill.failed', { path: target.relativePath }), error as Error);
      return {
        file: target.relativePath,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private extractAgentTypeFromPath(relativePath: string): GeneratorAgentType {
    // Extract agent type from path like "agents/code-reviewer.md"
    const filename = path.basename(relativePath, '.md');
    // Map common filenames to agent types
    const agentTypeMap: Record<string, GeneratorAgentType> = {
      'code-reviewer': 'code-reviewer',
      'bug-fixer': 'bug-fixer',
      'feature-developer': 'feature-developer',
      'refactoring-specialist': 'refactoring-specialist',
      'test-writer': 'test-writer',
      'documentation-writer': 'documentation-writer',
      'performance-optimizer': 'performance-optimizer',
      'security-auditor': 'security-auditor',
      'backend-specialist': 'backend-specialist',
      'frontend-specialist': 'frontend-specialist',
      'architect-specialist': 'architect-specialist',
      'devops-specialist': 'devops-specialist',
      'database-specialist': 'database-specialist',
      'mobile-specialist': 'mobile-specialist'
    };
    return agentTypeMap[filename] || 'feature-developer';
  }

  private async collectTargets(options: ResolvedFillOptions): Promise<TargetFile[]> {
    // Only glob directories that exist
    const docFiles = (await fs.pathExists(options.docsDir))
      ? await glob('**/*.md', { cwd: options.docsDir, absolute: true })
      : [];
    const skillFiles = (await fs.pathExists(options.skillsDir))
      ? await glob('**/*.md', { cwd: options.skillsDir, absolute: true })
      : [];
    const agentFiles = (await fs.pathExists(options.agentsDir))
      ? await glob('**/*.md', { cwd: options.agentsDir, absolute: true })
      : [];
    const candidates = [...docFiles, ...skillFiles, ...agentFiles];

    const targets: TargetFile[] = [];

    for (const fullPath of candidates) {
      const content = await fs.readFile(fullPath, 'utf-8');
      const isAgent = fullPath.includes(`${path.sep}agents${path.sep}`);
      const relativePath = path.relative(options.outputDir, fullPath);

      // Extract document name from frontmatter and load scaffold structure
      const documentName = getDocumentName(content);
      let scaffoldStructure: ScaffoldStructure | undefined;

      if (documentName) {
        scaffoldStructure = getScaffoldStructure(documentName);
      }

      // For agents, try to extract from filename if not in frontmatter
      if (!documentName && isAgent) {
        const filename = path.basename(fullPath, '.md');
        if (filename !== 'README') {
          scaffoldStructure = getScaffoldStructure(filename);
        }
      }

      targets.push({
        fullPath,
        relativePath,
        isAgent,
        content,
        documentName: documentName || undefined,
        scaffoldStructure,
      });

      if (options.limit && targets.length >= options.limit) {
        break;
      }
    }

    return targets;
  }

  private displayPromptSource(promptPath: string | undefined, source: 'custom' | 'package' | 'builtin'): void {
    if (source === 'custom' && promptPath) {
      this.ui.displayInfo(
        this.t('info.prompt.title'),
        this.t('info.prompt.usingCustom', { path: this.displayablePath(promptPath) })
      );
      return;
    }

    if (source === 'package' && promptPath) {
      this.ui.displayInfo(
        this.t('info.prompt.title'),
        this.t('info.prompt.usingPackage', { path: this.displayablePath(promptPath) })
      );
      return;
    }

    this.ui.displayInfo(this.t('info.prompt.title'), this.t('info.prompt.usingBundled'));
  }

  private displayablePath(promptPath: string): string {
    const relative = path.relative(process.cwd(), promptPath);
    return relative || promptPath;
  }

  private async ensureDirectoryExists(dir: string, message: string): Promise<void> {
    const exists = await fs.pathExists(dir);
    if (!exists) {
      throw new Error(message);
    }
  }

  private buildContextSummary(repoStructure: RepoStructure): string {
    const directories = new Set<string>();
    repoStructure.directories.forEach(dir => {
      const [first] = dir.relativePath.split(/[\\/]/).filter(Boolean);
      if (first) {
        directories.add(first);
      }
    });

    const topDirs = Array.from(directories).sort().slice(0, 12);
    const totalSizeMb = (repoStructure.totalSize / (1024 * 1024)).toFixed(2);

    return [
      `Top-level directories: ${topDirs.length ? topDirs.join(', ') : 'n/a'}`,
      `Total files scanned: ${repoStructure.totalFiles}`,
      `Repository size (approx.): ${totalSizeMb} MB`
    ].join('\n');
  }

  private buildUserPrompt(relativePath: string, currentContent: string, contextSummary: string, isAgent: boolean): string {
    const guidance: string[] = [
      '- Replace TODOs with concrete information based on the repository context.',
      '- Return only the full updated Markdown for this file.'
    ];

    if (isAgent) {
      guidance.push('- Keep agent responsibilities and best practices aligned with the latest docs.');
    } else {
      guidance.push('- Maintain accurate cross-links between docs and referenced resources.');
    }

    return [
      `Target file: ${relativePath}`,
      'Repository summary:',
      contextSummary,
      '',
      'Guidance:',
      ...guidance,
      '',
      'Current content:',
      '<file>',
      currentContent,
      '</file>'
    ].join('\n');
  }

  private printLlmSummarySimple(
    results: Array<{ file: string; status: 'updated' | 'skipped' | 'failed'; message?: string }>,
    model: string
  ): void {
    const updated = results.filter(result => result.status === 'updated').length;
    const skipped = results.filter(result => result.status === 'skipped').length;
    const failed = results.filter(result => result.status === 'failed');

    console.log('');
    console.log(typography.separator());
    console.log(typography.header('LLM Fill Summary'));
    console.log('');
    console.log(typography.labeledValue('Updated', updated.toString()));
    console.log(typography.labeledValue('Skipped', skipped.toString()));
    console.log(typography.labeledValue('Failed', failed.length.toString()));
    console.log(typography.labeledValue('Model', model));

    if (failed.length > 0) {
      console.log('');
      failed.forEach(item => {
        console.log(`  ${colors.error(symbols.error)} ${colors.primary(item.file)}`);
        if (item.message) {
          console.log(`    ${colors.secondaryDim(item.message)}`);
        }
      });
    }
    console.log('');
  }

  private ensureTrailingNewline(content: string): string {
    return content.endsWith('\n') ? content : `${content}\n`;
  }

  private parseLanguages(input?: string | string[]): string[] {
    if (!input) {
      return ['typescript', 'javascript', 'python']; // Default languages
    }

    if (Array.isArray(input)) {
      return input.map(lang => lang.trim().toLowerCase()).filter(Boolean);
    }

    // Parse comma-separated string
    return input.split(',').map(lang => lang.trim().toLowerCase()).filter(Boolean);
  }
}
