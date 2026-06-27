---
title: Using the CLI
description: A practical guide to the standalone dotcontext CLI — invocation, interactive mode, and the sync, import/export, report, and MCP-setup commands it provides.
sidebar:
  order: 2
---

The dotcontext CLI is the **operator-facing** surface of the runtime. Where the [MCP server](/guides/using-with-mcp/) gives your coding agent live, in-loop access to context and the PREVC workflow, the CLI is what *you* run from a terminal to move artifacts between `.context/` and your AI tools, install the MCP server, and inspect workflow progress.

A good mental model: **MCP creates and fills context; the CLI distributes and inspects it.**

::: tip[Recommended path]
Most users never need to install the CLI globally. Run it on demand with `npx`, and use the [MCP install flow](/guides/using-with-mcp/) for the parts that benefit from an agent (init, fill, plan, analyze).
:::

## Invocation

The CLI ships as `@dotcontext/cli` and exposes a `dotcontext` binary. It requires Node `>=20`.

```bash
# Run on demand (no install) — opens interactive mode
npx -y @dotcontext/cli@latest

# Run a specific command
npx -y @dotcontext/cli@latest <command> [options]

# Or install globally and call the binary directly
npm install -g @dotcontext/cli
dotcontext <command> [options]
```

### Global options

| Flag | Description | Default |
| --- | --- | --- |
| `-l, --lang <locale>` | Set interface language (`en`, `pt-BR`) | Detected from environment |
| `--version` | Print the CLI version | — |
| `--help` | Show help for a command | — |

## Interactive mode

Run the CLI with **no arguments** to enter a guided menu. The CLI first detects your project state and tailors what it offers:

| Detected state | What you see |
| --- | --- |
| **New** project (no `.context/`) | MCP install, reverse sync, or settings |
| **Unfilled** project (scaffold exists, pending files) | Pending-file list, then the full menu |
| **Up-to-date** project | Full menu with sync stats |

The full menu surfaces these actions:

- **Quick Sync** — unified export of agents, skills, and docs to your AI tools, with target customization
- **Reverse Sync** — interactive import from AI tool directories back into `.context/`
- **MCP Install** — interactive MCP server setup
- **Settings** — language selection
- **View Pending** — list files awaiting content (shown when the project is unfilled)
- **Exit**

::: note
Interactive mode is the friendliest entry point. Every action it performs maps to one of the explicit commands below, so once you know the flow you can script it.
:::

## Core commands

The CLI's public surface is focused on **sync, import/export, MCP setup, and reporting**. For the full flag-by-flag breakdown, see the [CLI reference](/reference/cli-commands/).

### Sync agents to your tools

`sync` exports agent playbooks from `.context/agents` to one or more AI tool directories.

```bash
# Symlink agents into Claude Code's directory
dotcontext sync --source ./.context/agents --target ./.claude/agents --mode symlink

# Use a preset target and overwrite existing files
dotcontext sync --preset claude --force

# Preview without writing
dotcontext sync --dry-run
```

Key options: `-s, --source <dir>` (default `./.context/agents`), `-t, --target <paths...>`, `-m, --mode <symlink|...>`, `-p, --preset <name>`, `--force`, `--dry-run`, `-v, --verbose`.

### Export rules and docs

`export-rules` distributes documentation and rules from `.context/docs` to AI tool configuration directories.

```bash
dotcontext export-rules --source .context/docs --preset claude
dotcontext export-rules --targets .claude .github --force
dotcontext export-rules --dry-run
```

### Import from external sources

Two focused importers bring outside material *into* `.context/`:

```bash
# Import rules/docs from external files into .context/docs
dotcontext import-rules --source ./rules --target .context/docs

# Import agent definitions into .context/agents
dotcontext import-agents --source ./agents --target .context/agents
```

Both accept `--dry-run`, `--force`, and `--no-auto-detect` (auto-detection of source files is on by default).

### Reverse sync (pull everything back)

`reverse-sync` is the unified importer: it scans your AI tool directories (Claude Code, Cursor, GitHub Copilot, Windsurf, Cline, Continue, and more) and pulls **rules, agents, and skills** back into `.context/`.

