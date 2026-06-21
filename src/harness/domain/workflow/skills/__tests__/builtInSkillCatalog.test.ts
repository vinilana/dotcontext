import { getBuiltInSkillTemplates } from '../skillTemplates';
import {
  BUILT_IN_SKILLS,
  BuiltInSkillType,
  PHASE_META_SKILL,
  PREVC_SKILL_PHASES,
  dotcontextWorkflowPhaseSkillSlug,
} from '../builtInSkillCatalog';

describe('builtInSkillCatalog', () => {
  it('derives built-in skill slugs from the phase catalog', () => {
    expect(BUILT_IN_SKILLS).toEqual(Object.keys(PREVC_SKILL_PHASES));
    expect(BUILT_IN_SKILLS).toHaveLength(17);
  });

  it('generates dotcontext workflow phase skills from PREVC phases', () => {
    expect(PREVC_SKILL_PHASES['dotcontext-workflow-p']).toEqual(['P']);
    expect(PREVC_SKILL_PHASES['dotcontext-workflow-r']).toEqual(['R']);
    expect(PREVC_SKILL_PHASES['dotcontext-workflow-e']).toEqual(['E']);
    expect(PREVC_SKILL_PHASES['dotcontext-workflow-v']).toEqual(['V']);
    expect(PREVC_SKILL_PHASES['dotcontext-workflow-c']).toEqual(['C']);
    expect(dotcontextWorkflowPhaseSkillSlug('E')).toBe('dotcontext-workflow-e');
    expect(PHASE_META_SKILL.E).toBe('dotcontext-workflow-e');
  });

  it('keeps every built-in skill aligned with a template', () => {
    const templates = getBuiltInSkillTemplates();

    for (const skill of BUILT_IN_SKILLS) {
      expect(templates[skill as BuiltInSkillType]).toBeDefined();
    }

    expect(Object.keys(templates).sort()).toEqual([...BUILT_IN_SKILLS].sort());
  });
});
