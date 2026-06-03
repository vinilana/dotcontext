/**
 * Scaffold structures registry and lookup functions
 */

import { ScaffoldFileType } from '../../../../../../../types/scaffoldFrontmatter';
import { ScaffoldStructure } from './types';
import * as docStructures from './documentation';
import * as agentStructures from './agents';
import * as skillStructures from './skills';
import { planStructure } from './plans';

/**
 * All scaffold structures indexed by document name
 */
export const SCAFFOLD_STRUCTURES: Record<string, ScaffoldStructure> = {
  // Documentation
  'project-overview': docStructures.projectOverviewStructure,
  'architecture': docStructures.architectureStructure,
  'development-workflow': docStructures.developmentWorkflowStructure,
  'testing-strategy': docStructures.testingStrategyStructure,
  'tooling': docStructures.toolingStructure,
  'security': docStructures.securityStructure,
  'glossary': docStructures.glossaryStructure,
  'data-flow': docStructures.dataFlowStructure,
  'onboarding': docStructures.onboardingStructure,
  'api-reference': docStructures.apiReferenceStructure,
  'migration': docStructures.migrationStructure,
  'troubleshooting': docStructures.troubleshootingStructure,

  // Agents
  'code-reviewer': agentStructures.codeReviewerStructure,
  'bug-fixer': agentStructures.bugFixerStructure,
  'feature-developer': agentStructures.featureDeveloperStructure,
  'refactoring-specialist': agentStructures.refactoringSpecialistStructure,
  'test-writer': agentStructures.testWriterStructure,
  'documentation-writer': agentStructures.documentationWriterStructure,
  'performance-optimizer': agentStructures.performanceOptimizerStructure,
  'security-auditor': agentStructures.securityAuditorStructure,
  'backend-specialist': agentStructures.backendSpecialistStructure,
  'frontend-specialist': agentStructures.frontendSpecialistStructure,
  'architect-specialist': agentStructures.architectSpecialistStructure,
  'devops-specialist': agentStructures.devopsSpecialistStructure,
  'database-specialist': agentStructures.databaseSpecialistStructure,
  'mobile-specialist': agentStructures.mobileSpecialistStructure,

  // Skills
  'commit-message': skillStructures.commitMessageSkillStructure,
  'pr-review': skillStructures.prReviewSkillStructure,
  'code-review': skillStructures.codeReviewSkillStructure,
  'test-generation': skillStructures.testGenerationSkillStructure,
  'documentation': skillStructures.documentationSkillStructure,
  'refactoring': skillStructures.refactoringSkillStructure,
  'bug-investigation': skillStructures.bugInvestigationSkillStructure,
  'feature-breakdown': skillStructures.featureBreakdownSkillStructure,
  'api-design': skillStructures.apiDesignSkillStructure,
  'security-audit': skillStructures.securityAuditSkillStructure,

  // Plans
  'implementation-plan': planStructure,
};

/**
 * Get scaffold structure by name
 */
export function getScaffoldStructure(name: string): ScaffoldStructure | undefined {
  return SCAFFOLD_STRUCTURES[name];
}

/**
 * Get all structures of a specific file type
 */
export function getStructuresByType(fileType: ScaffoldFileType): ScaffoldStructure[] {
  return Object.values(SCAFFOLD_STRUCTURES).filter(s => s.fileType === fileType);
}
