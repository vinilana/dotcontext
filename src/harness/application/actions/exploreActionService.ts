import {
  analyzeSymbolsTool,
  getFileStructureTool,
  listFilesTool,
  readFileTool,
  searchCodeTool,
} from '../context/contextTools';

export type HarnessExploreAction = 'read' | 'list' | 'analyze' | 'search' | 'getStructure';

export interface HarnessExploreActionInput {
  action: HarnessExploreAction;
  filePath?: string;
  pattern?: string;
  cwd?: string;
  encoding?: 'utf-8' | 'ascii' | 'binary';
  ignore?: string[];
  symbolTypes?: Array<'class' | 'interface' | 'function' | 'type' | 'enum'>;
  fileGlob?: string;
  maxResults?: number;
  rootPath?: string;
  maxDepth?: number;
  includePatterns?: string[];
}

export type HarnessExploreActionResult = Record<string, unknown>;

export interface HarnessExploreActionServiceOptions {
  repoPath: string;
}

export class HarnessExploreActionService {
  constructor(private readonly options: HarnessExploreActionServiceOptions) {}

  async execute(params: HarnessExploreActionInput): Promise<HarnessExploreActionResult> {
    switch (params.action) {
      case 'read':
        return readFileTool.execute({
          filePath: params.filePath!,
          encoding: params.encoding,
        });
      case 'list':
        return listFilesTool.execute({
          pattern: params.pattern!,
          cwd: params.cwd || this.options.repoPath,
          ignore: params.ignore,
        });
      case 'analyze':
        return analyzeSymbolsTool.execute({
          filePath: params.filePath!,
          symbolTypes: params.symbolTypes,
        });
      case 'search':
        return searchCodeTool.execute({
          pattern: params.pattern!,
          fileGlob: params.fileGlob,
          maxResults: params.maxResults || 50,
          cwd: params.cwd || this.options.repoPath,
        });
      case 'getStructure':
        return getFileStructureTool.execute({
          rootPath: params.rootPath || this.options.repoPath || '.',
          maxDepth: params.maxDepth ?? 3,
          includePatterns: params.includePatterns,
        });
      default:
        throw new Error(`Unknown explore action: ${(params as HarnessExploreActionInput).action}`);
    }
  }
}
