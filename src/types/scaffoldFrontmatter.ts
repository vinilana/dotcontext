/**
 * Scaffold Frontmatter Types
 *
 * These types define the metadata structure for scaffolded files.
 * Scaffolding v2.0 generates frontmatter-only files where the AI
 * generates complete content based on scaffold structure definitions.
 */

import { z } from 'zod';
import { PrevcPhase } from '../workflow/types';

/**
 * File types that can be scaffolded
 */
export type ScaffoldFileType = 'doc' | 'agent' | 'skill' | 'plan';

/**
 * Scaffold status
 */
export type ScaffoldStatus = 'unfilled' | 'filled';

/**
 * Base frontmatter present in all scaffold files
 */
export interface BaseScaffoldFrontmatter {
  /** File type identifier */
  type: ScaffoldFileType;
  /** Unique name/identifier (e.g., 'project-overview', 'code-reviewer') */
  name: string;
  /** Human-readable description */
  description: string;
  /** ISO date string when file was generated */
  generated: string;
  /** Fill status */
  status: ScaffoldStatus;
  /** Scaffold version for migration support */
  scaffoldVersion: '2.0.0';
}

/**
 * Documentation-specific frontmatter
 */
export interface DocScaffoldFrontmatter extends BaseScaffoldFrontmatter {
  type: 'doc';
  /** Category of documentation */
  category?: 'overview' | 'architecture' | 'workflow' | 'testing' | 'security' | 'tooling' | 'glossary' | 'data-flow' | 'api' | 'migration' | 'onboarding' | 'troubleshooting';
}

/**
 * Agent-specific frontmatter
 */
export interface AgentScaffoldFrontmatter extends BaseScaffoldFrontmatter {
  type: 'agent';
  /** Agent type identifier */
  agentType: string;
  /** PREVC phases where this agent is relevant */
  phases?: PrevcPhase[];
}

/**
 * Skill-specific frontmatter
 */
export interface SkillScaffoldFrontmatter extends BaseScaffoldFrontmatter {
  type: 'skill';
  /** Skill slug/identifier */
  skillSlug: string;
  /** PREVC phases where this skill is relevant */
  phases?: PrevcPhase[];
  /** Whether this is a mode command */
  mode?: boolean;
  /** Disable auto-activation by AI */
  disableModelInvocation?: boolean;
}

/**
 * Plan-specific frontmatter
 */
export interface PlanScaffoldFrontmatter extends BaseScaffoldFrontmatter {
  type: 'plan';
  /** Plan slug/identifier */
  planSlug: string;
  /** Plan summary/goal */
  summary?: string;
  /** Linked agents */
  agents?: Array<{ type: string; role: string }>;
  /** Linked documentation */
  docs?: string[];
  /** Plan phases with structured steps and deliverables */
  phases?: Array<{
    id: string;
    name: string;
    prevc: PrevcPhase;
    summary?: string;
    deliverables?: string[];
    steps?: Array<{
      order: number;
      description: string;
      assignee?: string;
      deliverables?: string[];
    }>;
  }>;
}

/**
 * Union type for all scaffold frontmatter
 */
export type ScaffoldFrontmatter =
  | DocScaffoldFrontmatter
  | AgentScaffoldFrontmatter
  | SkillScaffoldFrontmatter
  | PlanScaffoldFrontmatter;

/**
 * Type guard to check if frontmatter is for documentation
 */
export function isDocFrontmatter(fm: ScaffoldFrontmatter): fm is DocScaffoldFrontmatter {
  return fm.type === 'doc';
}

/**
 * Type guard to check if frontmatter is for agent
 */
export function isAgentFrontmatter(fm: ScaffoldFrontmatter): fm is AgentScaffoldFrontmatter {
  return fm.type === 'agent';
}

/**
 * Type guard to check if frontmatter is for skill
 */
export function isSkillFrontmatter(fm: ScaffoldFrontmatter): fm is SkillScaffoldFrontmatter {
  return fm.type === 'skill';
}

