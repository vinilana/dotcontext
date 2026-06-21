/**
 * Skill Types
 *
 * Skills are on-demand expertise that AI agents can activate when needed.
 * Unlike agents (persistent behavioral playbooks), skills are task-specific
 * procedures that get loaded only when relevant.
 */

import { PrevcPhase } from '../types';

/**
 * SKILL.md frontmatter metadata
 */
export interface SkillMetadata {
  /** Unique identifier (lowercase, hyphens) */
  name: string;
  /** Description of when to use this skill */
  description: string;
  /** Categorize as mode command (modifies behavior) */
  mode?: boolean;
  /** Prevent auto-activation by AI */
  disableModelInvocation?: boolean;
  /** PREVC phases where this skill is relevant */
  phases?: PrevcPhase[];
}

/**
 * Full skill representation
 */
export interface Skill {
  /** Directory name */
  slug: string;
  /** Full path to SKILL.md */
  path: string;
  /** Parsed frontmatter */
  metadata: SkillMetadata;
  /** Markdown instructions */
  content: string;
  /** Optional helper files in skill directory */
  resources: string[];
  /** Is this a built-in skill? */
  isBuiltIn: boolean;
}

/**
 * Skill reference for linking
 */
export interface SkillReference {
  slug: string;
  path: string;
  name: string;
  description: string;
  linkedAt: string;
}

/**
 * Discovered skills summary
 */
export interface DiscoveredSkills {
  builtIn: Skill[];
  custom: Skill[];
  all: Skill[];
}

export {
  BUILT_IN_SKILLS,
  BuiltInSkillType,
  isBuiltInSkill,
  PREVC_SKILL_PHASES,
  SKILL_TO_PHASES,
} from './builtInSkillCatalog';
