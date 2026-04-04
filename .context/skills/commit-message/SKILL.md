---
type: skill
name: Commit Message
description: Generate commit messages following conventional commits with scope detection
skillSlug: commit-message
phases: [E, C]
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---

# Commit Message

Generate consistent, informative commit messages for the `@dotcontext/cli` project.

## When to Use

- Committing code during the Execution (E) or Confirmation (C) phases
- After completing a feature, bug fix, or refactoring task
- When using the `plan({ action: 'commitPhase' })` MCP tool to auto-commit phase outputs

## Commit Format

This project follows **Conventional Commits** with scope detection:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Use When |
|------|----------|
| `feat` | Adding new functionality (new MCP tool, new generator, new CLI command) |
| `fix` | Fixing a bug (broken scaffold generation, incorrect path resolution) |
| `refactor` | Restructuring code without changing behavior (service extraction, gateway consolidation) |
| `docs` | Documentation only (README, CHANGELOG, `.context/` content) |
| `test` | Adding or updating tests |
| `chore` | Build, tooling, dependency updates |
| `ci` | CI/CD configuration |

### Scopes

Derive scope from the primary area of change:

| Scope | Directory/Area |
|-------|---------------|
| `mcp` | `src/services/mcp/` -- MCP server, gateway tools |
| `cli` | `src/index.ts` -- CLI commands, commander setup |
| `context` | `src/services/ai/tools/`, `src/services/init/` -- MCP scaffold and semantic-context flows |
| `init` | `src/services/init/` -- Scaffold initialization |
| `sync` | `src/services/sync/`, `src/services/export/`, `src/services/import/` |
| `semantic` | `src/services/semantic/` -- Tree-sitter, LSP, codebase analysis |
| `workflow` | `src/workflow/`, `src/services/workflow/` -- PREVC phases, gates |
| `generators` | `src/generators/` -- Doc, agent, plan, skill generators |
| `skills` | `src/workflow/skills/`, `.context/skills/` |
| `agents` | `src/generators/agents/`, `.context/agents/` |
| `plans` | `src/generators/plans/`, `src/services/mcp/gateway/plan.ts`, `.context/plans/` |
| `i18n` | `src/utils/i18n.ts` -- Translations |
| `utils` | `src/utils/` -- Frontmatter, git, CLI UI |
| `ai` | `src/services/ai/` -- AI SDK, providers, tools |
| `types` | `src/types/`, `src/types.ts` -- Type definitions |
| `deps` | `package.json` -- Dependency changes |

When changes span multiple scopes, use the most significant one or omit the scope.

## Instructions

### 1. Analyze the Diff

Look at what changed:
- Which services/files are modified?
- Is this a new feature, a fix, or a refactor?
- Does it touch user-facing behavior (CLI output, MCP responses)?

### 2. Choose Type and Scope

```
# New MCP gateway action
feat(mcp): add buildSemantic action to context gateway

# Bug fix in scaffold generation
fix(generators): handle missing frontmatter in skill scaffold files

# Refactoring workflow internals
refactor(workflow): extract gate checking into separate GateChecker class

# Updating translations
feat(i18n): add pt-BR translations for workflow status messages
```

### 3. Write the Description

- Use imperative mood ("add", "fix", "update", not "added", "fixes")
- Keep under 72 characters
- Focus on **what** changed and **why**, not implementation details
- Reference the affected MCP tool or CLI command when relevant

### 4. Add Body for Complex Changes

For multi-file changes, include context:

```
feat(mcp): add skill management gateway with 6 actions

Add the `skill` gateway tool to the MCP server with actions:
list, getContent, getForPhase, scaffold, export, fill.

Includes Zod schema validation, action logging via wrap(),
and barrel re-exports through gatewayTools.ts.
```

### 5. Add Footer When Applicable

```
# Breaking change
feat(mcp)!: consolidate project tools into context gateway

BREAKING CHANGE: Removed standalone project-setup and project-report
tools. Use context({ action: "init" }) and workflow-init instead.

# Issue reference
fix(semantic): handle missing tree-sitter gracefully

Closes #31

# Co-authored commits (used by plan commitPhase)
feat(workflow): implement PREVC phase auto-advance

Co-Authored-By: feature-developer <agent@ai-coders>
```

## Examples

```bash
# Small fix
git commit -m "fix(frontmatter): detect v2 scaffold format before v1 fallback"

# New feature
git commit -m "feat(mcp): add plan commitPhase action for git integration"

# Dependency update
git commit -m "chore(deps): upgrade @modelcontextprotocol/sdk to 1.25.2"

# Documentation
git commit -m "docs(skills): fill bug-investigation skill with project-specific content"

# Test addition
git commit -m "test(context): cover fillSingle guidance for generated scaffolds"

# Multi-scope refactor
git commit -m "refactor: extract gateway handlers into individual modules"
```

## PREVC Phase Commits

When using the plan tool's `commitPhase` action, commits are auto-generated with:
- Stage patterns defaulting to `[".context/**"]`
- Co-Author footer from the agent name
- Message format: `<type>(<scope>): complete <phase> phase for <plan>`

For manual phase commits, follow the same pattern:

```
feat(workflow): complete Planning phase for add-caching-layer

- Created PRD and tech spec in .context/plans/
- Defined acceptance criteria and test plan
- Linked plan to active workflow

Co-Authored-By: planner <agent@ai-coders>
```
