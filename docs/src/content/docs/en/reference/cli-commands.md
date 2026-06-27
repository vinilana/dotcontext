---
title: CLI commands reference
description: Complete reference for the dotcontext CLI — invocation, global options, every public command with flags and examples, and the hidden admin commands.
sidebar:
  order: 2
---

This page is the **complete command reference** for the dotcontext CLI. For a guided, task-oriented walkthrough, start with [Using the CLI](/guides/using-the-cli/) — then come back here when you need the exact flag for a specific command.

A quick mental model before the tables: **MCP creates and fills context; the CLI distributes and inspects it.** The CLI surface is deliberately focused on *sync*, *import/export*, *MCP setup*, *reports*, and *low-level admin*. Context creation, AI-generated fills, and plan scaffolding live on the [MCP server](/reference/mcp-tools/) instead.

## Invocation

The CLI ships as the `@dotcontext/cli` package and exposes a `dotcontext` binary. It requires Node `>=20`.

```bash
# Run on demand (no install) — opens interactive mode when given no command
npx -y @dotcontext/cli@latest

# Run a specific command
npx -y @dotcontext/cli@latest <command> [options]

# Or install globally and call the binary directly
npm install -g @dotcontext/cli
dotcontext <command> [options]
```

Running the binary with **no command** opens the interactive menu (see [Interactive mode](#interactive-mode)).

## Global options

These flags apply to the top-level program and most subcommands.

| Flag | Description | Default |
| --- | --- | --- |
| `-l, --lang <locale>` | Set interface language (`en`, `pt-BR`) | Detected from environment |
| `--version` | Print the CLI version | — |
| `--help` | Show help for the program or a command | — |

::: tip
`--help` works at every level. Try `dotcontext --help`, `dotcontext sync --help`, or `dotcontext admin workflow --help` to see the exact flags for any command.
:::

## Public commands

These commands appear in `dotcontext --help` and are the ones most operators use day to day.

| Command | What it does |
| --- | --- |
| [`sync`](#sync) | Export agent playbooks from `.context/agents` to AI tool directories |
| [`import-rules`](#import-rules) | Import rules from source files into `.context/docs/` |
| [`import-agents`](#import-agents) | Import agent definitions into `.context/agents/` |
| [`reverse-sync`](#reverse-sync) | Scan AI tool directories and import rules, agents, and skills into `.context/` |
| [`export-rules`](#export-rules) | Export `.context/docs/` rules to AI tool directories |
| [`mcp`](#mcp) | Start the MCP server (stdio transport) |
| [`mcp:install`](#mcpinstall) | Install MCP server config into supported AI tools |

Most commands accept a positional `[repo-path]` (defaults to the current working directory), along with `--dry-run` to preview, `--force` to overwrite, and `-v, --verbose` for extra output.

### sync

Export agent playbooks from `.context/agents` to one or more AI tool directories. (The hidden alias `sync-agents` does the same thing.)

| Flag | Description | Default |
| --- | --- | --- |
| `-s, --source <dir>` | Source directory | `./.context/agents` |
| `-t, --target <paths...>` | Target directory paths | — |
| `-m, --mode <type>` | Sync mode (`symlink` or `markdown`) | `symlink` |
| `-p, --preset <name>` | Preset targets (e.g. `claude`, `github`, `all`) | — |
| `--force` | Overwrite existing files | `false` |
| `--dry-run` | Preview changes without writing | `false` |
| `-v, --verbose` | Verbose output | `false` |

```bash
dotcontext sync --preset claude --force
dotcontext sync --source ./.context/agents --target ./.claude/agents --mode symlink
dotcontext sync --dry-run
```

### import-rules

Import rules from external source files into `.context/docs/`. Useful for pulling rules out of other tools' config files into your centralized context.

| Flag | Description | Default |
| --- | --- | --- |
| `[repo-path]` | Repository path to scan | cwd |
| `-s, --source <paths...>` | Source file or directory paths | — |
| `-t, --target <dir>` | Target directory in `.context/` | — |
| `-f, --format <format>` | Input format (e.g. `markdown`) | `markdown` |
| `--force` | Overwrite existing files | `false` |
| `--dry-run` | Preview changes | `false` |
| `--no-auto-detect` | Disable auto-detection of source files | auto-detect on |
| `-v, --verbose` | Verbose output | `false` |

```bash
dotcontext import-rules --source ./rules --target .context/docs
dotcontext import-rules --format markdown
dotcontext import-rules --dry-run
```

### import-agents

Import agent definitions from external source files into `.context/agents/`.

| Flag | Description | Default |
| --- | --- | --- |
| `[repo-path]` | Repository path to scan | cwd |
| `-s, --source <paths...>` | Source file or directory paths | — |
| `-t, --target <dir>` | Target directory in `.context/` | — |
| `--force` | Overwrite existing files | `false` |
| `--dry-run` | Preview changes | `false` |
| `--no-auto-detect` | Disable auto-detection of source files | auto-detect on |
| `-v, --verbose` | Verbose output | `false` |

```bash
dotcontext import-agents --source ./agents --target .context/agents
dotcontext import-agents --force
dotcontext import-agents --dry-run
```

### reverse-sync

The unified reverse import: scan AI tool directories (Claude Code, Cursor, GitHub Copilot, Windsurf, Cline, Continue, and more) and pull rules, agents, and skills back into `.context/`. This is the inverse of `sync`/`export-rules`.

| Flag | Description | Default |
| --- | --- | --- |
| `[repo-path]` | Repository path to scan | cwd |
| `--dry-run` | Preview changes without importing | `false` |
| `-f, --force` | Overwrite existing files | `false` |
| `--skip-agents` | Skip importing agents | `false` |
| `--skip-skills` | Skip importing skills | `false` |
| `--skip-rules` | Skip importing rules | `false` |
| `--merge-strategy <strategy>` | Conflict resolution: `skip`, `overwrite`, `merge`, `rename` | `skip` |
| `--format <format>` | Output format for rules: `formatted`, `markdown`, `raw` | `formatted` |
| `--no-metadata` | Do not add import metadata to files | metadata on |
| `-v, --verbose` | Verbose output | `false` |

```bash
dotcontext reverse-sync
dotcontext reverse-sync --skip-rules --skip-agents
dotcontext reverse-sync --merge-strategy merge --format formatted
dotcontext reverse-sync --dry-run
```

### export-rules

Export `.context/docs/` rules to AI tool directories. (Hidden from the top-level help, but a fully public command.)

| Flag | Description | Default |
| --- | --- | --- |
| `[repo-path]` | Repository path | cwd |
| `-s, --source <dir>` | Source rules directory | `.context/docs` |
| `-t, --targets <paths...>` | Target directories | — |
| `--preset <name>` | Preset targets | — |
| `--force` | Overwrite existing files | `false` |
| `--dry-run` | Preview changes | `false` |
| `-v, --verbose` | Verbose output | `false` |

```bash
dotcontext export-rules --source .context/docs --preset claude
dotcontext export-rules --targets .claude .github --force
dotcontext export-rules --dry-run
```

### mcp

Start the MCP server over stdio. Most users never run this by hand — AI clients launch it for you via the config written by `mcp:install`. Run it manually only when debugging the transport.

| Flag | Description | Default |
| --- | --- | --- |
| `-r, --repo-path <path>` | Default repository path for MCP tools | — |
| `-v, --verbose` | Enable verbose logging to stderr | `false` |

```bash
dotcontext mcp
dotcontext mcp --verbose
dotcontext mcp --repo-path /path/to/repo
```

::: note
There is no separate global binary for the server in the published CLI package — the `dotcontext-mcp` bin only exists in the isolated `@dotcontext/mcp` package build. From the CLI, start the server with `dotcontext mcp`. See [Architecture](/about/architecture/) for how the surfaces are split.
:::

### mcp:install

Install (or update) the MCP server configuration for a supported AI tool. Run with no tool name to pick interactively; pass a tool name to target it directly. See [Installing with MCP](/guides/using-with-mcp/) for the full list of supported clients and config paths.

MCP is the full dotcontext tool surface. For hook-capable targets, `mcp:install` can recommend lifecycle hooks after MCP config is handled. Hooks are recommended, optional, and non-blocking; they are eligible only for `claude` -> `claude-code`, `codex` -> `codex`, and `pi` -> `pi`.

| Flag | Description | Default |
| --- | --- | --- |
| `[tool]` | Specific tool name (omit to prompt interactively) | prompt |
| `-g, --global` | Install to global (home) config | `true` |
| `-l, --local` | Install to local/repo-level config | `false` |
| `--dry-run` | Preview changes without writing | `false` |
| `--with-hooks` | Install eligible recommended hooks after MCP without prompting | `false` |
| `--no-hooks` | Do not prompt, install, or print the hook recommendation | `false` |
| `--hook-format <json\|toml>` | Codex hook format for the recommended hook step | `json` |
| `-v, --verbose` | Verbose output | `false` |

```bash
dotcontext mcp:install
dotcontext mcp:install claude
dotcontext mcp:install --global
dotcontext mcp:install --local --dry-run
dotcontext mcp:install codex --with-hooks
dotcontext mcp:install codex --with-hooks --hook-format toml
dotcontext mcp:install codex --no-hooks
```

Interactive runs prompt for recommended hooks after MCP config when the selected target is Claude Code, Codex CLI, or Pi. Non-interactive runs never write hooks unless `--with-hooks` is provided. `--no-hooks` suppresses both prompts and recommendation output. `--with-hooks --no-hooks` is invalid.

MCP config is global by default; recommended hooks install project-local config by default. For Codex, run `/hooks` inside Codex and trust project hooks after config is written. For Pi, the combined flow uses the MCP installer for the MCP snippet and does not duplicate it from the Pi hook step.

## Interactive mode

Invoking the CLI with no arguments (`npx -y @dotcontext/cli@latest`) opens a guided menu. It first detects your project state — `new`, `unfilled`, `outdated`, or `uptodate` — then tailors the menu:

- **New project** — offers MCP install, reverse-sync, or settings.
- **Unfilled project** — lists pending files awaiting content, then shows the full menu.
- **Up-to-date project** — shows the full menu with sync statistics.

The full menu offers Quick Sync (unified sync for agents, skills, and docs), Reverse Sync, MCP Install, Settings (language selection), View Pending (when files await content), and Exit. The MCP Install action uses the same hook recommendation path as `mcp:install`: hooks are offered only for Claude Code, Codex CLI, and Pi, and remain optional.

## Hidden / admin commands

Admin commands cover **low-level workflow state management** and introspection utilities. They are the CLI counterpart to the MCP workflow tools — useful for scripting and debugging, but high-level workflow logic is MCP-first.

::: note[Dual registration]
Each admin command is registered **twice**: under the visible `admin` group *and* as a hidden top-level command. So both of these work and are equivalent:

```bash
dotcontext admin workflow status
dotcontext workflow status        # hidden alias, same command
```

The `admin <subcommand>` form is the documented, discoverable one (it shows up under `dotcontext admin --help`). The hidden top-level form is a convenience alias.
:::

The admin commands are:

| Command | Purpose |
| --- | --- |
| [`admin workflow`](#admin-workflow) | Manage PREVC workflow state and phase transitions |
| [`admin skill`](#admin-skill) | List and export skills |
| [`admin report`](#admin-report) | Generate workflow progress and health reports |
| `admin preview-splash` | Render the startup splash screen (internal debug utility) |

### admin workflow

Low-level PREVC workflow orchestration. Most subcommands accept `-r, --repo-path <path>` (defaults to cwd).

| Subcommand | Arguments / flags | Purpose |
| --- | --- | --- |
| `init <name>` | `-d, --description <text>`, `-s, --scale <QUICK\|SMALL\|MEDIUM\|LARGE>`, `-r, --repo-path <path>` | Initialize a new PREVC workflow |
| `status` | `-r, --repo-path <path>` | Show current phase and recommendations |
| `advance` | `-o, --outputs <files...>`, `-r, --repo-path <path>` | Complete the current phase and move to the next |
| `handoff <from> <to>` | `-a, --artifacts <files...>`, `-r, --repo-path <path>` | Transfer work between roles |
| `collaborate <topic>` | `-p, --participants <roles...>`, `-r, --repo-path <path>` | Start a cross-role collaboration session |
| `role <action> <role>` | `-o, --outputs <files...>`, `-r, --repo-path <path>` | Manage a single role (`start` / `complete`) |

```bash
dotcontext admin workflow init "dark-mode" --description "Add dark mode" --scale MEDIUM
dotcontext admin workflow status
dotcontext admin workflow advance --outputs report.md
dotcontext admin workflow handoff planner implementer --artifacts plan.md
dotcontext admin workflow collaborate "code review" --participants implementer reviewer
dotcontext admin workflow role complete reviewer --outputs review.md
```

::: caution
`admin workflow init` manages **workflow state**, not the `.context/` directory itself. Creating the context structure, filling docs, and scaffolding plans are MCP-first operations — see the [MCP tools reference](/reference/mcp-tools/) and the [PREVC workflow concept](/concepts/prevc-workflow/).
:::

### admin skill

Discover and distribute skills (on-demand expertise guides).

| Subcommand | Arguments / flags | Purpose |
| --- | --- | --- |
| `list` | `[repo-path]`, `--json` | List all available skills (built-in + custom) |
| `export` | `[repo-path]`, `-p, --preset <preset>`, `-f, --force`, `--include-builtin`, `--dry-run` | Export skills to AI tool directories |

`export` presets include `all` (default), `claude`, `github`, `windsurf`, `codex`, `antigravity`, and individual tool names.

```bash
dotcontext admin skill list --json
dotcontext admin skill export --preset all
dotcontext admin skill export --preset claude --force
dotcontext admin skill export --include-builtin --dry-run
```

### admin report

Generate a workflow progress and project health report.

| Flag | Description | Default |
| --- | --- | --- |
| `[repo-path]` | Repository path | cwd |
| `-f, --format <format>` | Output format: `console`, `json` | `console` |
| `-o, --output <path>` | Write to a file (omit to write to stdout) | stdout |
| `--include-stack` | Include stack traces in errors | `false` |
| `-v, --verbose` | Verbose output | `false` |

```bash
dotcontext admin report
dotcontext admin report --format json --output report.json
dotcontext admin report --include-stack --verbose
```

## What the CLI does not do

By design, the standalone CLI does **not** provide commands to create context from scratch, auto-generate documentation, scaffold PREVC plans, or run semantic code analysis. Those flows are AI-driven and live on the MCP server:

| Want to… | Use instead |
| --- | --- |
| Create the `.context/` structure | `context` MCP tool (`init`) — see [MCP tools](/reference/mcp-tools/) |
| Auto-fill docs and agents | `context` MCP tool (`fill`, `fillSingle`) |
| Scaffold and track PREVC plans | `plan` MCP tool and `workflow-init` |
| Analyze code / build semantic context | `context`/`explore` MCP tools |

## See also

- [Using the CLI](/guides/using-the-cli/) — task-oriented walkthrough of the commands above
- [Installing with MCP](/guides/using-with-mcp/) — set up the MCP server in your AI tool
- [MCP tools reference](/reference/mcp-tools/) — the AI-facing surface
- [Architecture](/about/architecture/) — how `cli`, `harness`, and `mcp` are split and published