/**
 * Type guard to check if frontmatter is for plan
 */
export function isPlanFrontmatter(fm: ScaffoldFrontmatter): fm is PlanScaffoldFrontmatter {
  return fm.type === 'plan';
}

/**
 * Create unfilled frontmatter for a document
 */
export function createDocFrontmatter(
  name: string,
  description: string,
  category?: DocScaffoldFrontmatter['category']
): DocScaffoldFrontmatter {
  return {
    type: 'doc',
    name,
    description,
    category,
    generated: new Date().toISOString().split('T')[0],
    status: 'unfilled',
    scaffoldVersion: '2.0.0',
  };
}

/**
 * Create unfilled frontmatter for an agent
 */
export function createAgentFrontmatter(
  name: string,
  description: string,
  agentType: string,
  phases?: PrevcPhase[]
): AgentScaffoldFrontmatter {
  return {
    type: 'agent',
    name,
    description,
    agentType,
    phases,
    generated: new Date().toISOString().split('T')[0],
    status: 'unfilled',
    scaffoldVersion: '2.0.0',
  };
}

/**
 * Create unfilled frontmatter for a skill
 */
export function createSkillFrontmatter(
  name: string,
  description: string,
  skillSlug: string,
  options?: {
    phases?: PrevcPhase[];
    mode?: boolean;
    disableModelInvocation?: boolean;
  }
): SkillScaffoldFrontmatter {
  return {
    type: 'skill',
    name,
    description,
    skillSlug,
    phases: options?.phases,
    mode: options?.mode,
    disableModelInvocation: options?.disableModelInvocation,
    generated: new Date().toISOString().split('T')[0],
    status: 'unfilled',
    scaffoldVersion: '2.0.0',
  };
}

/**
 * Create unfilled frontmatter for a plan
 */
export function createPlanFrontmatter(
  name: string,
  description: string,
  planSlug: string,
  options?: {
    summary?: string;
    agents?: Array<{ type: string; role: string }>;
    docs?: string[];
    phases?: Array<{
      id: string;
      name: string;
      prevc: PrevcPhase;
      summary?: string;
      deliverables?: string[];
      steps?: Array<{
        order: number;
        description: string;
        assignee?: string;
        deliverables?: string[];
      }>;
    }>;
  }
): PlanScaffoldFrontmatter {
  return {
    type: 'plan',
    name,
    description,
    planSlug,
    summary: options?.summary,
    agents: options?.agents,
    docs: options?.docs,
    phases: options?.phases,
    generated: new Date().toISOString().split('T')[0],
    status: 'unfilled',
    scaffoldVersion: '2.0.0',
  };
}

/**
 * Serialize frontmatter to YAML string (for file output)
 */
