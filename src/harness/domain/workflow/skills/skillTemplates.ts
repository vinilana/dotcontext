/**
 * Built-in Skill Templates
 *
 * Separated from SkillRegistry to follow Single Responsibility Principle.
 * Each template contains description and markdown content for a built-in skill.
 *
 * Content is derived from the canonical skill definitions in the harness
 * scaffolding layer to maintain a single source of truth.
 */

import { BuiltInSkillType, dotcontextWorkflowPhaseSkillSlug, PHASE_META_SKILL } from './builtInSkillCatalog';
import type { PrevcPhase } from '../types';
import {
  SkillDefaultContent,
} from '../../../application/context/scaffolding/generators/shared/structures/skills/factory';
import {
  commitMessageContent,
  prReviewContent,
  codeReviewContent,
  testGenerationContent,
  documentationContent,
  refactoringContent,
  bugInvestigationContent,
  featureBreakdownContent,
  apiDesignContent,
  securityAuditContent,
} from '../../../application/context/scaffolding/generators/shared/structures/skills/definitions';

export interface SkillTemplate {
  description: string;
  content: string;
}

function contentToMarkdown(title: string, overview: string, content: SkillDefaultContent): string {
  let md = `# ${title}\n\n${overview}.\n\n`;
  if (content.instructions) {
    md += `## Workflow\n${content.instructions}\n\n`;
  }
  if (content.examples) {
    md += `## Examples\n${content.examples}\n\n`;
  }
  if (content.guidelines) {
    md += `## Quality Bar\n${content.guidelines}\n\n`;
  }
  md += `## Resource Strategy
- Add \`scripts/\` only when the task is fragile, repetitive, or benefits from deterministic execution.
- Add \`references/\` only when details are too large or too variant-specific to keep in \`SKILL.md\`.
- Add \`assets/\` only for files that will be consumed in the final output.
- Keep extra docs out of the skill folder; prefer \`SKILL.md\` plus only the resources that materially help.`;
  return md;
}

function extractTriggerBullets(whenToUse?: string): string[] {
  if (!whenToUse) {
    return [];
  }

  return whenToUse
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('-'))
    .map(line => line.replace(/^-+\s*/, '').replace(/\.$/, '').trim())
    .filter(Boolean);
}

function joinNaturalLanguage(items: string[]): string {
  if (items.length === 0) {
    return '';
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} or ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
}

function buildTemplateDescription(baseDescription: string, content: SkillDefaultContent): string {
  const triggers = extractTriggerBullets(content.whenToUse);
  if (triggers.length === 0) {
    return baseDescription;
  }

  return `${baseDescription}. Use when ${joinNaturalLanguage(triggers)}`;
}

/**
 * Get all built-in skill templates
 */
export function getBuiltInSkillTemplates(): Record<BuiltInSkillType, SkillTemplate> {
  const phaseTemplates = (Object.keys(PHASE_META_SKILL) as PrevcPhase[]).reduce(
    (acc, phase) => {
      acc[dotcontextWorkflowPhaseSkillSlug(phase)] = createDotcontextWorkflowPhaseSkill(phase);
      return acc;
    },
    {} as Record<ReturnType<typeof dotcontextWorkflowPhaseSkillSlug>, SkillTemplate>
  );

  return {
    'commit-message': createCommitMessageSkill(),
    'pr-review': createPrReviewSkill(),
    'code-review': createCodeReviewSkill(),
    'test-generation': createTestGenerationSkill(),
    'documentation': createDocumentationSkill(),
    'refactoring': createRefactoringSkill(),
    'bug-investigation': createBugInvestigationSkill(),
    'feature-breakdown': createFeatureBreakdownSkill(),
    'api-design': createApiDesignSkill(),
    'security-audit': createSecurityAuditSkill(),
    'dotcontext-workflow': createDotcontextWorkflowSkill(),
    'dotcontext-tooling': createDotcontextToolingSkill(),
    ...phaseTemplates,
  };
}

function createMetaSkillTemplate(
  title: string,
  description: string,
  sections: Array<{ heading: string; body: string }>
): SkillTemplate {
  let content = `# ${title}\n\n`;
  for (const section of sections) {
    content += `## ${section.heading}\n${section.body}\n\n`;
  }
  return { description, content: content.trim() };
}

function createCommitMessageSkill(): SkillTemplate {
  const overview = 'Use this skill to turn a concrete set of staged changes into a clean conventional commit message';
  return {
    description: buildTemplateDescription('Generate commit messages that follow conventional commits and repository scope conventions', commitMessageContent),
    content: contentToMarkdown('Commit Message', overview, commitMessageContent),
  };
}

