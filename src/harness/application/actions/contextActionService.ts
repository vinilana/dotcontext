import { SemanticContextBuilder } from '../../adapters/out/semantic/contextBuilder';

import {
  HarnessContextService,
  type HarnessContextInitResult,
  type HarnessContextPlanScaffoldResult,
} from '../context/contextService';

type ScaffoldOptions = NonNullable<HarnessContextInitResult['scaffold']>;

export type HarnessContextAction =
  | 'check'
  | 'bootstrapStatus'
  | 'init'
  | 'fill'
  | 'fillSingle'
  | 'listToFill'
  | 'getMap'
  | 'buildSemantic'
  | 'scaffoldPlan'
  | 'searchQA'
  | 'generateQA'
  | 'getFlow'
  | 'detectPatterns';

export interface HarnessContextActionInput {
  action: HarnessContextAction;
  repoPath?: string;
  outputDir?: string;
  type?: 'docs' | 'agents' | 'both';
  semantic?: boolean;
  include?: string[];
  exclude?: string[];
  autoFill?: boolean;
  skipContentGeneration?: boolean;
  generateQA?: boolean;
  target?: 'docs' | 'agents' | 'skills' | 'plans' | 'sensors' | 'all';
  offset?: number;
  limit?: number;
  filePath?: string;
  section?: string;
  contextType?: 'documentation' | 'playbook' | 'plan' | 'compact';
  targetFile?: string;
  options?: {
    useLSP?: boolean;
    maxContextLength?: number;
    includeDocumentation?: boolean;
    includeSignatures?: boolean;
  };
  planName?: string;
  title?: string;
  summary?: string;
  query?: string;
  entryFile?: string;
  entryFunction?: string;
}

export type HarnessContextActionResult =
  | {
      kind: 'json';
      data: unknown;
    }
  | {
      kind: 'text';
      text: string;
    }
  | {
      kind: 'scaffold';
      data: Record<string, unknown>;
      scaffold: ScaffoldOptions;
    };

export interface HarnessContextActionServiceOptions {
  repoPath: string;
  contextBuilder?: SemanticContextBuilder;
  contextService?: HarnessContextService;
}

export class HarnessContextActionService {
  private readonly contextService: HarnessContextService;
  private readonly repoPath: string;

  constructor(options: HarnessContextActionServiceOptions) {
    this.repoPath = options.repoPath;
    this.contextService = options.contextService
      ?? new HarnessContextService({
        repoPath: options.repoPath,
        contextBuilder: options.contextBuilder ?? new SemanticContextBuilder(),
      });
  }

  async execute(params: HarnessContextActionInput): Promise<HarnessContextActionResult> {
    const repoPath = params.repoPath || this.repoPath;

    switch (params.action) {
      case 'check':
        return {
          kind: 'json',
          data: await this.contextService.check(repoPath),
        };
      case 'bootstrapStatus':
        return {
          kind: 'json',
          data: await this.contextService.bootstrapStatus(repoPath),
        };
      case 'init': {
        const { result, scaffold } = await this.contextService.init({
          repoPath,
          type: params.type,
          outputDir: params.outputDir,
          semantic: params.semantic,
          include: params.include,
          exclude: params.exclude,
          autoFill: params.autoFill,
          skipContentGeneration: params.skipContentGeneration,
          generateQA: params.generateQA,
        });
        return {
          kind: 'scaffold',
          data: result,
          scaffold: scaffold || {},
        };
      }
      case 'fill':
        return {
          kind: 'json',
          data: await this.contextService.fill({
            repoPath,
            outputDir: params.outputDir,
            target: params.target,
            offset: params.offset,
            limit: params.limit,
          }),
        };
      case 'fillSingle':
        return {
          kind: 'json',
          data: await this.contextService.fillSingle({
            repoPath,
            filePath: params.filePath!,
          }),
        };
      case 'listToFill':
        return {
          kind: 'json',
          data: await this.contextService.listToFill({
            repoPath,
            outputDir: params.outputDir,
            target: params.target,
          }),
        };
      case 'getMap':
        return {
          kind: 'json',
          data: await this.contextService.getMap({
            repoPath,
            section: params.section,
          }),
        };
      case 'buildSemantic':
        return {
          kind: 'text',
          text: await this.contextService.buildSemantic({
            repoPath,
            contextType: params.contextType,
            targetFile: params.targetFile,
            options: params.options,
          }),
        };
      case 'scaffoldPlan': {
        const { result, scaffold }: HarnessContextPlanScaffoldResult =
          await this.contextService.scaffoldPlan({
            planName: params.planName!,
            repoPath,
            outputDir: params.outputDir,
            title: params.title,
            summary: params.summary,
            semantic: params.semantic,
            autoFill: params.autoFill,
          });

        return scaffold
          ? {
              kind: 'scaffold',
              data: result,
              scaffold,
            }
          : {
              kind: 'json',
              data: result,
            };
      }
      case 'searchQA':
        if (!params.query) {
          throw new Error('Query is required for searchQA action');
        }

        return {
          kind: 'json',
          data: await this.contextService.searchQA({
            repoPath,
            query: params.query,
            options: params.options,
          }),
        };
      case 'generateQA':
        return {
          kind: 'json',
          data: await this.contextService.generateQA({
            repoPath,
            options: params.options,
          }),
        };
      case 'getFlow':
        if (!params.entryFile) {
          throw new Error('entryFile is required for getFlow action');
        }

        return {
          kind: 'json',
          data: await this.contextService.getFlow({
            repoPath,
            entryFile: params.entryFile,
            entryFunction: params.entryFunction,
            options: params.options,
          }),
        };
      case 'detectPatterns':
        return {
          kind: 'json',
          data: await this.contextService.detectPatterns({
            repoPath,
            options: params.options,
          }),
        };
      default:
        throw new Error(`Unknown context action: ${(params as HarnessContextActionInput).action}`);
    }
  }

}
