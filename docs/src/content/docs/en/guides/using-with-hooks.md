---
title: Using dotcontext with Hooks
description: Install lifecycle hooks for Claude Code, Codex CLI, and Pi — context bootstrap, durable traces, and workflow reminders without loading the full MCP surface on every turn.
sidebar:
  order: 2
---

Host hooks connect dotcontext to your coding agent's lifecycle events. Instead of relying on MCP for every session start and file edit, hooks run lightweight harness calls in the background: check whether `.context/` exists, append traces after write/edit/bash tools, and surface PREVC workflow status when a session ends with an active PREVC workflow.

This guide covers installation, what each hook does, and how hooks complement MCP. Hooks are recommended for supported hosts, but optional and non-blocking; MCP remains the full dotcontext tool surface.

:::tip[Hooks vs MCP]
Use **hooks** for low-token bootstrap, tracing, and workflow reminders. Use **MCP** for the full tool surface (`context init`, `workflow-init`, sensors, plan linking, and more). Most Claude Code, Codex CLI, and Pi users benefit from both.
:::

## Supported hosts

| Host | Install command | Config location |
| --- | --- | --- |
| Claude Code | `dotcontext hook install claude-code` | `.claude/settings.json` by default, or `~/.claude/settings.json` with `--global` |
| Codex CLI | `dotcontext hook install codex` | `.codex/hooks.json` by default, or inline `.codex/config.toml` with `--format toml` |
| Pi | `dotcontext hook install pi` | Pi extension install guidance for `pi install npm:@dotcontext/pi` |

Pi uses an in-process extension instead of shell hooks. See [Using dotcontext with Pi](/guides/using-with-pi/).

## Install hooks

The hook installer writes project-local config by default:

```bash
# Interactive — detects installed hosts
npx -y @dotcontext/cli@latest hook install

# Target a specific host
npx -y @dotcontext/cli@latest hook install claude-code

# Inline Codex TOML config
npx -y @dotcontext/cli@latest hook install codex --format toml

# Home-directory config
npx -y @dotcontext/cli@latest hook install claude-code --global

# Preview without writing
npx -y @dotcontext/cli@latest hook install claude-code --dry-run --verbose
```

### Install flags

| Flag | Description | Default |
| --- | --- | --- |
| `[host]` | Target `claude-code`, `codex`, or `pi` (omit to choose interactively) | prompts |
| `-g, --global` | Write to the global (home directory) config | — |
| `-l, --local` | Write to the local/repo-level config | `true` |
| `--dry-run` | Preview changes without writing files | — |
| `--format json\|toml` | Codex only: separate `hooks.json` vs inline TOML blocks | `json` |
| `-v, --verbose` | Verbose output | — |

Install actions are logged to `.context/logs/hook-install.log`.

You can also install eligible hooks from the CLI MCP flow. Interactive `mcp:install` prompts after MCP config for Claude Code, Codex CLI, and Pi only. Non-interactive runs require `--with-hooks` to write hook config, and `--no-hooks` suppresses the recommendation output:

```bash
npx -y @dotcontext/cli@latest mcp:install claude --with-hooks
npx -y @dotcontext/cli@latest mcp:install codex --with-hooks --hook-format toml
npx -y @dotcontext/cli@latest mcp:install pi --with-hooks
npx -y @dotcontext/cli@latest mcp:install codex --no-hooks
```

`--hook-format json|toml` controls only the Codex hook format in the combined MCP flow. Recommended hooks install project-local config by default, even though MCP config is global by default.

## What hooks do

All supported hosts run the same harness actions; only the event envelope differs.

| Lifecycle moment | Harness action | Host effect |
| --- | --- | --- |
| Session start (no `.context/`) | `context` → `check` | Return a short JSON-safe hint to configure MCP and run `context init`; does not create `.context/runtime` |
| Session start (`.context/` partial) | `context` → `check` | List up to three missing setup areas, such as `workflow` or `plans` |
| Session start (`.context/` ready) | `context` → `check`, then harness session binding and `context` → `getMap` | Inject compact context/navigation, daily no-workflow reminder, or active PREVC preflight |
| Post tool use (Write / Edit / Bash) | `harness` → `appendTrace` | Append durable trace under `.context/runtime/`; Bash traces get best-effort classification |
| Stop / session end | `workflow-guide` | Inject compact PREVC next steps, skills, and gate hints only when an active PREVC workflow exists |

