---
title: The .context convention
description: How dotcontext organizes the .context directory — authored config versus generated runtime state, what is version-controlled, and the legacy migration.
sidebar:
  order: 1
---

Everything dotcontext knows about your project lives in a single directory at the repo root: `.context/`. It is the convention that ties the whole system together — the CLI, the harness, and the MCP server all read from and write to it.

The key idea is a clean split between two kinds of state:

- **Authored** — files you and your team write and commit, like docs, agent playbooks, skills, and configuration.
- **Generated** — runtime state the harness produces as it runs, like sessions, traces, contracts, and replays.

Authored state is your source of truth and belongs in git. Generated state is reproducible and is ignored by git. Keeping the two apart means your repository history stays clean, and runtime artifacts never create noisy diffs.

:::tip
You rarely create `.context/` by hand. Run `context({ action: "init", autoFill: true })` through the MCP server to scaffold it — see [Quickstart](/getting-started/quickstart/).
:::

## The two halves: config and runtime

The convention draws a line down the middle of `.context/`:

| Half | Path | Written by | Committed? |
| --- | --- | --- | --- |
| Authored config | `.context/config/` | You / your team | Yes |
| Generated runtime | `.context/runtime/` | The harness | No |

`config/` holds the files that govern how the harness behaves — your policy rules and your sensor catalog. They are reviewed, edited, and versioned like any other project configuration.

`runtime/` holds everything the harness emits while working — session timelines, event traces, task contracts, replays, and failure datasets. It is disposable: delete it and the harness regenerates what it needs on the next run.

## Durable project knowledge

Alongside `config/` and `runtime/`, the convention reserves four folders for the human-readable knowledge your agents draw on:

| Folder | What it holds |
| --- | --- |
| `.context/docs/` | Durable project documentation and the generated semantic knowledge base |
| `.context/agents/` | Agent playbooks and role definitions, maintained as project assets |
| `.context/skills/` | Reusable skills — on-demand operating guides for specific tasks |
| `.context/plans/` | Implementation plans kept as local working artifacts |

`docs/`, `agents/`, and `skills/` are committed so the whole team (and every agent) shares the same knowledge. `plans/` is treated as local working state by default and is gitignored, unless your team chooses to version it.

## The directory tree

Here is the full layout. Authored files at the top are version-controlled; everything under `runtime/` (and `cache/`, `plans/`) is generated and gitignored.

```text
.context/
├── config.json                       # versioned — context generation config
├── docs/                             # versioned — documentation & semantic KB
├── agents/                           # versioned — agent playbooks
├── skills/                           # versioned — reusable skills
├── plans/                            # local    — implementation plans (gitignored)
├── config/                           # versioned — authored configuration
│   ├── policy.json                   #   declarative policy rules
│   └── sensors.json                  #   sensor catalog + detected stack
├── cache/                            # generated — gitignored
│   └── semantic/                     #   persisted semantic snapshot cache
└── runtime/                          # generated — gitignored
    ├── sessions/
    │   └── <sessionId>/
    │       ├── session.json          #   session record
    │       ├── trace.jsonl           #   append-only event log
    │       └── artifacts/<id>.json
    ├── workflows/
    │   ├── prevc.json                #   current PREVC phase state
    │   ├── collaboration-sessions.json
    │   ├── plan-tracking/
    │   └── archive/
    ├── contracts/
    │   ├── tasks/<taskId>.json
    │   └── handoffs/<handoffId>.json
    └── evaluations/
        ├── replays/<replayId>.json
        └── datasets/<datasetId>.json
```

## What is version-controlled

Commit the authored half. These are your project's shared, durable assets:

- `.context/config.json` — context generation configuration, so scaffolding is repeatable across checkouts
- `.context/config/policy.json` — harness policy rules and approval constraints
- `.context/config/sensors.json` — the sensor catalog (generated at bootstrap, then customized by the team)
- `.context/docs/**` — all documentation and the semantic knowledge base
- `.context/agents/**` — all agent playbooks
- `.context/skills/**` — all skills

## What is gitignored

The generated half is reproducible, so it stays out of git. A typical `.gitignore` blocks:

```text
.context/cache/
.context/plans/
.context/runtime/
.context/harness/      # legacy
.context/workflow/     # legacy
.context/**/archive/
```

:::note
`plans/` is gitignored by default because plans are usually local working artifacts. If your team wants to share plans, you can remove that line and commit them like any other authored file.
:::

## Legacy layout and automatic migration

Earlier versions of dotcontext mixed configuration and runtime state under `.context/harness/` and `.context/workflow/`. The current convention replaces those with the `config/` + `runtime/` split.

You do not need to migrate by hand. On first access, the harness migrates the durable parts of the old layout in place. The migration is idempotent and memoized per `.context` path, so it costs nothing on subsequent runs.

| Legacy path | New path |
| --- | --- |
| `.context/harness/policy.json` | `.context/config/policy.json` |
| `.context/harness/sensors.json` | `.context/config/sensors.json` |
| `.context/harness/workflows/prevc.json` | `.context/runtime/workflows/prevc.json` |
| `.context/harness/workflows/archive` | `.context/runtime/workflows/archive` |
| `.context/harness/contracts` | `.context/runtime/contracts` |
| `.context/workflow/collaboration-sessions.json` | `.context/runtime/workflows/collaboration-sessions.json` |
| `.context/workflow/plans.json` | `.context/runtime/workflows/plans.json` |
| `.context/workflow/plan-tracking` | `.context/runtime/workflows/plan-tracking` |

A few details worth knowing:

- **Only durable artifacts migrate.** Config, workflow state, and contracts move over. Ephemeral state — sessions, traces, artifacts, replays, datasets — is intentionally left behind, because the harness regenerates it on demand.
- **The new layout wins.** If both the legacy and new locations hold data, the new copy is kept and the legacy copy is left untouched. Nothing is overwritten or merged.
- **The legacy folders stay ignored.** The `.gitignore` keeps `.context/harness/` and `.context/workflow/` excluded so an un-migrated checkout never leaks runtime state into git.

## Where to go next

- [Reference: the .context layout](/reference/context-layout/) — the full path-by-path breakdown with classifications
- [Sensors](/concepts/sensors/) — what lives in `.context/config/sensors.json`
- [Policies](/concepts/policies/) — what lives in `.context/config/policy.json`
- [The harness runtime](/concepts/harness-runtime/) — what fills `.context/runtime/`
