import * as path from 'path';
import * as fs from 'fs-extra';
import inquirer from 'inquirer';

import { colors } from '../../utils/theme';
import { FileMapper } from '../../utils/fileMapper';
import { DocumentationGenerator } from '../../generators/documentation/documentationGenerator';
import { AgentGenerator } from '../../generators/agents/agentGenerator';
import { SkillGenerator } from '../../generators/skills/skillGenerator';
import { StackDetector, classifyProject, getFilteredScaffolds } from '../stack';
import type { CLIInterface } from '../../utils/cliUI';
import type { TranslateFn, TranslationKey } from '../../utils/i18n';
import type { RepoStructure } from '../../types';

export interface InitCommandFlags {
  output?: string;
  include?: string[];
  exclude?: string[];
  verbose?: boolean;
  docsOnly?: boolean;
  agentsOnly?: boolean;
  semantic?: boolean;
  contentStubs?: boolean;
  /** Fill scaffolds with semantic data (no LLM required) */
  autoFill?: boolean;
}

export interface InitServiceDependencies {
  ui: CLIInterface;
  t: TranslateFn;
  version: string;
  documentationGenerator?: DocumentationGenerator;
  agentGenerator?: AgentGenerator;
  fileMapperFactory?: (exclude: string[] | undefined) => FileMapper;
}

interface InitOptions {
  repoPath: string;
  outputDir: string;
  include?: string[];
  exclude?: string[];
  verbose: boolean;
  scaffoldDocs: boolean;
  scaffoldAgents: boolean;
  scaffoldSkills: boolean;
  semantic: boolean;
  includeContentStubs: boolean;
  /** Fill scaffolds with semantic data (no LLM required) */
  autoFill: boolean;
}

export class InitService {
  private readonly ui: CLIInterface;
  private readonly t: TranslateFn;
  private readonly version: string;
  private readonly documentationGenerator: DocumentationGenerator;
  private readonly agentGenerator: AgentGenerator;
  private readonly fileMapperFactory: (exclude: string[] | undefined) => FileMapper;

  constructor(dependencies: InitServiceDependencies) {
    this.ui = dependencies.ui;
    this.t = dependencies.t;
    this.version = dependencies.version;
    this.documentationGenerator = dependencies.documentationGenerator ?? new DocumentationGenerator();
    this.agentGenerator = dependencies.agentGenerator ?? new AgentGenerator();
    this.fileMapperFactory = dependencies.fileMapperFactory ?? ((exclude?: string[]) => new FileMapper(exclude ?? []));
  }

  async run(repoPath: string, type: string, rawOptions: InitCommandFlags): Promise<void> {
    const resolvedType = resolveScaffoldType(type, rawOptions, this.t);

    const options: InitOptions = {
      repoPath: path.resolve(repoPath),
      outputDir: path.resolve(rawOptions.output || './.context'),
      include: rawOptions.include,
      exclude: rawOptions.exclude || [],
      verbose: Boolean(rawOptions.verbose),
      scaffoldDocs: resolvedType === 'docs' || resolvedType === 'both',
      scaffoldAgents: resolvedType === 'agents' || resolvedType === 'both',
      scaffoldSkills: resolvedType === 'both',
      semantic: rawOptions.semantic !== false,
      includeContentStubs: rawOptions.contentStubs !== false,
      autoFill: rawOptions.autoFill ?? false
    };

    if (!options.scaffoldDocs && !options.scaffoldAgents) {
      this.ui.displayWarning(this.t('warnings.scaffold.noneSelected'));
      return;
    }

    await this.ensurePaths(options);
    await this.confirmOverwriteIfNeeded(options);

    this.ui.displayProjectInfo(options.repoPath, options.outputDir, resolvedType);

    const fileMapper = this.fileMapperFactory(options.exclude);

    this.ui.displayStep(1, 3, this.t('steps.init.analyze'));
    this.ui.startSpinner(this.t('spinner.repo.scanning'));

    const repoStructure = await fileMapper.mapRepository(options.repoPath, options.include);
    this.ui.updateSpinner(
      this.t('spinner.repo.scanComplete', {
        fileCount: repoStructure.totalFiles,
        directoryCount: repoStructure.directories.length
      }),
      'success'
    );

    const { docsGenerated, agentsGenerated, skillsGenerated } = await this.generateScaffolds(options, repoStructure);

    this.ui.displayGenerationSummary(docsGenerated, agentsGenerated, skillsGenerated);
    this.ui.displaySuccess(this.t('success.scaffold.ready', { path: colors.accent(options.outputDir) }));
  }

