import type { PrevcPhase } from '../../domain/workflow';

export type WorkflowGuideIntent =
  | 'session_start'
  | 'pre_edit'
  | 'post_edit'
  | 'session_end'
  | 'explicit';

export type WorkflowGuideFormat = 'compact' | 'full';

export interface HarnessWorkflowGuideInput {
  repoPath?: string;
  phaseHint?: PrevcPhase;
  intent?: WorkflowGuideIntent;
  format?: WorkflowGuideFormat;
}

export interface WorkflowGuideSkillRef {
  slug: string;
  name: string;
  description: string;
  path?: string;
  isBuiltIn?: boolean;
}

export interface WorkflowGuideDecision {
  allow: boolean;
  block?: boolean;
  reason?: string;
  requires?: string[];
}

export interface WorkflowGuideResult {
  workflow: {
    active: boolean;
    name?: string;
    phase?: PrevcPhase;
    scale?: string;
  };
  context: {
    initialized: boolean;
    enabled?: string[];
  };
  nextSteps: string[];
  skills: WorkflowGuideSkillRef[];
  decision: WorkflowGuideDecision;
  excerpt: string;
}
