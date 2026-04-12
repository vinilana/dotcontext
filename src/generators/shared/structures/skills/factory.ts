/**
 * Factory function for creating skill structures
 */

import { ScaffoldStructure, ScaffoldSection } from '../types';

/**
 * Default content overrides for specific sections
 */
export interface SkillDefaultContent {
  whenToUse?: string;
  instructions?: string;
  examples?: string;
  guidelines?: string;
}

/**
 * Map of section headings to content keys
 */
const SECTION_KEY_MAP: Record<string, keyof SkillDefaultContent> = {
  Workflow: 'instructions',
  'Examples': 'examples',
  'Quality Bar': 'guidelines',
};

const RESOURCE_STRATEGY_DEFAULT = `- Add \`scripts/\` only when the task is fragile, repetitive, or benefits from deterministic execution.
- Add \`references/\` only when details are too large or too variant-specific to keep in \`SKILL.md\`.
- Add \`assets/\` only for files that will be consumed in the final output.
- Keep extra docs out of the skill folder; prefer \`SKILL.md\` plus only the resources that materially help.`;

/**
 * Create a skill structure with standard sections
 */
export function createSkillStructure(
  skillSlug: string,
  title: string,
  description: string,
  additionalContext?: string,
  defaultContent?: SkillDefaultContent
): ScaffoldStructure {
  const sections: ScaffoldSection[] = [
    {
      heading: 'Workflow',
      order: 1,
      contentType: 'list',
      guidance: `Write the minimum reliable procedure for ${skillSlug}. Use imperative steps, stay concise, and optimize for repeated execution.`,
      exampleContent: '1. Inspect the task inputs, constraints, and desired output.\n2. Execute the smallest reliable sequence.\n3. Validate the result against real files, commands, or behavior.\n4. Capture reusable helpers only if they reduce future repetition.',
      required: true,
      headingLevel: 2,
    },
    {
      heading: 'Examples',
      order: 2,
      contentType: 'code-block',
      guidance: 'Provide short, concrete examples. Prefer one or two examples that show the expected input shape and outcome.',
      required: true,
      headingLevel: 2,
    },
    {
      heading: 'Quality Bar',
      order: 3,
      contentType: 'list',
      guidance: 'List the checks, constraints, and non-obvious heuristics that keep this skill reliable.',
      required: true,
      headingLevel: 2,
    },
    {
      heading: 'Resource Strategy',
      order: 4,
      contentType: 'list',
      guidance: `Explain when ${skillSlug} should add helper resources. Prefer progressive disclosure and avoid unnecessary files.`,
      required: true,
      headingLevel: 2,
      defaultContent: RESOURCE_STRATEGY_DEFAULT,
    },
  ];

  // Apply default content to sections
  if (defaultContent) {
    for (const section of sections) {
      const key = SECTION_KEY_MAP[section.heading];
      if (key && defaultContent[key]) {
        section.defaultContent = defaultContent[key];
      }
    }
  }

  return {
    fileType: 'skill',
    documentName: skillSlug,
    title,
    description,
    tone: 'instructional',
    audience: 'ai-agents',
    sections,
    additionalContext,
  };
}
