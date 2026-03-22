# Dotcontext Guide

`@dotcontext/cli` is an MCP-first toolkit for shared AI context, PREVC workflow tracking, and context import/export across coding tools.

This guide reflects the current product shape in `0.8.x`:

- Context creation and AI-generated fills happen through MCP-connected AI tools.
- The standalone CLI is still useful for workflow tracking, sync/import operations, and MCP setup.
- The public product name is `dotcontext`, and the package name is `@dotcontext/cli`.

## Start Here

The fastest path for most users is:

```bash
# 1. Install the MCP server into your AI tool
npx @dotcontext/cli mcp:install

# 2. In your AI tool, ask it to initialize context
# Example prompts:
#   init the context
#   plan authentication rollout using dotcontext
#   start the workflow

# 3. For non-trivial work, track execution from the CLI
npx @dotcontext/cli workflow init "feature-name"
```

If you are using the MCP path, you usually do not need an API key. Your AI tool provides the model.

## What The Package Does Today

| Area | Current Role |
| --- | --- |
| MCP setup | Installs and configures the `dotcontext` MCP server in tools like Claude Code, Cursor, Windsurf, Codex, and others |
| Context scaffolding | Creates and fills `.context/` content through MCP-connected AI tools |
| Workflow tracking | Manages PREVC phase progression from the CLI or MCP |
| Sync and imports | Exports rules and agents to AI tools, and imports existing tool-specific content back into `.context/` |
| Skills | Lists and exports built-in or project skills |

## What Changed

Older docs and examples may still refer to flows that are no longer the primary path.

- Standalone CLI generation is no longer the recommended path for creating or filling context.
- Use MCP-connected AI tools for context init, plan scaffolding, and AI-generated content.
- There is no top-level `quick-sync` command, but interactive quick sync is still available from `npx @dotcontext/cli`.

If you are looking for `init`, `fill`, `plan`, `update`, or `analyze` as direct CLI commands, that is expected. Those responsibilities moved into MCP workflows.

## Recommended Workflow

### 1. Install MCP

```bash
npx @dotcontext/cli mcp:install
```

This configures the `dotcontext` MCP server for supported AI tools. Use `--dry-run` to preview changes or `--local` to install in the current project instead of your home directory.

### 2. Initialize Context From Your AI Tool

After MCP is installed, ask your AI assistant to initialize the repository context. A typical flow is:

1. Initialize `.context/`
2. Fill pending docs, agents, or plans
3. Start a PREVC workflow when the task is not trivial

Typical prompts:

- `init the context`
- `plan this task using dotcontext`
- `fill the pending context files`

### 3. Track Execution With PREVC

For work that needs structure, use the workflow commands:

```bash
npx @dotcontext/cli workflow init "feature-name"
npx @dotcontext/cli workflow status
npx @dotcontext/cli workflow advance
```

The workflow uses PREVC:

| Phase | Meaning | Typical Output |
| --- | --- | --- |
| `P` | Planning | Requirements, PRD, scope |
| `R` | Review | Architecture, design decisions, approval |
| `E` | Execution | Code changes and implementation notes |
| `V` | Validation | Tests, QA, review feedback |
| `C` | Confirmation | Final docs, changelog, handoff |

For larger tasks, the workflow can also record handoffs and collaboration:

```bash
npx @dotcontext/cli workflow handoff feature-developer code-reviewer
npx @dotcontext/cli workflow collaborate "API contract review"
```

### 4. Sync or Import Context As Needed

Use the CLI when you need to move rules or agents between `.context/` and tool-specific directories.

Export rules:

```bash
npx @dotcontext/cli export-rules --preset cursor
```

Export agents:

```bash
npx @dotcontext/cli sync-agents --preset claude
```

Import rules or agents from existing tool configs:

```bash
npx @dotcontext/cli import-rules
npx @dotcontext/cli import-agents
```

Reverse-sync everything back into `.context/`:

```bash
npx @dotcontext/cli reverse-sync --dry-run
```

### 4a. Interactive Quick Sync

If you want a guided export flow instead of calling individual commands, use the interactive CLI:

```bash
npx @dotcontext/cli
```

The quick sync flow can export docs, agents, and skills together. It is part of the interactive experience, not a separate `quick-sync` command.

