export { StackDetector } from './stackDetector';
export type { StackInfo } from './stackDetector';

export {
  classifyProject,
  detectCLILibraries,
  isLibraryPackage,
  PROJECT_TYPES,
} from './projectTypeClassifier';
export type {
  ProjectType,
  ProjectClassification,
  ExtendedStackInfo,
} from './projectTypeClassifier';

export {
  getAgentsForProjectType,
  getDocsForProjectType,
  getSkillsForProjectType,
  getFilteredScaffolds,
  shouldIncludeAgent,
  shouldIncludeDoc,
  shouldIncludeSkill,
  CORE_AGENTS,
  CORE_DOCS,
  CORE_SKILLS,
  AGENT_FILTER_MATRIX,
  DOCS_FILTER_MATRIX,
  SKILLS_FILTER_MATRIX,
} from './scaffoldFilter';
