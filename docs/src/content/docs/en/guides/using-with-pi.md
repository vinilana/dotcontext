---
title: Using dotcontext with Pi
description: Install the @dotcontext/pi extension for in-process lifecycle hooks, combine it with MCP via pi-mcp-adapter, and keep bootstrap, tracing, and workflow reminders running in Pi sessions.
sidebar:
  order: 3
---

Pi is a host that uses **TypeScript extensions** instead of shell-based hook dispatch. The `@dotcontext/pi` npm package registers in-process handlers for session lifecycle events and calls the same harness runtime that MCP and the CLI use.

This guide covers the recommended hooks + MCP setup, what the extension does, and how to verify it is working.

:::tip[Two surfaces, one runtime]
The **Pi extension** (`@dotcontext/pi`) handles low-token bootstrap, tracing, and workflow reminders. **MCP via `pi-mcp-adapter`** exposes the full dotcontext tool surface (`context init`, `workflow-init`, sensors, plan linking, and more). Use both for the complete experience.
:::

## Recommended setup

Run these from your project root:

```bash
# 1. Pi extension (in-process hooks)
pi install npm:@dotcontext/pi

# 2. dotcontext MCP config
npx @dotcontext/mcp install pi --local

# 3. MCP adapter for Pi
pi install npm:pi-mcp-adapter
```

Or use the hook installer, which prints Pi instructions and can write a starter `.mcp.json`:

```bash
npx -y @dotcontext/cli@latest hook install pi --local
pi install npm:@dotcontext/pi
pi install npm:pi-mcp-adapter
```

Project-local Pi extension install:

```bash
pi install -l npm:@dotcontext/pi
```

## What the extension does

The default export registers handlers through Pi's `ExtensionAPI`:

| Pi event | Harness call | Effect |
| --- | --- | --- |
| `session_start` | `context` → `check` (+ optional navigation excerpt) | Inject bootstrap message or resource when `.context/` exists |
| `tool_execution_end` | `harness` → `appendTrace` for write/edit/bash tools | Silent durable trace under `.context/runtime/` |
| `agent_end` | `workflow-status` | Optional UI notification with PREVC phase summary |

When `.context/` is missing, `session_start` injects a one-line hint to initialize context through MCP.

## MCP coexistence

Pi can run dotcontext in two modes at once:

| Mode | Package | Best for |
| --- | --- | --- |
| Hooks extension | `@dotcontext/pi` | Session bootstrap, tracing, workflow reminders (low token cost) |
| MCP tools | `@dotcontext/mcp` + `pi-mcp-adapter` | Full tooling: init, fill, workflow-init, sensors, plan linking |

The MCP installer writes a standard server entry into `.mcp.json`:

```json
{
  "mcpServers": {
    "dotcontext": {
      "command": "npx",
      "args": ["-y", "@dotcontext/mcp@latest"],
      "env": {}
    }
  }
}
```

Global MCP config path: `~/.config/mcp/mcp.json`. Local: `.mcp.json` in the project root.

## Verify

1. **Extension loads** — after `pi install npm:@dotcontext/pi`, start Pi in a project. No load errors should appear.

2. **Bootstrap injection** — in a repo with `.context/` initialized, start a session. You should see dotcontext bootstrap content on `session_start`.

3. **Traces** — edit a file through Pi, then check `.context/runtime/sessions/*/trace.jsonl` for `tool.use` entries.

4. **MCP tools** — with `pi-mcp-adapter` connected, ask Pi to run the context check tool against your repository.

## Initialize context

Hooks and the extension assume you eventually initialize `.context/`. Use MCP for that:

> Initialize dotcontext context for this repository with auto-fill.

That maps to MCP `context` actions (`init`, `fillSingle`, etc.). Once `.context/` exists, the Pi extension keeps subsequent sessions warm automatically.

## Uninstall

Remove the Pi extension:

```bash
pi uninstall @dotcontext/pi
```

Remove MCP entries from `.mcp.json` manually or re-run `npx @dotcontext/mcp install` after editing the file.

## For extension authors

Host hook mappers and adapter factories live in `@dotcontext/integrations`:

```ts
import { createPiDevHookAdapter, mapPiEvent } from '@dotcontext/integrations/pi-dev';
```

Integrations call the harness only — they never import `cli` or `mcp`.

## Next steps

- [Installation](/getting-started/installation/) — all install paths including Pi.
- [Using dotcontext with hooks](/guides/using-with-hooks/) — shell hooks for Claude Code and Codex CLI.
- [Using dotcontext with MCP](/guides/using-with-mcp/) — the full MCP tool surface.
- [Architecture](/about/architecture/) — how integrations fit the product shape.
