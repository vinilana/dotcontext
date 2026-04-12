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
  BUILT_IN_SKILLS,
  BuiltInSkillType,
  isBuiltInSkill,
  SKILL_TO_PHASES,
} from './types';

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
