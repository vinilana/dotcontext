---
title: Architecture
description: How dotcontext is structured around the "cli -> harness <- mcp" shape — a transport-agnostic harness runtime, clear boundaries, and five publishable packages.
sidebar:
  order: 1
---

dotcontext is built around one idea: the work an agent does should live in a **reusable runtime**, not inside whatever transport happens to invoke it. That runtime is the **harness**, and both the CLI and the MCP server are thin shells around it.

The whole product fits in one line:

```text
cli -> harness <- mcp
              <- integrations (host hooks / extensions)
```

This page explains what each piece is responsible for, why the harness sits in the middle, and how the codebase splits into five independent packages you can install separately.

::: tip[The one rule]
Domain behavior belongs in the **harness**. The CLI and MCP layers should stay thin — they translate a request into a harness call and format the result. If you find logic creeping into `cli` or `mcp` that other transports would also need, it belongs in the harness instead.
:::

## The product shape

Read the arrows as "drives": the **CLI drives the harness**, the **MCP server drives the harness**, and **host integrations** (Claude Code hooks, Codex CLI hooks, Pi extension) drive the harness too. Neither transport owns the logic — they all call into the same runtime.

```text
   operator                         AI client / agent              hook host
      │                                    │                          │
      ▼                                    ▼                          ▼
 ┌─────────┐                          ┌─────────┐              ┌──────────────┐
 │   cli   │                          │   mcp   │              │ integrations │
 └────┬────┘                          └────┬────┘              └──────┬───────┘
      │                                    │                          │
      └──────────────┐      ┌──────────────┴──────────────┐           │
                     ▼      ▼                               ▼           ▼
                  ┌────────────┐
                  │  harness   │   transport-agnostic runtime
                  └─────┬──────┘
                        ▼
                   .context/        durable, on-disk state
```

Because the harness is shared, an execution started over MCP, driven from the CLI, or triggered by a host hook writes to the **same on-disk state, in the same format**. There is no "CLI database" and "MCP database" — there is one `.context/` directory, and every surface speaks to it through the harness.

## The harness: a transport-agnostic runtime

The **harness** is the execution layer at the center of dotcontext. It is *transport-agnostic*: it has no idea whether a request arrived as a CLI subcommand or an MCP tool call. It just runs the work and persists durable state.

The harness owns:

- **Durable sessions** — execution contexts that survive across calls and processes, with traces, artifacts, and checkpoints recorded against them.
- **Sensors and backpressure** — executable quality checks (build, test, typecheck, and more) whose results are recorded into sessions.
- **Task contracts and handoffs** — structured agreements about what a task needs and what gates block its completion, plus formal role transitions.
- **Policies and policy evaluation** — declarative allow / deny / require-approval rules applied to workflow actions.
- **Replay and failure datasets** — reconstruction of a session's full timeline, and a failure corpus mined from those replays.
- **PREVC workflow state** — phase routing (Plan, Review, Execution, Validation, Confirmation) and scale-adaptive gates.

All of this is persisted under `.context/`, the single on-disk home for both authored configuration and generated runtime state.

For a deep dive into sessions, traces, artifacts, and checkpoints, see the [harness runtime concept](/concepts/harness-runtime/).

## The boundaries

The repository keeps strict boundaries so the harness stays reusable and the transports stay thin.

| Boundary | Responsibility |
| --- | --- |
| `src/cli` | Operator-facing surface — sync, import/export, MCP install, hook install, reports, and admin workflow commands |
| `src/mcp` | The MCP transport boundary — exposes harness behavior as Model Context Protocol tools and resources |
| `src/harness` | The domain runtime — domain rules, application services, and adapters (the reusable core) |
| `src/integrations` | Host hook adapters — Claude Code, Codex CLI, and Pi event mappers, templates, and install helpers |

### The CLI operator surface

The CLI is the **operator-facing** transport. It is sync and admin focused: distributing artifacts between `.context/` and AI tool directories, installing the MCP server and lifecycle hooks into client configs, generating reports, and managing low-level workflow state.

Notably, the CLI does **not** create context, generate AI fills, or scaffold plans on its own — those flows are MCP-first. See [using the CLI](/guides/using-the-cli/) for the full command surface.

### The MCP transport boundary

The MCP server is the **agent-facing** transport. It exposes the harness as a set of Model Context Protocol tools (`explore`, `context`, `sync`, `plan`, `agent`, `skill`, `harness`, and the dedicated `workflow-*` tools) plus resources like `context://codebase/{contextType}` and `workflow://status`.

This is the surface an AI client (Claude Code, Cursor, Windsurf, and others) talks to. See [using dotcontext with MCP](/guides/using-with-mcp/) to get it installed.

### The integrations boundary

**Integrations** connect host lifecycle events to the harness without going through MCP. Claude Code and Codex CLI use shell dispatch (`npx -y @dotcontext/cli@latest hook dispatch`); Pi loads the `@dotcontext/pi` npm extension in-process.

Integrations call the harness only — they never import `cli` or `mcp`. See [using dotcontext with hooks](/guides/using-with-hooks/) and [using dotcontext with Pi](/guides/using-with-pi/).

### The harness internals: domain, application, adapters

Inside `src/harness`, the code follows a hexagonal layout so the domain rules never depend on a transport or a filesystem detail:

