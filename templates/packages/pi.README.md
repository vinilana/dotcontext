# @dotcontext/pi

Pi extension for dotcontext harness integrations.

This package wires Pi lifecycle events to the dotcontext harness:

- `session_start` — context bootstrap check and optional navigation excerpt
- `tool_execution_end` — durable traces for write/edit/bash tools under `.context/runtime/`
- `agent_end` — workflow status reminders when a PREVC workflow is active

It complements (does not replace) the full MCP tool surface via `pi-mcp-adapter`.

## Install

```bash
pi install npm:@dotcontext/pi
```

Project-local install:

```bash
pi install -l npm:@dotcontext/pi
```

## Recommended setup

1. Install this extension for low-token session bootstrap and tracing.
2. Add dotcontext MCP for full tooling (`context init`, `workflow-init`, sensors, etc.):

```bash
npx @dotcontext/mcp install pi --local
pi install npm:pi-mcp-adapter
```

## Verify

In a repository with `.context/` initialized, start a Pi session and confirm a dotcontext bootstrap message is injected on `session_start`. After a file edit tool run, check `.context/runtime/sessions/*/traces.jsonl`.
