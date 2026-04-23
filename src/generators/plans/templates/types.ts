import { AgentType } from '../../agents/agentTypes';
import { GuideMeta } from '../../documentation/templates/types';
import { SemanticContext } from '../../../services/semantic';
import type { PhaseRequirementSuggestions } from '../../../workflow/plans/scaffoldSuggestions';

export interface PlanAgentSummary {
  type: AgentType;
  title: string;
  responsibility: string;
}

export interface CodebaseSnapshot {
  totalFiles: number;
  totalSymbols: number;
  layers: string[];
  patterns: string[];
  entryPoints: string[];
}

export interface PlanTemplateContext {
  title: string;
  slug: string;
  summary?: string;
  agents: PlanAgentSummary[];
  docs: GuideMeta[];
  semantics?: SemanticContext;
  codebaseSnapshot?: CodebaseSnapshot;
  phaseSuggestions?: PhaseRequirementSuggestions;
}

export interface PlanIndexEntry {
  slug: string;
  title: string;
}
