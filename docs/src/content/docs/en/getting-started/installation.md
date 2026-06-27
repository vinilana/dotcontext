---
title: Installation
description: Install dotcontext via the recommended MCP server flow or the standalone CLI, with no API key required.
sidebar:
  order: 2
---

dotcontext ships as five coordinated packages — `@dotcontext/mcp`, `@dotcontext/cli`, `@dotcontext/harness`, `@dotcontext/integrations`, and `@dotcontext/pi` — that follow the product shape `cli -> harness <- mcp` with host hooks via `integrations`. For day-to-day use you only need one of two install paths.

There are two ways to get started:

1. **MCP install (recommended)** — wires dotcontext into your AI client so context, planning, and the PREVC workflow run inside your assistant. No API key needed.
2. **CLI install** — a standalone command-line tool focused on sync and admin tasks (importing/exporting rules, agents, and skills between `.context/` and your AI tools).

:::tip[Recommended path]
Start with the MCP install. Context creation, AI-generated fills, and plan scaffolding are MCP-first, so the MCP server gives you the full product surface inside your assistant. Reach for the CLI when you need to sync artifacts or manage low-level state. See the [Quickstart](/getting-started/quickstart/) for the end-to-end flow.
:::

## Prerequisites

| Requirement | Version |
| --- | --- |
| Node.js | `>=20.0.0` |
| npm (or compatible runner) | bundled with Node |

You do **not** need an API key to install or run the MCP server. The server is launched on demand by your AI client via `npx`.

## Path 1: MCP install (recommended)

The MCP installer detects your installed AI clients and writes the correct MCP server configuration for each, so your assistant can call dotcontext tools directly.

```bash
npx @dotcontext/mcp install
```

If you prefer to drive the installer from the CLI, the equivalent command is:

```bash
npx -y @dotcontext/cli@latest mcp:install
```

When run without a tool name, the installer prompts you interactively and prioritizes clients it detects on your machine. You can also target a specific client directly:

```bash
npx -y @dotcontext/cli@latest mcp:install claude
```

MCP is the full dotcontext tool surface. For Claude Code, Codex CLI, and Pi, the CLI MCP flow also recommends lifecycle hooks after MCP is configured. Hooks are optional and non-blocking; they add deterministic session bootstrap, durable edit/bash traces, and PREVC workflow reminders.

In an interactive terminal, `mcp:install` prompts for recommended hooks only when the selected MCP target has a matching hook host: `claude` -> `claude-code`, `codex` -> `codex`, or `pi` -> `pi`. In non-interactive runs, hooks are never written unless you pass `--with-hooks`.

```bash
npx -y @dotcontext/cli@latest mcp:install codex --with-hooks
npx -y @dotcontext/cli@latest mcp:install codex --with-hooks --hook-format toml
npx -y @dotcontext/cli@latest mcp:install codex --no-hooks
```

Use `--no-hooks` when scripts should avoid both prompts and hook recommendation output. For Codex, `--hook-format json|toml` controls the hook config format used by the combined flow. After Codex project hooks are written, run `/hooks` inside Codex and trust the project hooks before expecting them to run.

### Supported AI clients

The installer supports **17 AI clients** and writes a client-specific config file for each:

| Client | Config file |
| --- | --- |
| Claude Code | `~/.claude.json` |
| Claude Desktop | platform-specific (e.g. `~/Library/Application Support/Claude/`) |
| Cursor | `.cursor/mcp.json` |
| Windsurf (Codeium) | `.codeium/windsurf/mcp_config.json` |
| Continue.dev | `.continue/mcpServers/dotcontext.json` |
| VS Code / GitHub Copilot | `.vscode/mcp.json` |
| Roo Code | `.roo/mcp_settings.json` |
| Amazon Q Developer CLI | `.aws/amazonq/mcp.json` |
| Google Gemini CLI | `.gemini/settings.json` |
| Codex CLI | `.codex/config.toml` (TOML format) |
| Kiro | `.kiro/settings/mcp.json` |
| Zed Editor | `.config/zed/settings.json` (`context_servers`) |
| JetBrains IDEs | `.config/JetBrains/mcp.json` |
| Trae AI (ByteDance) | `.trae/mcp.json` |
| Kilo Code | `.kilo/mcp.json` |
| GitHub Copilot CLI | `.copilot/mcp-config.json` |
| Pi | `.mcp.json` (local) or `~/.config/mcp/mcp.json` (global) |

### What the installer writes

For every supported client the installer writes the same standard MCP server entry (with TOML formatting for Codex and the appropriate wrapper key for clients like Zed and JetBrains):

```json
{
  "command": "npx",
  "args": ["-y", "@dotcontext/mcp@latest"],
  "env": {}
}
```

Installation behavior:

- Creates the config file if it does not exist, or updates an existing one if dotcontext is not already configured.
- Ensures parent directories exist before writing.
- Merges with existing client config without overwriting unrelated MCP servers.

### CLI install flags

For the CLI `dotcontext mcp:install` flow:

| Flag | Description | Default |
| --- | --- | --- |
| `[tool]` | Target a specific client (omit to choose interactively) | prompts |
| `-g, --global` | Write to the global (home directory) config | `true` |
| `-l, --local` | Write to the local/repo-level config | — |
| `--dry-run` | Preview the changes without writing any files | — |
| `--with-hooks` | Install eligible recommended hooks after MCP without prompting | — |
| `--no-hooks` | Do not prompt, install, or print the hook recommendation | — |
| `--hook-format json\|toml` | Codex hook format for the recommended hook step | `json` |
| `-v, --verbose` | Verbose output | — |

