---
title: Using dotcontext with Hooks
description: Install lifecycle hooks for Claude Code and Codex CLI — context bootstrap, durable traces, and workflow reminders without loading the full MCP surface on every turn.
sidebar:
  order: 2
---

Host hooks connect dotcontext to your coding agent's lifecycle events. Instead of relying on MCP for every session start and file edit, hooks run lightweight harness calls in the background: check whether `.context/` exists, append traces after write/edit/bash tools, and surface PREVC workflow status when a session ends.

This guide covers installation, what each hook does, and how hooks complement MCP.

:::tip[Hooks vs MCP]
Use **hooks** for low-token bootstrap, tracing, and workflow reminders. Use **MCP** for the full tool surface (`context init`, `workflow-init`, sensors, plan linking, and more). Most Claude Code and Codex CLI users benefit from both.
:::

## Supported hosts

| Host | Install command | Config location |
| --- | --- | --- |
| Claude Code | `dotcontext hook install claude-code` | `~/.claude/settings.json` or `.claude/settings.json` |
| Codex CLI | `dotcontext hook install codex` | `.codex/hooks.json`, `~/.codex/hooks.json`, or inline in `.codex/config.toml` |

Pi uses an in-process extension instead of shell hooks. See [Using dotcontext with Pi](/guides/using-with-pi/).

## Install hooks

The hook installer mirrors MCP install flags:

```bash
# Interactive — detects installed hosts
npx -y @dotcontext/cli@latest hook install

# Target a specific host
npx -y @dotcontext/cli@latest hook install claude-code

# Project-local config
npx -y @dotcontext/cli@latest hook install codex --local

# Preview without writing
npx -y @dotcontext/cli@latest hook install claude-code --dry-run --verbose
```

### Install flags

| Flag | Description | Default |
| --- | --- | --- |
| `[host]` | Target `claude-code`, `codex`, or `pi` (omit to choose interactively) | prompts |
| `-g, --global` | Write to the global (home directory) config | `true` |
| `-l, --local` | Write to the local/repo-level config | — |
| `--dry-run` | Preview changes without writing files | — |
| `--format json\|toml` | Codex only: separate `hooks.json` vs inline TOML blocks | `json` |
| `-v, --verbose` | Verbose output | — |

Install actions are logged to `.context/logs/hook-install.log`.

## What hooks do

All supported hosts run the same harness actions; only the event envelope differs.

| Lifecycle moment | Harness action | Host effect |
| --- | --- | --- |
| Session start | `context` → `check` | Inject compact index excerpt when `.context/` exists |
| Session start (no `.context/`) | none (informational) | One-line hint to run MCP init or initialize context |
| Post tool use (Write / Edit / Bash) | `harness` → `appendTrace` | Append durable trace under `.context/runtime/` |
| Stop / session end | `workflow-guide` | Inject compact PREVC next steps, skills, and gate hints |

Hooks are **non-blocking by default**. Harness errors do not stop your agent session.

## Claude Code

The installer writes `hooks` entries to Claude Code settings. Each entry runs:

```bash
npx -y @dotcontext/cli@latest hook dispatch --source claude-code
```

Wired events (v1):

| Event | Matcher |
| --- | --- |
| `SessionStart` | `*` |
| `PostToolUse` | `Write\|Edit\|Bash` |
| `Stop` | `*` |

After install, restart Claude Code. On the next session start in a repo with `.context/`, you should see a compact bootstrap message injected into context.

### Verify

```bash
npx -y @dotcontext/cli@latest hook install claude-code --dry-run
```

Start a Claude Code session in a repository with `.context/` initialized and confirm bootstrap content appears.

## Codex CLI

Codex hooks use the same dispatch command with `--source codex`:

```bash
npx -y @dotcontext/cli@latest hook dispatch --source codex
```

The installer writes either:

- **JSON** — `.codex/hooks.json` with a `{ "hooks": { ... } }` wrapper, or
- **TOML** — inline `[[hooks.SessionStart]]` blocks appended to `.codex/config.toml`

For TOML install:

```bash
npx -y @dotcontext/cli@latest hook install codex --local --format toml
```

The installer also enables `[features].hooks = true` when that flag is missing.

:::caution[Trust project hooks]
After install, run `/hooks` in Codex and **trust project hooks** when prompted. Without trust, Codex will not execute the dispatch commands.
:::

### Verify

Edit a file through Codex, then inspect `.context/runtime/sessions/*/trace.jsonl` for a `tool.use` trace entry.

## Uninstall

Remove dotcontext hook entries without touching unrelated config:

```bash
npx -y @dotcontext/cli@latest hook uninstall claude-code --local
npx -y @dotcontext/cli@latest hook uninstall codex --local --format toml
```

Use `--dry-run` to preview removals first.

## Advanced: explicit dispatch

Power users can opt into explicit harness tool dispatch by setting `DOTCONTEXT_HOOK_TOOL` to any supported harness adapter tool name. This is advanced and not required for the default lifecycle wiring.

## Combine with MCP

Recommended setup for Claude Code or Codex CLI:

1. Install MCP for the full tool surface:

   ```bash
   npx @dotcontext/mcp install claude
   # or
   npx @dotcontext/mcp install codex --local
   ```

2. Install hooks for background bootstrap and tracing:

   ```bash
   npx -y @dotcontext/cli@latest hook install claude-code --local
   # or
   npx -y @dotcontext/cli@latest hook install codex --local
   ```

3. Initialize context through your agent (MCP `context init`), then let hooks keep sessions and traces warm on every subsequent start.

## Next steps

- [Installation](/getting-started/installation/) — MCP, hooks, and Pi install paths.
- [Using dotcontext with MCP](/guides/using-with-mcp/) — the full MCP tool surface.
- [The harness runtime](/concepts/harness-runtime/) — sessions, traces, and artifacts.
- [The PREVC workflow](/concepts/prevc-workflow/) — what `workflow-guide` reports on stop.