### 5. Review Progress

Generate a workflow report when you want a quick status snapshot:

```bash
npx @dotcontext/cli report
```

You can also export the report as Markdown or JSON.

## `.context/` Layout

The exact files vary by project type, but the working structure is centered on `.context/`:

```text
.context/
├── docs/        # Project documentation
├── agents/      # Agent playbooks
├── skills/      # On-demand expertise guides
├── plans/       # Plan templates and execution tracking
└── workflow/    # PREVC workflow state
```

The generated docs are project-aware. You should expect the content to differ between CLI tools, libraries, backends, frontends, and monorepos.

## CLI Reference

These are the main commands currently exposed by the CLI:

| Command | Purpose |
| --- | --- |
| `npx @dotcontext/cli` | Launch the interactive CLI, including quick sync |
| `npx @dotcontext/cli mcp:install` | Install MCP configuration for supported AI tools |
| `npx @dotcontext/cli mcp` | Start the MCP server manually |
| `npx @dotcontext/cli workflow ...` | Manage PREVC workflow state |
| `npx @dotcontext/cli skill list` | List available skills |
| `npx @dotcontext/cli skill export` | Export skills to AI tool directories |
| `npx @dotcontext/cli sync-agents` | Export agent playbooks to AI tools |
| `npx @dotcontext/cli export-rules` | Export `.context/docs` rules to AI tools |
| `npx @dotcontext/cli import-rules` | Import rules into `.context/docs` |
| `npx @dotcontext/cli import-agents` | Import agents into `.context/agents` |
| `npx @dotcontext/cli reverse-sync` | Import rules, agents, and skills into `.context/` |
| `npx @dotcontext/cli report` | Generate workflow progress reports |

## MCP Reference

The MCP server exposes focused tools instead of a large set of one-off commands.

| MCP Tool | Purpose |
| --- | --- |
| `explore` | Read files, list paths, search code, analyze symbols, inspect structure |
| `context` | Check/init/fill context, list pending files, build semantic context, scaffold plans |
| `workflow-init` | Start PREVC workflow tracking |
| `workflow-status` | Read current workflow status |
| `workflow-advance` | Advance to the next PREVC phase |
| `workflow-manage` | Handoffs, collaboration, docs, approvals, gate changes |
| `sync` | Export or import docs, rules, agents, and skills |
| `plan` | Link plans, update execution state, record decisions, commit phase artifacts |
| `agent` | Discover and orchestrate agents |
| `skill` | List, scaffold, export, and fill skills |

For AI-agent use, provide `repoPath` on the first context-heavy MCP call so dotcontext can cache the working repository.

## Skills

The current standalone skill commands are intentionally narrow:

```bash
npx @dotcontext/cli skill list
npx @dotcontext/cli skill export
```

Use the MCP `skill` tool when you want skill scaffolding or AI-assisted fill behavior. The CLI remains focused on discovery and export.

## Troubleshooting

### "CLI init/plan/fill command not found"

That is expected in the current product. Use an MCP-connected AI tool for context creation, plan scaffolding, and AI-generated fill operations.

### ".context/ does not exist yet"

Install MCP and ask your AI tool to initialize context first. If you already have tool-specific files elsewhere, use `reverse-sync` to import them.

### "Workflow not initialized"

Initialize the workflow after `.context/` exists:

```bash
npx @dotcontext/cli workflow init "feature-name"
```

### "I only need exports/imports"

You do not need the full PREVC workflow for that. Use the sync and import commands directly.

## Environment Notes

- Node.js `>=20` is required.
- The CLI supports English and `pt-BR`.
- The package name is `@dotcontext/cli`, the CLI command is `dotcontext`, and the MCP server name is also `dotcontext`.

## Quick Reference

```bash
npx @dotcontext/cli
npx @dotcontext/cli mcp:install
npx @dotcontext/cli workflow init "feature-name"
npx @dotcontext/cli workflow status
npx @dotcontext/cli workflow advance
npx @dotcontext/cli skill list
npx @dotcontext/cli skill export
npx @dotcontext/cli sync-agents --preset claude
npx @dotcontext/cli export-rules --preset cursor
npx @dotcontext/cli reverse-sync --dry-run
npx @dotcontext/cli report
```
