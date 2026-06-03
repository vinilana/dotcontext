import { AgentType } from '../agentTypes';
import { SemanticContext } from '../../../../../../adapters/out/semantic';

export interface DocTouchpoint {
  title: string;
  path: string;
}

export interface KeySymbolInfo {
  name: string;
  kind: string;
  file: string;
  line: number;
}

export interface AgentTemplateContext {
  agentType: AgentType;
  topLevelDirectories: string[];
  docTouchpoints: DocTouchpoint[];
  responsibilities: string[];
  bestPractices: string[];
  semantics?: SemanticContext;
  relevantSymbols?: KeySymbolInfo[];
}