:::note
Global install is the default: the installer scans your home directory for installed tools and prioritizes them. Use `--local` to write a per-project config (such as `.mcp.json` or a tool-specific directory) instead. Combine with `--dry-run` to review changes safely first.
:::

:::note[Hook scope]
MCP config remains global by default. Recommended hooks install project-local config by default, matching `dotcontext hook install`. Use `dotcontext hook install <host> --global` when you intentionally want home-directory hook config.
:::

For Pi, the combined `mcp:install pi --with-hooks` flow uses the MCP installer for the `.mcp.json` snippet and the Pi hook step for extension guidance. It should not duplicate the MCP snippet.

After installing, restart your AI client so it picks up the new MCP server. Then continue with the [Quickstart](/getting-started/quickstart/).

## Path 1b: Hook install (Claude Code, Codex CLI, Pi)

Lifecycle hooks wire dotcontext into host session events — context bootstrap on start, durable traces after file edits, and workflow reminders on stop. They complement MCP: hooks are recommended, optional, non-blocking background wiring; MCP remains the full tool surface.

```bash
npx -y @dotcontext/cli@latest hook install
```

Target a specific host or preview changes:

```bash
npx -y @dotcontext/cli@latest hook install claude-code --dry-run
npx -y @dotcontext/cli@latest hook install codex
npx -y @dotcontext/cli@latest hook install codex --format toml
npx -y @dotcontext/cli@latest hook install claude-code --global
```

| Host | What gets written | After install |
| --- | --- | --- |
| `claude-code` | `hooks` entries in `.claude/settings.json` | Restart Claude Code |
| `codex` | `.codex/hooks.json` or inline `[[hooks.*]]` in `.codex/config.toml` | Run `/hooks` and trust project hooks |
| `pi` | Extension install guidance, with an optional MCP snippet only in standalone hook flow | Run `pi install npm:@dotcontext/pi` |

Hook install writes project-level config by default. Use `--global` for home-directory hook config, `--dry-run` to preview changes, and `-v, --verbose` for detailed output. Codex also accepts `--format json|toml`.

Actions are logged to `.context/logs/hook-install.log`. For Codex setup checks, run:

```bash
npx -y @dotcontext/cli@latest hook doctor codex
```

See [Using dotcontext with hooks](/guides/using-with-hooks/) for lifecycle details.

## Path 1c: Pi extension

Pi uses an in-process npm extension instead of shell hook dispatch:

```bash
npx -y @dotcontext/cli@latest hook install pi
pi install npm:@dotcontext/pi
```

For the full MCP tool surface inside Pi, also run:

```bash
npx @dotcontext/mcp install pi --local
pi install npm:pi-mcp-adapter
```

See [Using dotcontext with Pi](/guides/using-with-pi/) for the recommended hooks + MCP setup.

## Path 2: CLI install

The standalone CLI is **sync and admin focused**. Use it to distribute artifacts between `.context/` and your AI tool directories, run reverse imports, and manage low-level workflow state.

Run it on demand with no install:

```bash
npx -y @dotcontext/cli@latest
```

Running it with no arguments opens an interactive, guided menu that detects your project state (new, unfilled, or up to date) and offers Quick Sync, Reverse Sync, MCP Install, and Settings.

You can also run any command directly:

```bash
npx -y @dotcontext/cli@latest sync --preset claude --force
npx -y @dotcontext/cli@latest reverse-sync --dry-run
```

### Global install

To get a persistent `dotcontext` binary on your `PATH`:

```bash
npm install -g @dotcontext/cli
dotcontext
```

### What the CLI does (and does not) do

The CLI surface covers:

- `sync` — export agent playbooks from `.context/agents` to AI tool directories
- `import-rules` / `import-agents` — bring external rules and agents into `.context/`
- `reverse-sync` — scan AI tool directories and import rules, agents, and skills back into `.context/`
- `export-rules` — distribute `.context/docs/` rules out to AI tools
- `mcp` / `mcp:install` — start the MCP server or configure it for AI clients
- `hook install` / `hook uninstall` — wire lifecycle hooks for Claude Code, Codex CLI, or Pi
- `admin` — low-level workflow state, skill export, and reports

:::caution[MCP-first features]
Context creation, AI-generated fills, and plan scaffolding are **not** standalone CLI commands — they run through the MCP server. If you want those, use the MCP install path above. See [How dotcontext works](/about/architecture/) for the boundary between the CLI, harness, and MCP surfaces.
:::

## Verify your install

After the MCP install, confirm your AI client can see the dotcontext tools (for example, `context`, `explore`, `workflow-init`, and `harness`). A quick check is to ask your assistant to run the context check tool against your repository, which is the first step in the [Quickstart](/getting-started/quickstart/).

## Next steps

- [Quickstart](/getting-started/quickstart/) — initialize `.context/` and start your first PREVC workflow.
- [Using dotcontext with hooks](/guides/using-with-hooks/) — Claude Code and Codex CLI lifecycle hooks.
- [Using dotcontext with Pi](/guides/using-with-pi/) — Pi extension and MCP coexistence.
- [The PREVC workflow](/concepts/prevc-workflow/) — understand the five phases.
- [MCP tools reference](/reference/mcp-tools/) — full list of tools and parameters.

For source and issues, see [github.com/vinilana/dotcontext](https://github.com/vinilana/dotcontext).
