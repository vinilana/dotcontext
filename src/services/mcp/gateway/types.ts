/**
 * Gateway Tool Types
 *
 * Type definitions for MCP gateway tool parameters and responses.
 *
 * Note: Some gateways use dedicated tools instead of action-based routing:
 * - Workflow: Split into workflow-init, workflow-status, workflow-advance, workflow-manage
 * - Project: Removed - use context init + workflow-init instead
 */

import type { PrevcPhase, PrevcRole, AgentType } from '../../../workflow';

// Action types for each gateway
// Note: Workflow uses dedicated tools (workflow-init, workflow-status, workflow-advance, workflow-manage)
// Note: Project tools removed - use context init + workflow-init instead
export type ExploreAction = 'read' | 'list' | 'analyze' | 'search' | 'getStructure';
export type ContextAction = 'check' | 'init' | 'fill' | 'fillSingle' | 'listToFill' | 'getMap' | 'buildSemantic' | 'scaffoldPlan' | 'searchQA' | 'generateQA' | 'getFlow' | 'detectPatterns';
export type SyncAction = 'exportRules' | 'exportDocs' | 'exportAgents' | 'exportContext' | 'exportSkills' | 'reverseSync' | 'importDocs' | 'importAgents' | 'importSkills';
export type PlanAction = 'link' | 'getLinked' | 'getDetails' | 'getForPhase' | 'updatePhase' | 'recordDecision' | 'updateStep' | 'getStatus' | 'syncMarkdown' | 'commitPhase';
export type AgentAction = 'discover' | 'getInfo' | 'orchestrate' | 'getSequence' | 'getDocs' | 'getPhaseDocs' | 'listTypes';
export type SkillAction = 'list' | 'getContent' | 'getForPhase' | 'scaffold' | 'export' | 'fill';

// Parameter interfaces for each gateway
export interface ExploreParams {
  action: ExploreAction;
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

export interface ContextParams {
  action: ContextAction;
  repoPath?: string;
  outputDir?: string;
  type?: 'docs' | 'agents' | 'both';
  semantic?: boolean;
  include?: string[];
  exclude?: string[];
  autoFill?: boolean;
  skipContentGeneration?: boolean;
  target?: 'docs' | 'skills' | 'agents' | 'plans' | 'all';
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
  // Q&A and flow parameters
  query?: string;
  entryFile?: string;
  entryFunction?: string;
}

// Note: WorkflowParams removed - workflow uses dedicated tools with their own param types
// Note: ProjectParams removed - project tools have been removed from MCP

export interface SyncParams {
  action: SyncAction;
  preset?: string;
  force?: boolean;
  dryRun?: boolean;
  indexMode?: 'readme' | 'all';
  mode?: 'symlink' | 'markdown';
  skipDocs?: boolean;
  skipAgents?: boolean;
  skipSkills?: boolean;
  skipRules?: boolean;
  docsIndexMode?: 'readme' | 'all';
  agentMode?: 'symlink' | 'markdown';
  includeBuiltInSkills?: boolean;
  mergeStrategy?: 'skip' | 'overwrite' | 'merge' | 'rename';
  autoDetect?: boolean;
  addMetadata?: boolean;
  repoPath?: string;
  includeBuiltIn?: boolean;
}

export interface PlanParams {
  action: PlanAction;
  planSlug?: string;
  phaseId?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'skipped';
  phase?: PrevcPhase;
  title?: string;
  description?: string;
  alternatives?: string[];
  stepIndex?: number;
  output?: string;
  notes?: string;
  // commitPhase action parameters
  coAuthor?: string;
  stagePatterns?: string[];
  dryRun?: boolean;
}

export interface AgentParams {
  action: AgentAction;
  agentType?: string;
  task?: string;
  phase?: PrevcPhase;
  role?: PrevcRole;
  includeReview?: boolean;
  phases?: PrevcPhase[];
  agent?: AgentType;
}

export interface SkillParams {
  action: SkillAction;
  skillSlug?: string;
  phase?: PrevcPhase;
  skills?: string[];
  includeContent?: boolean;
  includeBuiltIn?: boolean;
  preset?: 'claude' | 'gemini' | 'codex' | 'antigravity' | 'all';
}