Hooks are **non-blocking by default**. Harness errors do not stop your agent session. Stop/session-end hooks also stay silent when no PREVC workflow is active, when workflow state is missing or malformed, and during host reentry. Those cases return successful no-ops so hook feedback cannot create end-of-turn noise.

Hook dispatch resolves the repository root as `--repo-path` first, then the nearest parent directory with `.context/`, then `cwd`, then `process.cwd()`. This keeps traces attached to the expected root when a host session starts in a monorepo subdirectory.

Bash classification is best-effort and only reads the command already supplied by the host. Examples: `npm test`, `vitest`, and `jest` become `test`; `npm run build` and `tsc` become `build`; `eslint` and `npm run lint` become `lint`; `git status` and `git diff` become `inspection`.

Repeated trace append failures are recorded under `.context/runtime/hooks/trace-failures.json` and are surfaced by `hook doctor`; the first failure remains silent to the host.

## Claude Code

The installer writes `hooks` entries to Claude Code settings. Each entry runs:

```bash
npx -y @dotcontext/cli@latest hook dispatch --source claude-code
```

Wired events (v1):

| Event | Matcher |
| --- | --- |
| `SessionStart` | `*` |
| `PostToolUse` | `^Write$\|^Edit$\|^Bash$` |
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
npx -y @dotcontext/cli@latest hook install codex --format toml
```

The installer also enables `[features].hooks = true` when that flag is missing.

:::caution[Trust project hooks]
After install, run `/hooks` in Codex and **trust project hooks** when prompted. This is a required activation step. Without trust, Codex can have `.codex/hooks.json` or `.codex/config.toml` configured but will not execute the dispatch commands.
:::

### Verify

Edit a file through Codex, then inspect `.context/runtime/sessions/*/trace.jsonl` for a `tool.use` trace entry.

Run the hook doctor for a machine-readable or human-readable setup checklist:

```bash
npx -y @dotcontext/cli@latest hook doctor codex
npx -y @dotcontext/cli@latest hook doctor codex --json
```

The Codex doctor checks `.codex/hooks.json` or `.codex/config.toml`, `[features].hooks = true` for TOML hooks, current dotcontext dispatch commands, `.context/`, workflow state, recent traces, and trace append failures.

## Uninstall

Remove dotcontext hook entries without touching unrelated config:

```bash
npx -y @dotcontext/cli@latest hook uninstall claude-code
npx -y @dotcontext/cli@latest hook uninstall codex --format toml
```

Use `--dry-run` to preview removals first.

## Advanced: explicit dispatch

Power users can opt into explicit harness tool dispatch by setting `DOTCONTEXT_HOOK_TOOL` to any supported harness adapter tool name. This is advanced and not required for the default lifecycle wiring.

## Combine with MCP

Recommended setup for Claude Code, Codex CLI, or Pi:

1. Install MCP for the full tool surface, optionally with recommended hooks in the same CLI flow:

   ```bash
   npx -y @dotcontext/cli@latest mcp:install claude --with-hooks
   # or
   npx -y @dotcontext/cli@latest mcp:install codex --with-hooks --hook-format toml
   # or
   npx -y @dotcontext/cli@latest mcp:install pi --with-hooks
   ```

2. If you installed MCP through `@dotcontext/mcp install` or skipped hooks, install hooks separately for background bootstrap and tracing:

   ```bash
   npx -y @dotcontext/cli@latest hook install claude-code
   # or
   npx -y @dotcontext/cli@latest hook install codex
   # or
   npx -y @dotcontext/cli@latest hook install pi
   ```

3. If you installed Codex hooks, run `/hooks` in Codex and trust project hooks.

4. For Pi, the combined `mcp:install pi --with-hooks` flow uses the MCP installer for the MCP snippet and does not duplicate it from the Pi hook step.

5. Initialize context through your agent (MCP `context init`), then let hooks keep sessions and traces warm on every subsequent start.

## Next steps

- [Installation](/getting-started/installation/) — MCP, hooks, and Pi install paths.
- [Using dotcontext with MCP](/guides/using-with-mcp/) — the full MCP tool surface.
- [The harness runtime](/concepts/harness-runtime/) — sessions, traces, and artifacts.
- [The PREVC workflow](/concepts/prevc-workflow/) — what `workflow-guide` reports on stop.