  private async confirmOverwriteIfNeeded(options: InitOptions): Promise<void> {
    const prompts: Array<{ key: 'docs' | 'agents' | 'skills'; path: string }> = [];

    if (options.scaffoldDocs) {
      const docsPath = path.join(options.outputDir, 'docs');
      if (await this.directoryHasContent(docsPath)) {
        prompts.push({ key: 'docs', path: docsPath });
      }
    }

    if (options.scaffoldAgents) {
      const agentsPath = path.join(options.outputDir, 'agents');
      if (await this.directoryHasContent(agentsPath)) {
        prompts.push({ key: 'agents', path: agentsPath });
      }
    }

    if (options.scaffoldSkills) {
      const skillsPath = path.join(options.outputDir, 'skills');
      if (await this.directoryHasContent(skillsPath)) {
        prompts.push({ key: 'skills', path: skillsPath });
      }
    }

    for (const prompt of prompts) {
      const questionKey: TranslationKey = prompt.key === 'docs'
        ? 'prompts.init.confirmOverwriteDocs'
        : prompt.key === 'agents'
        ? 'prompts.init.confirmOverwriteAgents'
        : 'prompts.init.confirmOverwriteSkills';

      const answer = await inquirer.prompt<{ overwrite: boolean }>([
        {
          type: 'confirm',
          name: 'overwrite',
          default: false,
          message: this.t(questionKey, { path: prompt.path })
        }
      ]);

      if (!answer.overwrite) {
        throw new Error(this.t('errors.init.overwriteDeclined'));
      }
    }
  }

  private async directoryHasContent(dirPath: string): Promise<boolean> {
    const exists = await fs.pathExists(dirPath);
    if (!exists) {
      return false;
    }

    const entries = await fs.readdir(dirPath);
    return entries.length > 0;
  }

  private async generateScaffolds(options: InitOptions, repoStructure: RepoStructure): Promise<{ docsGenerated: number; agentsGenerated: number; skillsGenerated: number }> {
    let docsGenerated = 0;
    let agentsGenerated = 0;
    let skillsGenerated = 0;
    let currentStep = 1;
    const totalSteps = (options.scaffoldDocs ? 1 : 0) + (options.scaffoldAgents ? 1 : 0) + (options.scaffoldSkills ? 1 : 0);

    // Detect project type for filtering scaffolds
    let filteredDocs: string[] | undefined;
    let filteredAgents: string[] | undefined;
    try {
      const stackDetector = new StackDetector();
      const stackInfo = await stackDetector.detect(options.repoPath);
      const classification = classifyProject(stackInfo);
      const filtered = getFilteredScaffolds(classification.primaryType);
      filteredDocs = filtered.docs;
      filteredAgents = filtered.agents;
    } catch {
      // If classification fails, use all scaffolds (no filtering)
    }

    if (options.scaffoldDocs) {
      this.ui.displayStep(currentStep, totalSteps, this.t('steps.init.docs'));
      this.ui.startSpinner(options.semantic
        ? this.t('spinner.docs.creatingWithSemantic')
        : this.t('spinner.docs.creating')
      );
      docsGenerated = await this.documentationGenerator.generateDocumentation(
        repoStructure,
        options.outputDir,
        {
          semantic: options.semantic,
          includeContentStubs: options.includeContentStubs,
          autoFill: options.autoFill,
          filteredDocs
        },
        options.verbose
      );
      this.ui.updateSpinner(this.t('spinner.docs.created', { count: docsGenerated }), 'success');
      currentStep++;
    }

    if (options.scaffoldAgents) {
      this.ui.displayStep(currentStep, totalSteps, this.t('steps.init.agents'));
      this.ui.startSpinner(options.semantic
        ? this.t('spinner.agents.creatingWithSemantic')
        : this.t('spinner.agents.creating')
      );
      agentsGenerated = await this.agentGenerator.generateAgentPrompts(
        repoStructure,
        options.outputDir,
        {
          semantic: options.semantic,
          includeContentStubs: options.includeContentStubs,
          autoFill: options.autoFill,
          filteredAgents: filteredAgents as import('../../generators/agents/agentTypes').AgentType[] | undefined
        },
        options.verbose
      );
      this.ui.updateSpinner(this.t('spinner.agents.created', { count: agentsGenerated }), 'success');
      currentStep++;
    }

    if (options.scaffoldSkills) {
      this.ui.displayStep(currentStep, totalSteps, this.t('steps.init.skills'));
      this.ui.startSpinner(this.t('spinner.skills.creating'));
      try {
        const relativeOutputDir = path.relative(options.repoPath, options.outputDir);
        const skillGenerator = new SkillGenerator({
          repoPath: options.repoPath,
          outputDir: relativeOutputDir || '.context',
        });
        const skillResult = await skillGenerator.generate({ force: true });
        skillsGenerated = skillResult.generatedSkills.length;
      } catch {
        // Skills generation is optional, continue if it fails
      }
      this.ui.updateSpinner(this.t('spinner.skills.created', { count: skillsGenerated }), 'success');
    }

    return { docsGenerated, agentsGenerated, skillsGenerated };
  }

  private async ensurePaths(options: InitOptions): Promise<void> {
    const exists = await fs.pathExists(options.repoPath);
    if (!exists) {
      throw new Error(this.t('errors.common.repoMissing', { path: options.repoPath }));
    }

    await fs.ensureDir(options.outputDir);
  }
}

export function resolveScaffoldType(type: string, rawOptions: InitCommandFlags, t: TranslateFn): 'docs' | 'agents' | 'both' {
  const normalized = (type || 'both').toLowerCase();
  const allowed = ['docs', 'agents', 'both'];

  if (!allowed.includes(normalized)) {
    throw new Error(t('errors.init.invalidType', { value: type, allowed: allowed.join(', ') }));
  }

  if (rawOptions.docsOnly) {
    return 'docs';
  }
  if (rawOptions.agentsOnly) {
    return 'agents';
  }

  return normalized as 'docs' | 'agents' | 'both';
}