```bash
# Import everything it finds
dotcontext reverse-sync

# Skip categories you don't want
dotcontext reverse-sync --skip-rules --skip-agents

# Control how conflicts are resolved
dotcontext reverse-sync --merge-strategy merge --format formatted

# Preview first
dotcontext reverse-sync --dry-run
```

`--merge-strategy` accepts `skip` (default), `overwrite`, `merge`, or `rename`. Use `--no-metadata` to skip the import frontmatter that the CLI adds by default.

### Generate reports

`report` (under `admin`) inspects workflow progress, artifact inventory, and project health.

```bash
dotcontext admin report
dotcontext admin report --format json
dotcontext admin report --format console --output report.txt
dotcontext admin report --include-stack
```

`--format` is `console` (default) or `json`; omit `--output` to write to stdout.

### Manage skills

```bash
# List built-in and custom skills
dotcontext admin skill list
dotcontext admin skill list --json

# Export skills to AI tools
dotcontext admin skill export --preset all
dotcontext admin skill export --preset claude --force
```

## MCP setup from the CLI

The CLI is also how you wire the MCP server into your editor or agent. There are two distinct commands.

### Install the MCP config

`mcp:install` writes (or updates) the MCP server entry in your AI tool's configuration. Run it interactively, or name a tool directly.

```bash
# Interactive — detects installed tools and prompts
dotcontext mcp:install

# Target a specific tool
dotcontext mcp:install claude

# Choose scope and preview
dotcontext mcp:install --global
dotcontext mcp:install --local --dry-run

# Install MCP plus eligible recommended hooks
dotcontext mcp:install codex --with-hooks
```

Options: `[tool]` (omit to be prompted), `-g, --global` (default), `-l, --local`, `--dry-run`, `--with-hooks`, `--no-hooks`, `--hook-format json|toml`, and `-v, --verbose`. Hooks are recommended and optional for Claude Code, Codex CLI, and Pi; they install project-local config by default. See [Using dotcontext with MCP](/guides/using-with-mcp/) for the full list of supported tools and config paths.

### Run the MCP server

`mcp` launches the server itself — this is what an MCP client invokes under the hood.

```bash
dotcontext mcp
dotcontext mcp --verbose
dotcontext mcp --repo-path /path/to/repo
```

Options: `-r, --repo-path <path>` (default repo for MCP tools), `-v, --verbose` (logs to stderr).

::: note
You normally don't run `dotcontext mcp` by hand. The MCP config installed by `mcp:install` (or by `npx @dotcontext/mcp install`) starts the server for you when your agent connects.
:::

## What the CLI does *not* do

This is the most important thing to internalize. **Context creation, AI-generated fills, and plan scaffolding are MCP-first.** The standalone CLI has no direct commands for:

| Capability | Where it lives | Notes |
| --- | --- | --- |
| `init` — create `.context/` from scratch | MCP `context` tool (`action: "init"`) | The CLI's `admin workflow init` manages workflow *state*, not context scaffolding |
| `fill` — auto-generate doc content | MCP `context` tool (`fill`, `fillSingle`) | Requires the Claude-powered MCP runtime |
| `plan` — scaffold PREVC plans | MCP `context` tool (`scaffoldPlan`) and `plan` tool | — |
| `update` — systematic rule rewrites | MCP `context` tool | The CLI only imports/exports rules verbatim |
| `analyze` — code analysis & semantic indexing | MCP `explore` / `context` tools | — |

The CLI surface is deliberately **sync- and admin-focused**: it distributes artifacts between `.context/` and AI tool directories, manages low-level workflow state, and provides introspection utilities. Anything that needs a model to *generate* content is delegated to the MCP server.

::: caution
`dotcontext admin workflow init "name"` exists, but it initializes **PREVC workflow state** — it does not scaffold the `.context/` directory. To create context, use the MCP `context` tool. See [Using dotcontext with MCP](/guides/using-with-mcp/).
:::

## Where to go next

- [CLI commands reference](/reference/cli-commands/) — every command, flag, and default
- [Using dotcontext with MCP](/guides/using-with-mcp/) — the agent-driven half of the product
- [Installation](/getting-started/installation/) — install paths for CLI and MCP
- [The `.context` convention](/concepts/context-convention/) — what the CLI is syncing

Source on [GitHub](https://github.com/vinilana/dotcontext).
