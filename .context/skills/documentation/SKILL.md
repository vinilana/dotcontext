---
type: skill
name: Documentation
description: Generate and update technical documentation
skillSlug: documentation
phases: [P, C]
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---

# Documentation

Guidelines for creating and maintaining documentation in the `@ai-coders/context` project.

## When to Use

- Planning phase (P): Writing PRDs, tech specs, or architecture docs in `.context/plans/`
- Confirmation phase (C): Updating project docs after feature completion
- Filling scaffold documentation files in `.context/docs/`
- Updating the README, CHANGELOG, or CONTRIBUTING guides
- Writing or updating `.context/` content (docs, agents, skills, plans)

## Documentation Locations

| Location | Purpose | Format |
|----------|---------|--------|
| `.context/docs/` | Project knowledge base (generated scaffolds) | Markdown with YAML frontmatter |
| `.context/agents/` | AI agent playbooks | Markdown with YAML frontmatter |
| `.context/skills/` | On-demand expertise guides | Markdown with YAML frontmatter |
| `.context/plans/` | Feature plans and tracking | Markdown with YAML frontmatter |
| `README.md` | Public-facing project overview | Standard Markdown |
| `CHANGELOG.md` | Version history (Keep a Changelog format) | Standard Markdown |
| `CONTRIBUTING.md` | Contributor guidelines | Standard Markdown |
| `AGENTS.md` | Agent knowledge base reference | Standard Markdown |
| `CLAUDE.md` | Claude-specific project instructions | Standard Markdown |

## Instructions

### Updating Scaffold Documentation (.context/docs/)

Scaffold docs use v2 frontmatter:

```yaml
---
type: documentation
name: Project Overview
description: High-level project summary
category: core
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---
```

Core docs in this project:
- `project-overview.md` -- Technology stack, entry points, getting started
- `development-workflow.md` -- Branching, CI, contributing process
- `testing-strategy.md` -- Jest config, test types, quality gates
- `tooling.md` -- CLI scripts, dev commands, IDE setup
- `codebase-map.json` -- Auto-generated semantic analysis output

When updating, preserve the frontmatter and set `status: filled`.

### Writing Agent Playbooks (.context/agents/)

Each playbook follows this structure:
1. **Mission** -- When to use this agent
2. **Responsibilities** -- Concrete task list
3. **Best Practices** -- Project-specific guidelines
4. **Collaboration Checklist** -- Step-by-step workflow

Available agents: `code-reviewer`, `bug-fixer`, `feature-developer`, `refactoring-specialist`, `test-writer`, `documentation-writer`, `performance-optimizer`.

### Writing Skill Guides (.context/skills/)

Skills use this structure:
1. **When to Use** -- Activation triggers
2. **Instructions** -- Step-by-step procedure
3. **Examples** -- Concrete, project-specific examples
4. **Checklist or Guidelines** -- Quick reference

### Updating CHANGELOG.md

Follow Keep a Changelog format. Group changes under version headers:

```markdown
## [0.7.2]

### Included Pull Requests
- [#XX](url) - type: description

### Added
- **Feature Name**: Details

### Changed
- **Area**: What changed

### Fixed
- **Bug**: What was fixed
```

### Writing Plan Documents (.context/plans/)

Plans are created via `context({ action: 'scaffoldPlan', planName: '...' })` or manually. Structure:

```markdown
---
type: plan
name: feature-name
planSlug: feature-name
status: active
---

# Feature Name

## Goal
What this achieves.

## Phases
### Phase 1: Planning
- [ ] Step 1
- [ ] Step 2

### Phase 2: Execution
- [ ] Step 1
```

## Content Guidelines

### For This Project Specifically

- Reference actual file paths: `src/services/mcp/mcpServer.ts`, not "the MCP server file"
- Use the project's terminology: "scaffolding" (not "templates"), "fill" (not "populate"), "gateway" (not "endpoint")
- Include CLI commands with the dev runner: `npx tsx src/index.ts <command>`
- Reference PREVC phases by letter and name: "Execution (E) phase"
- Mention the 9-tool MCP surface when discussing architecture
- Note Node >= 20 requirement and TypeScript strict mode

### Formatting Standards

- Use tables for structured comparisons
- Use code blocks with language tags for all code samples
- Keep paragraphs short (3-4 sentences max)
- Use headings to create scannable structure
- Frontmatter must be valid YAML between `---` delimiters

### i18n Awareness

- User-facing CLI strings should reference translation keys from `src/utils/i18n.ts`
- Documentation itself is written in English
- The project supports `en` and `pt-BR` locales

## Generating Documentation via MCP

Standalone CLI AI generation is not supported. Documentation completion flows through MCP:

- `context({ action: 'fillSingle', filePath: '/path/to/doc.md' })` -- returns semantic context and scaffold structure for one file
- `context({ action: 'fill', target: 'docs' })` -- returns batched guidance for multiple scaffold files
- `src/services/autoFill/autoFillService.ts` -- provides static starter content during scaffold generation

The MCP fill process:
1. Generates scaffolding through `context({ action: 'init' })`
2. Builds semantic context via `SemanticContextBuilder`
3. Returns scaffold structure and instructions to the connected AI tool
4. Lets the MCP client generate and write the final content
5. Updates the frontmatter to `status: filled`