export function serializeFrontmatter(fm: ScaffoldFrontmatter): string {
  const lines: string[] = ['---'];

  // Common fields first
  lines.push(`type: ${fm.type}`);
  lines.push(`name: ${fm.name}`);
  lines.push(`description: ${fm.description}`);

  // Type-specific fields
  if (isDocFrontmatter(fm) && fm.category) {
    lines.push(`category: ${fm.category}`);
  }

  if (isAgentFrontmatter(fm)) {
    lines.push(`agentType: ${fm.agentType}`);
    if (fm.phases && fm.phases.length > 0) {
      lines.push(`phases: [${fm.phases.join(', ')}]`);
    }
  }

  if (isSkillFrontmatter(fm)) {
    lines.push(`skillSlug: ${fm.skillSlug}`);
    if (fm.phases && fm.phases.length > 0) {
      lines.push(`phases: [${fm.phases.join(', ')}]`);
    }
    if (fm.mode !== undefined) {
      lines.push(`mode: ${fm.mode}`);
    }
    if (fm.disableModelInvocation !== undefined) {
      lines.push(`disable-model-invocation: ${fm.disableModelInvocation}`);
    }
  }

  if (isPlanFrontmatter(fm)) {
    lines.push(`planSlug: ${fm.planSlug}`);
    if (fm.summary) {
      lines.push(`summary: ${JSON.stringify(fm.summary)}`);
    }
    if (fm.agents && fm.agents.length > 0) {
      lines.push('agents:');
      for (const agent of fm.agents) {
        lines.push(`  - type: ${JSON.stringify(agent.type)}`);
        lines.push(`    role: ${JSON.stringify(agent.role)}`);
      }
    }
    if (fm.docs && fm.docs.length > 0) {
      lines.push('docs:');
      for (const doc of fm.docs) {
        lines.push(`  - ${JSON.stringify(doc)}`);
      }
    }
    if (fm.phases && fm.phases.length > 0) {
      lines.push('phases:');
      for (const phase of fm.phases) {
        lines.push(`  - id: ${JSON.stringify(phase.id)}`);
        lines.push(`    name: ${JSON.stringify(phase.name)}`);
        lines.push(`    prevc: ${JSON.stringify(phase.prevc)}`);
        if (phase.summary) {
          lines.push(`    summary: ${JSON.stringify(phase.summary)}`);
        }
        if (phase.deliverables && phase.deliverables.length > 0) {
          lines.push('    deliverables:');
          for (const deliverable of phase.deliverables) {
            lines.push(`      - ${JSON.stringify(deliverable)}`);
          }
        }
        if (phase.steps && phase.steps.length > 0) {
          lines.push('    steps:');
          for (const step of phase.steps) {
            lines.push(`      - order: ${step.order}`);
            lines.push(`        description: ${JSON.stringify(step.description)}`);
            if (step.assignee) {
              lines.push(`        assignee: ${JSON.stringify(step.assignee)}`);
            }
            if (step.deliverables && step.deliverables.length > 0) {
              lines.push('        deliverables:');
              for (const deliverable of step.deliverables) {
                lines.push(`          - ${JSON.stringify(deliverable)}`);
              }
            }
          }
        }
      }
    }
  }

  // Common trailing fields
  lines.push(`generated: ${fm.generated}`);
  lines.push(`status: ${fm.status}`);
  lines.push(`scaffoldVersion: "${fm.scaffoldVersion}"`);

  lines.push('---');

  return lines.join('\n');
}

/**
 * Zod schemas for validating scaffold/plan frontmatter at I/O boundaries.
 */
const prevcPhaseSchema = z.enum(['P', 'R', 'E', 'V', 'C']);

const planStepSchema = z.object({
  order: z.number(),
  description: z.string(),
  assignee: z.string().optional(),
  deliverables: z.array(z.string()).optional(),
});

const planPhaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  prevc: prevcPhaseSchema,
  summary: z.string().optional(),
  deliverables: z.array(z.string()).optional(),
  steps: z.array(planStepSchema).optional(),
});

const agentEntrySchema = z.object({
  type: z.string().min(1),
  role: z.string(),
});

export const planScaffoldFrontmatterSchema = z.object({
  type: z.literal('plan'),
  name: z.string().min(1),
  description: z.string().min(1),
  generated: z.string().min(1),
  status: z.enum(['unfilled', 'filled']),
  scaffoldVersion: z.literal('2.0.0'),
  planSlug: z.string().min(1),
  summary: z.string().optional(),
  agents: z.array(agentEntrySchema).optional(),
  docs: z.array(z.string()).optional(),
  phases: z.array(planPhaseSchema).optional(),
});

export type PlanScaffoldFrontmatterValidated = z.infer<typeof planScaffoldFrontmatterSchema>;

/**
 * Validate plan frontmatter parsed from YAML. Returns parsed value or null if
 * invalid. Keep at the boundary; do not pepper throughout the codebase.
 */
export function validatePlanFrontmatter(raw: unknown): PlanScaffoldFrontmatterValidated | null {
  const result = planScaffoldFrontmatterSchema.safeParse(raw);
  return result.success ? result.data : null;
}

