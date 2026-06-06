---
title: Quickstart
description: Run dotcontext end to end from your AI tool — bootstrap context, scaffold a plan, start the PREVC workflow, and advance through the phases.
sidebar:
  order: 3
---

This guide takes you from an empty repository to a running PREVC workflow in about five steps — all driven by natural language from inside an AI tool that speaks MCP (Claude Code, Cursor, Windsurf, and friends).

dotcontext is a harness for your harness: it gives your agent a durable contextual layer it can pick up later — shared context, a workflow with phases, and runtime state — no matter which AI tool you use. You'll mostly talk to the agent in plain English; under the hood it calls dotcontext's MCP tools. Each step below shows both the prompt you type and the tool the agent runs.

:::note[Before you start]
You need the dotcontext MCP server installed in your AI tool. If you haven't done that yet, run `npx @dotcontext/mcp install` (or follow the [Installation](/getting-started/installation/) page) and restart your tool so it picks up the server.
:::

## Step 1 — Bootstrap the context

First, give the project a `.context/` directory. This is where durable knowledge (docs, agents, skills) and generated runtime state live.

Prompt your agent:

```text
Initialize the dotcontext context for this project and auto-fill it from the codebase.
```

Behind the scenes, the agent checks whether `.context/` exists, then scaffolds it:

```jsonc
// context: verify the project state
{ "action": "check", "repoPath": "/path/to/your/project" }

// context: scaffold .context/ and seed content from the codebase
{ "action": "init", "autoFill": true }
```

The first call to `context` should include `repoPath`; subsequent calls reuse the cached value. The `init` action creates the `.context/` layout — including `config/` for authored configuration and `runtime/` for generated state. See the [.context convention](/concepts/context-convention/) for the full layout.

## Step 2 — Fill the pending files

`init` lays down the scaffold, but some files start empty and need real content. Ask the agent to fill them in.

Prompt:

```text
List anything still pending in .context and fill each file from the codebase.
```

The agent finds pending files and fills them one at a time:

```jsonc
// context: see what still needs content
{ "action": "listToFill" }

// context: fill a single file (repeat for each pending file)
{ "action": "fillSingle", "filePath": ".context/docs/overview.md" }
```

:::tip[Fill incrementally]
`fillSingle` runs once per file so you can review and correct generated content as you go. This keeps your `.context/docs` accurate instead of dumping everything at once.
:::

## Step 3 — Scaffold a plan

For non-trivial work, create a plan template. It gives the workflow a place to record decisions, phase progress, and outputs.

Prompt:

```text
Scaffold a plan called "dark-mode" for adding a dark theme toggle.
```

The agent scaffolds the plan:

```jsonc
// context: create a plan template
{
  "action": "scaffoldPlan",
  "planName": "dark-mode",
  "title": "Dark mode toggle",
  "summary": "Add a user-facing dark theme with persistence"
}
```

:::note
Skip this step for quick, single-file changes — a plan is overhead you don't need for a typo fix. Start the workflow directly (next step) and dotcontext will route you through a shorter phase set.
:::

## Step 4 — Start the PREVC workflow

Now turn the scaffolded context into a running workflow. PREVC stands for **Plan → Review → Execute → Verify → Confirm**, and dotcontext routes only the phases your task actually needs based on its scale.

Prompt:

```text
Start a PREVC workflow named "dark-mode" for adding a dark theme toggle.
```

The agent initializes the workflow:

```jsonc
// workflow-init
{
  "name": "dark-mode",
  "description": "Add a user-facing dark theme with persistence"
}
```

dotcontext auto-detects a scale from your description (or you can pass `scale` explicitly as `QUICK`, `SMALL`, `MEDIUM`, or `LARGE`) and selects the phases to run:

| Scale | Phases | Typical use |
| --- | --- | --- |
| `QUICK` | E → V | Bug fixes, tiny tweaks |
| `SMALL` | P → E → V | Simple features |
| `MEDIUM` | P → R → E → V | Regular features with design |
| `LARGE` | P → R → E → V → C | Complex systems, compliance, docs |

The canonical workflow state lands in `.context/runtime/workflows/prevc.json`. That file is the single source of truth for the current phase, gate settings, and progress — and because it's persisted, the workflow survives across sessions and tools.

:::tip[Gates are optional but useful]
You can require a plan before leaving Plan (`require_plan`) or an approval before leaving Review (`require_approval`). Pass these to `workflow-init` to make the runtime enforce them. See [PREVC workflow](/concepts/prevc-workflow/) for the full gate model.
:::

## Step 5 — Work the phases and advance

With the workflow running, ask for status, do the work for the current phase, then advance.

Prompt:

```text
What's the current workflow phase, and what should I do next?
```

The agent reads status:

```jsonc
// workflow-status
{}
```

Do the work the phase calls for — for example, in Execute you implement the feature and write tests. When the phase is done, tell the agent to move on and hand it the artifacts you produced.

Prompt:

```text
The implementation is done. Advance the workflow and record the files I changed.
```

The agent advances, passing along the outputs:

```jsonc
// workflow-advance
{ "outputs": ["src/theme/darkMode.ts", "src/theme/__tests__/darkMode.test.ts"] }
```

Repeat status → work → advance for each remaining phase. Each transition updates `.context/runtime/workflows/prevc.json`, so you always have an accurate, replayable record of where the work stands.

:::caution[Gated transitions]
If a gate is configured, `workflow-advance` will block until it's satisfied — for example, P → R needs a plan when `require_plan` is set, and R → E needs an approval when `require_approval` is set. You can pass `force: true` to bypass a gate when you know it's safe, but prefer satisfying the gate.
:::

## What you've built

After these five steps you have:

- A populated `.context/` directory with docs, agents, and skills
- An optional plan scaffold tracking decisions and progress
- A live PREVC workflow whose canonical state is `.context/runtime/workflows/prevc.json`
- A phase-by-phase trail of outputs the agent can pick back up later

## Where to go next

- [PREVC workflow](/concepts/prevc-workflow/) — the full phase model, scales, roles, and gates
- [Using dotcontext with MCP](/guides/using-with-mcp/) — prompts, tools, and agent flows in depth
- [The .context convention](/concepts/context-convention/) — what lives where on disk
- [MCP tools reference](/reference/mcp-tools/) — every tool, action, and parameter
