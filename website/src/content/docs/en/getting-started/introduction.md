---
title: Introduction
description: What dotcontext is, the problem it solves, and how its cli, harness, and mcp surfaces fit together.
sidebar:
  order: 1
---

AI coding tools are powerful, but they are forgetful. Every new chat starts from zero. The rules your team agreed on live in someone's prompt, the architecture decisions live in a Slack thread, and the "how we ship things here" knowledge lives in people's heads. When you switch from one AI tool to another, none of it comes along.

**dotcontext** fixes that. It gives your repository a durable, version-controlled brain — your docs, agent playbooks, skills, quality checks, and execution workflow — that any AI tool can read through a single Model Context Protocol (MCP) server.

## The problem

If you have used AI assistants on a real codebase, you have probably hit some of these:

- **Project knowledge is scattered.** Architecture notes, conventions, and tribal knowledge are spread across READMEs, wikis, chat history, and nobody's laptop.
- **Execution rules live in prompts.** "Always run the tests", "don't touch the config", "get a review before merging" — these get retyped into every conversation and forgotten just as often.
- **There is no audit trail.** When an AI agent makes a change, you rarely have a record of what it ran, what it produced, or why it decided something.
- **Nothing is reusable across AI tools.** Set up Claude Code today, switch to Cursor tomorrow, and you start over. Each tool wants its own config in its own format.

dotcontext turns that scattered, throwaway context into a single source of truth that lives in your repo, under `.context/`, and travels with the project.

## What dotcontext gives you

- **A versioned knowledge base.** Project docs, agent playbooks, and reusable skills live in `.context/` and are committed to git like any other source.
- **A structured execution workflow.** The PREVC workflow (Plan, Review, Execute, Validate, Confirm) gives AI agents a phased path through real work, with gates and handoffs between roles.
- **Quality checks that actually run.** Sensors are executable checks — build, tests, typecheck, lint — that emit pass/fail results during execution, recorded as part of the run.
- **Enforcement and audit.** Policies declare allow/deny/approve rules, while sessions, traces, artifacts, and checkpoints give you a durable record of what happened. Replay and failure datasets let you reconstruct and learn from past runs.
- **One config, every tool.** Author context once and export it to whichever AI tools your team uses, or run the MCP server so they all read the same brain live.

## The shape: cli -> harness <- mcp

dotcontext is built around one core runtime — the **harness** — with two surfaces wrapped around it:

```text
cli -> harness <- mcp
```

The harness holds all the real behavior. The CLI and MCP are thin boundaries that operators and AI tools use to reach it.

| Surface | Package | Who uses it | What it does |
| --- | --- | --- | --- |
| **harness** | `@dotcontext/harness` | imported by the other two | The reusable runtime: PREVC workflow state, sessions, sensors, policies, task contracts, replay, and datasets. |
| **cli** | `@dotcontext/cli` | operators (you, in a terminal) | Sync and admin: export/import rules, agents, and skills between `.context/` and AI tool directories, install the MCP server, run reports, and manage workflow state. |
| **mcp** | `@dotcontext/mcp` | AI tools (Claude Code, Cursor, etc.) | The Model Context Protocol transport: exposes harness behavior as MCP tools and resources, plus an installer for supported clients. |

### The three package surfaces

dotcontext ships as three independently publishable npm packages that share one version:

- **`@dotcontext/harness`** — the reusable runtime. Domain rules, workflow routing, session and runtime state, sensors, policies, and contracts. Import it if you are building on top of dotcontext.
- **`@dotcontext/cli`** — the operator-facing command line. This is the `dotcontext` binary you run to sync artifacts and configure tools.
- **`@dotcontext/mcp`** — the MCP transport adapter and installer. This is what your AI tools connect to.

:::note
The standalone CLI is **sync and admin focused**. Context creation, AI-generated fills, and plan scaffolding are **MCP-first** — they run through the MCP server and Claude-powered tools, not as direct CLI commands.
:::

## Who it is for

dotcontext is for developers and teams who use AI coding tools on real, long-lived codebases and want that work to be consistent, reviewable, and portable. It fits especially well if you:

- use more than one AI tool, or expect to switch between them
- want shared, enforceable conventions instead of per-person prompts
- care about an audit trail for what AI agents do in your repo
- run structured work (features, refactors, compliance-sensitive changes) and want phased execution with gates

If you just want a one-off answer in a single chat, you do not need dotcontext. The moment you want that context to persist, be shared, and be enforced — that is where it earns its place.

## Where to go next

- **[Installation](/getting-started/installation/)** — install the MCP server (recommended) or the standalone CLI.
- **[Quickstart](/getting-started/quickstart/)** — go from an empty repo to a running PREVC workflow in a few steps.
- **[Concepts overview](/concepts/prevc-workflow/)** — understand the PREVC workflow, sensors, policies, task contracts, and runtime state in depth.
- **[MCP tools reference](/reference/mcp-tools/)** — the full list of tools your AI client can call.

For source and issues, see the project on [GitHub](https://github.com/vinilana/dotcontext).
