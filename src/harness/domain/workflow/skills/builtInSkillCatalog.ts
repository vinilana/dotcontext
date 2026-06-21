import type { PrevcPhase } from '../types';

const ALL_PREVC_PHASES = ['P', 'R', 'E', 'V', 'C'] as const satisfies readonly PrevcPhase[];

const CORE_BUILT_IN_SKILL_PHASES = {
  'commit-message': ['E', 'C'],
  'pr-review': ['R', 'V'],
  'code-review': ['R', 'V'],
  'test-generation': ['E', 'V'],
  documentation: ['P', 'C'],
  refactoring: ['E'],
  'bug-investigation': ['E', 'V'],
  'feature-breakdown': ['P'],
  'api-design': ['P', 'R'],
  'security-audit': ['R', 'V'],
  'dotcontext-workflow': ALL_PREVC_PHASES,
  'dotcontext-tooling': ALL_PREVC_PHASES,
} as const satisfies Record<string, readonly PrevcPhase[]>;

function buildDotcontextWorkflowPhaseSkills(): Record<
  `dotcontext-workflow-${Lowercase<PrevcPhase>}`,
  readonly [PrevcPhase]
> {
  const entries = ALL_PREVC_PHASES.map(
    (phase) =>
      [`dotcontext-workflow-${phase.toLowerCase()}`, [phase]] as const
  );

  return Object.fromEntries(entries) as Record<
    `dotcontext-workflow-${Lowercase<PrevcPhase>}`,
    readonly [PrevcPhase]
  >;
}

export const PREVC_SKILL_PHASES = {
  ...CORE_BUILT_IN_SKILL_PHASES,
  ...buildDotcontextWorkflowPhaseSkills(),
} as const satisfies Record<string, readonly PrevcPhase[]>;

export type BuiltInSkillType = keyof typeof PREVC_SKILL_PHASES;

export const BUILT_IN_SKILLS = Object.keys(PREVC_SKILL_PHASES) as BuiltInSkillType[];

export const META_SKILL_SLUGS = ['dotcontext-workflow', 'dotcontext-tooling'] as const satisfies readonly BuiltInSkillType[];

export function dotcontextWorkflowPhaseSkillSlug(
  phase: PrevcPhase
): `dotcontext-workflow-${Lowercase<PrevcPhase>}` {
  return `dotcontext-workflow-${phase.toLowerCase()}` as `dotcontext-workflow-${Lowercase<PrevcPhase>}`;
}

export const PHASE_META_SKILL = Object.fromEntries(
  ALL_PREVC_PHASES.map((phase) => [phase, dotcontextWorkflowPhaseSkillSlug(phase)])
) as Record<PrevcPhase, ReturnType<typeof dotcontextWorkflowPhaseSkillSlug>>;

export function isBuiltInSkill(skillType: string): skillType is BuiltInSkillType {
  return Object.prototype.hasOwnProperty.call(PREVC_SKILL_PHASES, skillType);
}

export const SKILL_TO_PHASES: Record<BuiltInSkillType, PrevcPhase[]> = Object.fromEntries(
  Object.entries(PREVC_SKILL_PHASES).map(([skill, phases]) => [skill, [...phases]])
) as Record<BuiltInSkillType, PrevcPhase[]>;
