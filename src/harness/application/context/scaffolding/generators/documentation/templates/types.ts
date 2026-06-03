import { RepoStructure } from '../../../../../../../types';
import { SemanticContext } from '../../../../../../adapters/out/semantic';

export interface GuideMeta {
  key: string;
  title: string;
  file: string;
  primaryInputs: string;
}

export interface DirectoryStat {
  name: string;
  fileCount: number;
}

export interface DocumentationTemplateContext {
  repoStructure: RepoStructure;
  topLevelDirectories: string[];
  primaryLanguages: Array<{ extension: string; count: number }>;
  directoryStats: DirectoryStat[];
  guides: GuideMeta[];
  semantics?: SemanticContext;
}
