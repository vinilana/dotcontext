---
title: Using dotcontext with MCP
description: Install the dotcontext MCP server, connect an AI client, and drive the index-first workflow with the consolidated tools and PREVC workflow tools.
sidebar:
  order: 1
---

The Model Context Protocol (MCP) is the recommended way to use dotcontext. Instead of pasting context into prompts, your AI client talks to the dotcontext MCP server directly — reading shared context, scaffolding `.context/`, running the PREVC workflow, and recording durable execution history.

This guide walks through installing the server, connecting a client, the mandatory index-first workflow, and the tools you'll use most — with example prompts you can adapt.

:::tip[New to dotcontext?]
If you haven't installed anything yet, start with the [Quickstart](/getting-started/quickstart/). This page assumes you want a practical, prompt-driven walkthrough of the MCP surface.
:::

## Why MCP first

The MCP server is where dotcontext does its real work. Context creation, AI-generated fills, plan scaffolding, semantic analysis, and the PREVC workflow are all MCP-first — the standalone CLI focuses on syncing artifacts and low-level admin tasks.

That means once the server is connected, you mostly talk to your agent in natural language. The agent calls the right tools for you.

## 1. Install the MCP server

The fastest path is to let dotcontext write the config for your client:

```bash
npx @dotcontext/mcp@latest install
```

Or drive the installer through the CLI, optionally targeting a specific tool:

```bash
# Interactive — detects installed tools and prompts you
npx -y @dotcontext/cli@latest mcp:install

# Target a specific client
npx -y @dotcontext/cli@latest mcp:install claude

# Preview the config without writing anything
npx -y @dotcontext/cli@latest mcp:install --dry-run
```

The installer supports 17 AI clients, including Claude Code, Claude Desktop, Cursor, Windsurf, Continue.dev, VS Code / GitHub Copilot, Zed, JetBrains IDEs, Codex CLI, Gemini CLI, Amazon Q, Pi, and more. It detects what you already have installed and writes (or updates) the appropriate config file.

MCP is the full dotcontext tool surface. Hooks are the recommended companion for hook-capable hosts because they bootstrap sessions, append edit/bash traces, and surface PREVC workflow reminders in the background. Hooks are optional and non-blocking; MCP install success does not depend on hook install success.

The CLI `mcp:install` flow recommends hooks only for supported lifecycle hosts: Claude Code (`claude` -> `claude-code`), Codex CLI (`codex`), and Pi (`pi`). In an interactive terminal, the prompt appears after MCP config is handled. In non-interactive runs, use `--with-hooks` to write hooks; otherwise the command only prints the recommended next step. Use `--no-hooks` to suppress the recommendation entirely.

```bash
# MCP + recommended hooks
npx -y @dotcontext/cli@latest mcp:install codex --with-hooks

# Choose the Codex hook config format for the combined flow
npx -y @dotcontext/cli@latest mcp:install codex --with-hooks --hook-format toml

# MCP only, without hook prompts or recommendation output
npx -y @dotcontext/cli@latest mcp:install codex --no-hooks
```

For Codex, run `/hooks` inside Codex and trust project hooks after the hook config is written. For Pi, the combined flow lets the MCP installer write the MCP snippet and does not ask the Pi hook step to add a duplicate snippet.

The config it writes is the same for every tool:

```json
{
  "command": "npx",
  "args": ["-y", "@dotcontext/mcp@latest"],
  "env": {}
}
```

:::note[Global vs local]
By default the installer writes to your global (home directory) config. Use `--local` to write a project-level config instead (for example `.mcp.json` or a tool-specific directory). Use `--dry-run` to preview either path before committing.
:::

For the full client list, config locations, and flags, see [Installation](/getting-started/installation/).

## 2. Connect an AI client

After install, restart (or reload) your AI client so it picks up the new server. The dotcontext tools should then appear in the client's tool list.

A quick way to confirm the connection is to ask your agent to check the project:

> Check whether this repository already has a `.context` folder.

Under the hood the agent calls `context` with the `check` action. If it responds with the current bootstrap status, the server is connected and working.

## 3. The mandatory index-first workflow

dotcontext is built around a **shared context index**. Before doing real work, an agent should read the index so it knows what context exists and where to find it — rather than scanning the whole tree and burning tokens.

The recommended startup sequence is:

| Step | Tool call | What it does |
| --- | --- | --- |
| 1 | `context` → `check` | Verify whether `.context/` exists (pass `repoPath` on the first call) |
| 2 | `context` → `init` | Scaffold `.context/` (use `autoFill: true` to seed from the codebase) |
| 3 | `context` → `fillSingle` | Fill each pending file with generated content (run per file) |
| 4 | `context` → `scaffoldPlan` | Create a plan template (optional, for non-trivial work) |
| 5 | `workflow-init` | Start the PREVC workflow once context is in place |

:::caution[Always index before you act]
For a project that already has `.context/`, the index lives at the top of the docs (the first file listed by the context tools). Reading it first lets the agent jump straight to the right file. Skipping the index leads to incomplete or incorrect answers.
:::

A natural-language version of the same flow:

> This repo has no `.context` yet. Initialize it with auto-fill, then fill each pending file, and start a PREVC workflow for "add OAuth login".

The agent translates that into `context` (`init` → `fillSingle` …) followed by `workflow-init`, persisting the canonical workflow state to `.context/runtime/workflows/prevc.json`.

## 4. The consolidated tools at a glance