| Layer | What lives here |
| --- | --- |
| **domain** | Pure rules — PREVC phases and scaling, policy evaluation logic, contract semantics |
| **application** | Services that orchestrate the domain — sessions, sensors, contracts, policies, replay, datasets, workflow |
| **adapters** | The edges — persisting runtime state to `.context/`, reading the repo, talking to model providers |

This is why the same `WorkflowService` or `HarnessSensorsService` behaves identically whether it was reached over MCP, the CLI, or a host hook: the transports plug into the application layer, and the application layer talks to the domain.

## Five packages, one runtime

The monorepo builds into **five independent, publishable packages**. They share one root version and are released together so they always stay compatible.

| Package | Role | Bin |
| --- | --- | --- |
| `@dotcontext/cli` | Operator-facing sync, import/export, MCP setup, hook install, reports, admin workflows | `dotcontext` |
| `@dotcontext/harness` | The reusable runtime — domain rules, sessions, policies, sensors, contracts, replay, workflow state | — |
| `@dotcontext/mcp` | The MCP transport adapter and installer for AI tools | `dotcontext-mcp` |
| `@dotcontext/integrations` | Host hook adapters and event mappers for extension authors | — |
| `@dotcontext/pi` | Pi npm extension for in-process lifecycle hooks | — |

### `@dotcontext/cli`

The operator's package. It ships the full CLI stack and exports a handful of services for programmatic use:

- `MCPInstallService` — configure MCP for supported AI tools
- `HookInstallService` — configure lifecycle hooks for Claude Code, Codex CLI, and Pi
- `StateDetector` — detect harness runtime state
- `SyncService` — export/import rules, agents, and skills
- `ReportService` — generate workflow progress reports

It includes the `prompts/` directory used by the interactive CLI, and its bin is `dotcontext`.

### `@dotcontext/harness`

The reusable runtime, with a minimal dependency set so it can be embedded elsewhere. It exports the core services:

- `HarnessExecutionService` — the core execution runtime
- `HarnessRuntimeStateService` — persist and load runtime state
- `HarnessSensorsService` — sensor registration and execution
- `HarnessTaskContractsService` — task and handoff contracts
- `WorkflowService` — PREVC workflow state and routing

This is the package you depend on if you want dotcontext's durable sessions, sensors, contracts, and PREVC logic without any transport.

### `@dotcontext/mcp`

The MCP transport adapter and installer. It exports:

- `AIContextMCPServer` — the MCP server instance
- `startMCPServer()` — start the server
- `handleHarness()` — the MCP `harness` tool handler
- `handleWorkflowManage()` — the MCP `workflow-manage` tool handler

Its bin is `dotcontext-mcp`. For most users, installation goes through `npx @dotcontext/mcp install`, which writes the server config into your AI client.

### `@dotcontext/integrations`

Host hook adapters for extension authors. Exports typed event mappers and hook adapter factories for Claude Code, Codex CLI, and Pi (`pi-dev`). Integrations depend on `@dotcontext/harness` only.

### `@dotcontext/pi`

The Pi npm extension package. Installed with `pi install npm:@dotcontext/pi`, it registers in-process handlers for `session_start`, `tool_execution_end`, and `agent_end`. Complements MCP via `pi-mcp-adapter` for the full tool surface.

::: note
The split packages are produced by `npm run build:packages`, which copies the compiled `dist/` into each package root and writes a filtered `package.json` manifest. `npm run smoke:packages` then validates names, versions, entry points, exports, and bin shims — and asserts no legacy `dist/services/` folder leaks into a bundle, which keeps the boundaries honest.
:::

## Importing the packages

You can import from the published packages directly, choosing the surface you need:

```ts
import { MCPInstallService } from '@dotcontext/cli';
import { HarnessExecutionService } from '@dotcontext/harness';
import { AIContextMCPServer } from '@dotcontext/mcp';
import { createCodexHookAdapter } from '@dotcontext/integrations/codex';
```

Because all packages share the same root version, pinning one and matching the others keeps the surfaces compatible.

## How it all fits together

1. An **operator** runs the CLI, an **AI client** calls an MCP tool, or a **host hook** fires on session lifecycle.
2. The transport (`cli`, `mcp`, or `integrations`) translates the request into a **harness** call.
3. The harness runs the work through its **application services** and **domain rules**.
4. State is persisted by the **adapters** into `.context/`.
5. Any other transport reading that state — now or later — sees the same durable record.

That single shared runtime is what makes a dotcontext session **legible, resumable, and auditable** no matter how it was started.

## Next steps

- [The harness runtime](/concepts/harness-runtime/) — sessions, traces, artifacts, and checkpoints in depth.
- [The PREVC workflow](/concepts/prevc-workflow/) — the five phases and scale-adaptive routing the harness drives.
- [Using dotcontext with MCP](/guides/using-with-mcp/) — install the MCP server into your AI client.
- [Using dotcontext with hooks](/guides/using-with-hooks/) — Claude Code and Codex CLI lifecycle hooks.
- [Using dotcontext with Pi](/guides/using-with-pi/) — Pi extension and MCP coexistence.
- [Using the CLI](/guides/using-the-cli/) — the operator-facing command surface.
- [dotcontext on GitHub](https://github.com/vinilana/dotcontext) — the source.
