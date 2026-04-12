/**
 * Skills Index (README.md) Template
 */

import { Skill } from '../../../workflow/skills';

export interface SkillsIndexOptions {
  skills: Skill[];
  projectName?: string;
}

/**
 * Generate README.md for skills directory
 */
export function generateSkillsIndex(options: SkillsIndexOptions): string {
  const { skills, projectName } = options;

  const builtIn = skills.filter((s) => s.isBuiltIn);
  const custom = skills.filter((s) => !s.isBuiltIn);

  let content = `# Skills

On-demand expertise for AI agents. Skills are task-specific procedures that get activated when relevant.

`;

  if (projectName) {
    content += `> Project: ${projectName}\n\n`;
  }

  content += `## How Skills Work

1. **Discovery**: AI agents discover available skills
2. **Matching**: When a task matches a skill's description, it's activated
3. **Execution**: The skill's instructions guide the AI's behavior

## Available Skills

`;

  if (builtIn.length > 0) {
    content += `### Built-in Skills

| Skill | Description | Phases |
|-------|-------------|--------|
`;

    for (const skill of builtIn) {
      const phases = skill.metadata.phases?.join(', ') || '-';
      content += `| [${skill.metadata.name}](./${skill.slug}/SKILL.md) | ${skill.metadata.description} | ${phases} |\n`;
    }

    content += '\n';
  }

  if (custom.length > 0) {
    content += `### Custom Skills

| Skill | Description | Phases |
|-------|-------------|--------|
`;

    for (const skill of custom) {
      const phases = skill.metadata.phases?.join(', ') || '-';
      content += `| [${skill.metadata.name}](./${skill.slug}/SKILL.md) | ${skill.metadata.description} | ${phases} |\n`;
    }

    content += '\n';
  }

  content += `## Creating Custom Skills

Create a new skill by adding a directory with a \`SKILL.md\` file:

\`\`\`
.context/skills/
└── my-skill/
    ├── SKILL.md          # Required: source skill definition
    ├── scripts/          # Optional: deterministic helpers
    ├── references/       # Optional: load-on-demand details
    └── assets/           # Optional: output resources
\`\`\`

### Skill Anatomy

\`\`\`md
The source file under \`.context/skills/\` keeps internal scaffold metadata so dotcontext can track fill status.
When exported to AI-tool skill directories, the portable frontmatter should keep only:

---
name: my-skill
description: Describe what the skill does and the concrete triggers for when to use it
---

## Workflow
1. Step one
2. Step two

## Examples
\`\`\`
[Short example]
\`\`\`

## Quality Bar
- List the checks and constraints that keep the skill reliable

## Resource Strategy
- Explain when to add \`scripts/\`, \`references/\`, or \`assets/\`
\`\`\`

Keep activation language in the description frontmatter, keep the body concise, and avoid extra docs such as \`README.md\` or \`CHANGELOG.md\` inside the skill folder.

## PREVC Phase Mapping

| Phase | Name | Skills |
|-------|------|--------|
| P | Planning | feature-breakdown, documentation, api-design |
| R | Review | pr-review, code-review, api-design, security-audit |
| E | Execution | commit-message, test-generation, refactoring, bug-investigation |
| V | Validation | pr-review, code-review, test-generation, security-audit |
| C | Confirmation | commit-message, documentation |
`;

  return content;
}