function createPrReviewSkill(): SkillTemplate {
  const overview = 'Use this skill to review a pull request against the repository quality bar and leave actionable feedback';
  return {
    description: buildTemplateDescription('Review pull requests against team standards and best practices', prReviewContent),
    content: contentToMarkdown('Pull Request Review', overview, prReviewContent),
  };
}

function createCodeReviewSkill(): SkillTemplate {
  const overview = 'Use this skill to inspect code for correctness, maintainability, and higher-order risks before changes move forward';
  return {
    description: buildTemplateDescription('Review code quality, patterns, and best practices', codeReviewContent),
    content: contentToMarkdown('Code Review', overview, codeReviewContent),
  };
}

function createTestGenerationSkill(): SkillTemplate {
  const overview = 'Use this skill to produce tests that cover behavior, regressions, and the repository testing conventions';
  return {
    description: buildTemplateDescription('Generate comprehensive test cases for code', testGenerationContent),
    content: contentToMarkdown('Test Generation', overview, testGenerationContent),
  };
}

function createDocumentationSkill(): SkillTemplate {
  const overview = 'Use this skill to create or update technical documentation that matches the current code and the target audience';
  return {
    description: buildTemplateDescription('Generate and update technical documentation', documentationContent),
    content: contentToMarkdown('Documentation', overview, documentationContent),
  };
}

function createRefactoringSkill(): SkillTemplate {
  const overview = 'Use this skill to improve structure without changing behavior, keeping the work incremental and test-backed';
  return {
    description: buildTemplateDescription('Refactor code safely with a step-by-step approach', refactoringContent),
    content: contentToMarkdown('Refactoring', overview, refactoringContent),
  };
}

function createBugInvestigationSkill(): SkillTemplate {
  const overview = 'Use this skill to reproduce a bug, narrow the failure surface, and document a defensible root cause';
  return {
    description: buildTemplateDescription('Investigate bugs systematically and perform root cause analysis', bugInvestigationContent),
    content: contentToMarkdown('Bug Investigation', overview, bugInvestigationContent),
  };
}

function createFeatureBreakdownSkill(): SkillTemplate {
  const overview = 'Use this skill to decompose a feature into small, testable tasks with explicit dependencies and acceptance criteria';
  return {
    description: buildTemplateDescription('Break down features into implementable tasks', featureBreakdownContent),
    content: contentToMarkdown('Feature Breakdown', overview, featureBreakdownContent),
  };
}

function createApiDesignSkill(): SkillTemplate {
  const overview = 'Use this skill to design API resources, payloads, and failure modes with consistent conventions';
  return {
    description: buildTemplateDescription('Design RESTful APIs following best practices', apiDesignContent),
    content: contentToMarkdown('API Design', overview, apiDesignContent),
  };
}

function createSecurityAuditSkill(): SkillTemplate {
  const overview = 'Use this skill to review code and integrations for security weaknesses and rank the findings by severity';
  return {
    description: buildTemplateDescription('Review code and infrastructure for security weaknesses', securityAuditContent),
    content: contentToMarkdown('Security Audit', overview, securityAuditContent),
  };
}

function createDotcontextWorkflowSkill(): SkillTemplate {
  return createMetaSkillTemplate(
    'Dotcontext Workflow',
    'Operate PREVC workflow through any adapter (MCP, CLI, hooks, Pi)',
    [
      {
        heading: 'When to Use',
        body: `- Starting or continuing structured work in a dotcontext-enabled repo
- You need orientation on the current PREVC phase or next harness action
- The transport differs (MCP tool, CLI command, hook, Pi extension) but the workflow rules are the same`,
      },
      {
        heading: 'PREVC Phases',
        body: `- **P** Planning — requirements, specs, acceptance criteria
- **R** Review — architecture, ADRs, design review (optional by scale)
- **E** Execution — implementation and unit tests
- **V** Validation — QA, review, evidence and sensors
- **C** Confirmation — docs, changelog, deploy handoff (optional by scale)`,
      },
      {
        heading: 'Harness-First Rules',
        body: `1. Workflow state lives in the harness (\`.context/runtime/workflows/\`), not in the adapter.
2. Call **workflow-init** for non-trivial planned work; skip for trivial edits.
3. Use **workflow-guide** (or **workflow-status**) for current phase, next steps, skills, and gate hints.
4. Advance with **workflow-advance** only when phase deliverables are complete.
5. Manage checkpoints, sensors, and handoffs with **workflow-manage**.`,
      },
      {
        heading: 'Adapter Neutrality',
        body: `The same actions are available regardless of transport:
- MCP — harness adapter tools (\`workflow-init\`, \`workflow-guide\`, etc.)
- CLI — \`admin workflow\` commands
- Hooks / Pi — thin clients that call the same harness runtime

Read the phase-specific \`dotcontext-workflow-{p,r,e,v,c}\` skill for the active checklist.`,
      },
    ]
  );
}