dotcontext groups its capabilities into a small set of consolidated tools. Each takes an `action` parameter that selects the operation. Below is the high-level map with example prompts; the full action and parameter tables live in the [MCP tools reference](/reference/mcp-tools/).

### explore — read and search code

File and code exploration: `read`, `list`, `analyze`, `search`, `getStructure`.

> Search the codebase for where rate limiting is implemented and show me the directory structure of `src/`.

### context — scaffold and semantic context

Context scaffolding and semantic knowledge: `check`, `init`, `fill`, `fillSingle`, `getMap`, `buildSemantic`, `scaffoldPlan`, `searchQA`, `getFlow`, `detectPatterns`, and more.

> Build a compact semantic context for this codebase, then show me the code flow starting from `src/server.ts`.

:::tip[Pass repoPath once]
On the first `context` call, include `repoPath` pointing at the project root. The server caches it, so later calls don't need to repeat it.
:::

### sync — import and export with AI tools

Synchronize `.context/` with other AI tools: `exportRules`, `exportDocs`, `exportAgents`, `exportSkills`, `reverseSync`, `importDocs`, `importAgents`, `importSkills`.

> Export the agents in `.context/agents` to Claude Code, and reverse-sync any rules I already have in `.cursor`.

### plan — track plans and PREVC phases

Plan management and execution tracking: `link`, `getDetails`, `getForPhase`, `updatePhase`, `recordDecision`, `updateStep`, `getStatus`, `syncMarkdown`, `commitPhase`.

> Mark phase E of the current plan as completed, record the decision to use Postgres, then commit the phase artifacts under `.context/**`.

### agent — orchestrate and discover agents

Agent orchestration and discovery: `discover`, `getInfo`, `orchestrate`, `getSequence`, `getDocs`, `getPhaseDocs`, `listTypes`.

> Which agents should handle the Planning phase for "migrate auth to OAuth"? Give me the recommended handoff sequence.

### skill — on-demand expertise

Skill management: `list`, `getContent`, `getForPhase`, `scaffold`, `export`, `fill`.

> List the skills available for the Verify phase and show me the content of the testing skill.

## 5. The PREVC workflow tools

PREVC (Plan → Review → Execute → Verify → Confirm) is the structured development workflow. Five dedicated tools drive it:

| Tool | Purpose | Notable parameters |
| --- | --- | --- |
| `workflow-init` | Start a workflow for a feature | `name` (required), `description`, `scale` (QUICK/SMALL/MEDIUM/LARGE), `autonomous`, `require_plan`, `require_approval` |
| `workflow-status` | Get the current phase, gates, and activity | none required |
| `workflow-guide` | Get next steps, skills, and gate hints | `intent`, `format` |
| `workflow-advance` | Move to the next phase | `outputs` (artifact paths), `force` (bypass gates) |
| `workflow-manage` | Handoffs, docs, gates, sensors, tasks | `action` (handoff, createDoc, approvePlan, runSensors, defineTask, checkpoint, …) |

The scale you pass to `workflow-init` controls which phases run — from a quick `E → V` for a small fix up to the full `P → R → E → V → C` for complex or compliance-sensitive work. If you describe the task, dotcontext can auto-detect a sensible scale.

A typical workflow loop in natural language:

> Start a MEDIUM workflow for "add CSV export" that requires a plan before review. Then show me the status, run the sensors, and advance to the next phase once they pass.

That maps to `workflow-init` (with `scale: "MEDIUM"`, `require_plan: true`), `workflow-guide`, `workflow-manage` (`action: "runSensors"`), and `workflow-advance`.

:::note[Gates protect transitions]
If you set `require_plan` or `require_approval`, the corresponding transition is gated until the plan or approval exists. `workflow-advance` reports the gate result; pass `force: true` only when you intentionally want to bypass it.
:::

To learn how phases, scale, and roles fit together, read [The PREVC workflow](/concepts/prevc-workflow/).

## 6. MCP resources

Beyond tools, the server exposes a few read-only resources your client can pull directly:

| Resource URI | Content | MIME type |
| --- | --- | --- |
| `context://codebase/{contextType}` | Semantic context (`documentation`, `playbook`, `plan`, `compact`) | `text/markdown` |
| `file://{path}` | File contents, validated against the workspace boundary | `text/plain` |
| `workflow://status` | Current PREVC workflow status snapshot | `application/json` |

These are handy when your client supports attaching MCP resources to a conversation — for example pulling `context://codebase/compact` for a lightweight project briefing.

## A complete example session

Putting it together, here's how a fresh project goes from zero to a running workflow, expressed as prompts to your agent:

> 1. Check whether this repo has a `.context` folder.
> 2. Initialize it with auto-fill, then fill every pending file.
> 3. Build a compact semantic context so you understand the codebase.
> 4. Scaffold a plan for "add audit logging".
> 5. Start a MEDIUM PREVC workflow for it that requires approval before execution.
> 6. Show me the workflow status, then walk the phases — running sensors and recording artifacts as you go.

Each step maps to one or more of the tools above, and every action is recorded as durable runtime state under `.context/runtime/` — so you can later inspect, replay, or build failure datasets from the session.

## Next steps

- [MCP tools reference](/reference/mcp-tools/) — full action and parameter tables for every tool.
- [Quickstart](/getting-started/quickstart/) — the shortest path from install to your first workflow.
- [The PREVC workflow](/concepts/prevc-workflow/) — phases, scale, roles, and gates explained.
- [Installation](/getting-started/installation/) — every supported client and config location.
