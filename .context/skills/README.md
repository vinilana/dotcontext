# Skills

On-demand expertise for AI agents. Skills are task-specific procedures that get activated when relevant.

> Project: dotcontext

## How Skills Work

1. **Discovery**: AI agents discover available skills via the `skill` MCP tool or by reading this directory
2. **Matching**: When a task matches a skill's description, it gets activated
3. **Execution**: The skill's instructions guide the AI's behavior with project-specific procedures

## Available Skills

### Built-in Skills

| Skill | Description | Phases | Status |
|-------|-------------|--------|--------|
| [MCP Tool Design](./api-design/SKILL.md) | Design MCP tools and gateway interfaces for the dotcontext server | P, R | filled |
| [Bug Investigation](./bug-investigation/SKILL.md) | Systematic bug investigation and root cause analysis | E, V | filled |
| [Code Review](./code-review/SKILL.md) | Review code quality, patterns, and best practices | R, V | filled |
| [Commit Message](./commit-message/SKILL.md) | Generate commit messages following conventional commits with scope detection | E, C | filled |
| [Documentation](./documentation/SKILL.md) | Generate and update technical documentation | P, C | filled |
| [Feature Breakdown](./feature-breakdown/SKILL.md) | Break down features into implementable tasks | P | filled |
| [PR Review](./pr-review/SKILL.md) | Review pull requests against team standards and best practices | R, V | filled |
| [Refactoring](./refactoring/SKILL.md) | Safe code refactoring with step-by-step approach | E | filled |
| [Security Audit](./security-audit/SKILL.md) | Security review checklist for code and infrastructure | R, V | filled |
| [Test Generation](./test-generation/SKILL.md) | Generate comprehensive test cases for code | E, V | filled |

## Creating Custom Skills

Create a new skill by adding a directory with a `SKILL.md` file:

```
.context/skills/
└── my-skill/
    ├── SKILL.md          # Required: skill definition
    └── templates/        # Optional: helper resources
        └── checklist.md
```

### SKILL.md Format

```yaml
---
type: skill
name: my-skill
description: When to use this skill
skillSlug: my-skill
phases: [P, E, V]  # Optional: PREVC phases
mode: false        # Optional: mode command?
status: filled
scaffoldVersion: "2.0.0"
---

# My Skill

## When to Use
[Description of when this skill applies]

## Instructions
1. Step one
2. Step two

## Examples
[Usage examples]
```

## PREVC Phase Mapping

| Phase | Name | Skills |
|-------|------|--------|
| P | Planning | feature-breakdown, documentation, api-design (MCP tool design) |
| R | Review | pr-review, code-review, api-design (MCP tool design), security-audit |
| E | Execution | commit-message, test-generation, refactoring, bug-investigation |
| V | Validation | pr-review, code-review, test-generation, bug-investigation, security-audit |
| C | Confirmation | commit-message, documentation |

## Accessing Skills Programmatically

Via MCP tools:
- `skill({ action: 'list' })` -- List all skills
- `skill({ action: 'getContent', skillSlug: 'code-review' })` -- Get skill content
- `skill({ action: 'getForPhase', phase: 'E' })` -- Get skills for a PREVC phase

Via the SkillRegistry (`src/workflow/skills/skillRegistry.ts`):
- Discovers built-in and custom skills from `.context/skills/`
- Parses YAML frontmatter and markdown content
- Used by MCP gateway handler in `src/services/mcp/gateway/skill.ts`