type WorkflowPhaseLetter = 'P' | 'R' | 'E' | 'V' | 'C';

const WORKFLOW_PHASE_CHECKLISTS: Record<
  WorkflowPhaseLetter,
  { name: string; checklist: string; outputs: string }
> = {
  P: {
    name: 'Planning',
    checklist: `1. Clarify scope, requirements, and acceptance criteria
2. Create or link a plan (\`context scaffoldPlan\` → \`plan link\`)
3. Identify risks, dependencies, and scale (QUICK/SMALL/MEDIUM/LARGE)
4. Start harness workflow with \`workflow-init\` when work is non-trivial`,
    outputs: 'prd, tech-spec, requirements, wireframes',
  },
  R: {
    name: 'Review',
    checklist: `1. Review architecture, ADRs, and technical decisions
2. Validate design against requirements and constraints
3. Approve linked plan via \`workflow-manage approvePlan\` when \`require_approval\` is on
4. Resolve blocking review comments before advancing to Execution`,
    outputs: 'architecture, adr, design-spec',
  },
  E: {
    name: 'Execution',
    checklist: `1. Implement against the approved spec and architecture
2. Follow repository patterns; keep changes scoped to phase deliverables
3. Add or update unit tests for changed behavior
4. Record artifacts and traces with \`workflow-manage\` when useful`,
    outputs: 'code, unit-tests',
  },
  V: {
    name: 'Validation',
    checklist: `1. Run the test suite and fix failures
2. Review code quality, security, and performance risks
3. Run required sensors (\`workflow-manage runSensors\`) and attach evidence
4. Advance only when validation gates and acceptance criteria pass`,
    outputs: 'test-report, review-comments, approval',
  },
  C: {
    name: 'Confirmation',
    checklist: `1. Update documentation, README, and changelog
2. Export skills or context with \`sync\` when adapters need refreshed assets
3. Capture deployment or handoff notes
4. Complete the workflow with \`workflow-advance\` when Confirmation deliverables are done`,
    outputs: 'documentation, changelog, deploy',
  },
};

function createDotcontextWorkflowPhaseSkill(phase: WorkflowPhaseLetter): SkillTemplate {
  const model = WORKFLOW_PHASE_CHECKLISTS[phase];
  return createMetaSkillTemplate(
    `Dotcontext Workflow — Phase ${phase}`,
    `PREVC phase ${phase} (${model.name}) checklist for harness-backed work`,
    [
      {
        heading: 'When to Use',
        body: `Active PREVC workflow is in phase **${phase} (${model.name})** and you need the phase checklist independent of MCP, CLI, hooks, or Pi.`,
      },
      {
        heading: 'Checklist',
        body: model.checklist,
      },
      {
        heading: 'Expected Outputs',
        body: model.outputs,
      },
      {
        heading: 'Orientation',
        body: `Call \`workflow-guide\` for live next steps, relevant skills, and gate decisions. Use \`dotcontext-workflow\` for the full PREVC overview.`,
      },
    ]
  );
}

function createDotcontextToolingSkill(): SkillTemplate {
  return createMetaSkillTemplate(
    'Dotcontext Tooling',
    'When to use harness actions (init, guide, advance, manage, sensors) across any adapter',
    [
      {
        heading: 'When to Use',
        body: `- You need to pick the right harness action for the current moment
- Unsure whether to init, check status, advance, or run sensors
- Working through MCP, CLI, hooks, or Pi — the action names and semantics are the same`,
      },
      {
        heading: 'Workflow Actions',
        body: `- **workflow-init** — start PREVC for planned/non-trivial work; creates canonical harness state
- **workflow-status** — read phase, scale, gates, and linked plans (status only)
- **workflow-guide** — next steps, skills, decision hints; preferred for session orientation
- **workflow-advance** — move to the next PREVC phase when deliverables are complete
- **workflow-manage** — handoffs, checkpoints, tasks, sensors, plan approval, autonomous mode`,
      },
      {
        heading: 'Context & Assets',
        body: `- **context** — init/fill scaffolding (\`.context/\` docs, agents, skills, plans)
- **plan** — link and track execution plans under PREVC gates
- **skill** — list, scaffold, or export built-in and custom skills
- **sync** — export/import context to native AI tool formats
- **agent** — discover agent playbooks and orchestration sequences
- **explore** — search and analyze the codebase
- **harness** — durable sessions, traces, artifacts, policy, replay`,
      },
      {
        heading: 'Quick Chooser',
        body: `| Situation | Action |
| --- | --- |
| No workflow yet, starting planned work | workflow-init |
| Need what to do now | workflow-guide |
| Phase done, move forward | workflow-advance |
| Tests/evidence before Validation exit | workflow-manage runSensors |
| Scaffold missing .context assets | context init / skill scaffold |`,
      },
    ]
  );
}
