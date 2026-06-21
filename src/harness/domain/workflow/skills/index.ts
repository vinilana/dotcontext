/**
 * Skills Module
 *
 * On-demand expertise for AI agents.
 */

export {
  Skill,
  SkillMetadata,
  SkillReference,
  DiscoveredSkills,
} from './types';

export {
  BUILT_IN_SKILLS,
  BuiltInSkillType,
  isBuiltInSkill,
  PREVC_SKILL_PHASES,
  SKILL_TO_PHASES,
  META_SKILL_SLUGS,
  PHASE_META_SKILL,
  dotcontextWorkflowPhaseSkillSlug,
} from './builtInSkillCatalog';

export {
  SkillRegistry,
  createSkillRegistry,
} from './skillRegistry';

export {
  getBuiltInSkillTemplates,
  SkillTemplate,
} from './skillTemplates';

export {
  generateFrontmatter,
  generatePortableFrontmatter,
  wrapWithFrontmatter,
  wrapWithPortableFrontmatter,
  parseFrontmatter,
} from './frontmatter';
