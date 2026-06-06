---
title: .context layout reference
description: A complete map of the .context/ directory — every file and folder, its classification, and whether it is tracked by git.
sidebar:
  order: 3
---

Everything dotcontext knows about your project lives in a single directory at the repo root: `.context/`. This page is the exhaustive reference for what lives where — every directory and file, its classification, and whether git tracks it.

If you want the *why* behind this layout (the split between authored config and generated runtime state), read [The .context convention](/concepts/context-convention/) first. This page is the *what*.

## Classification at a glance

Every path in `.context/` falls into one of three buckets:

| Classification | Meaning | Git-tracked |
| --- | --- | --- |
| **versioned** | Authored by you and your team; the source of truth. | Yes |
| **local** | Working artifacts kept on your machine unless your team chooses to share them. | No (by default) |
| **runtime** | Generated harness state; fully reproducible and disposable. | No |

The rule of thumb: if a human wrote it, it is probably versioned and committed. If the harness generated it, it is runtime and ignored.

## Top-level layout

```text
.context/
├── config.json                  # versioned — generation config
├── config/
│   ├── policy.json              # versioned — policy rules
│   └── sensors.json             # versioned — sensor catalog
├── docs/                        # versioned — documentation + semantic KB
├── agents/                      # versioned — agent playbooks
├── skills/                      # versioned — on-demand expertise
├── plans/                       # local    — implementation plans
├── cache/                       # runtime  — semantic snapshot cache
└── runtime/                     # runtime  — all generated harness state
    ├── sessions/<id>/...
    ├── workflows/...
    ├── contracts/...
    └── evaluations/...
```

## Authored configuration

These files govern how the harness behaves. You write them, you review them, and they belong in git.

| Path | Classification | Git-tracked | Purpose |
| --- | --- | --- | --- |
| `.context/config.json` | versioned | Yes | Context-generation configuration persisted so scaffolding is repeatable across checkouts. |
| `.context/config/` | versioned | Yes | The authored config directory. |
| `.context/config/policy.json` | versioned | Yes | Harness [policy](/concepts/policies/) rules and approval constraints. |
| `.context/config/sensors.json` | versioned | Yes | Project [sensor](/concepts/sensors/) catalog plus detected stack info. Generated at bootstrap, then customized by the team. |

## Durable project knowledge

The human-readable knowledge your agents draw on. Three of these folders are versioned; `plans/` is local by default.

| Path | Classification | Git-tracked | Purpose |
| --- | --- | --- | --- |
| `.context/docs/**` | versioned | Yes | Durable project documentation and the generated semantic knowledge base. |
| `.context/agents/**` | versioned | Yes | Agent playbooks and role definitions maintained as project assets. |
| `.context/skills/**` | versioned | Yes | Reusable skills and on-demand operating guides. |
| `.context/plans/**` | local | No | Implementation plans kept as local working artifacts (unless your team chooses to version them). |

## Generated runtime state

Everything under `.context/runtime/` and `.context/cache/` is produced by the harness while it works. It is disposable — delete it and the harness regenerates what it needs on the next run. None of it is tracked by git.

### Cache

| Path | Classification | Git-tracked | Purpose |
| --- | --- | --- | --- |
| `.context/cache/semantic/**` | runtime | No | Persisted semantic snapshot cache and versioned summary sections from codebase analysis. |

### Sessions

One folder per [harness session](/concepts/harness-runtime/), holding its record, event log, and artifacts.

| Path | Classification | Git-tracked | Purpose |
| --- | --- | --- | --- |
| `.context/runtime/sessions/` | runtime | No | Root for all session state. |
| `.context/runtime/sessions/<id>/session.json` | runtime | No | The session record (status, counters, checkpoints). |
| `.context/runtime/sessions/<id>/trace.jsonl` | runtime | No | Append-only event log, one JSON object per line. |
| `.context/runtime/sessions/<id>/artifacts/<artifactId>.json` | runtime | No | Individual artifact records produced during the session. |

### Workflows

PREVC workflow state and supporting records. See the [PREVC workflow](/concepts/prevc-workflow/) concept.

| Path | Classification | Git-tracked | Purpose |
| --- | --- | --- | --- |
| `.context/runtime/workflows/` | runtime | No | Root for workflow state. |
| `.context/runtime/workflows/prevc.json` | runtime | No | The canonical current PREVC phase state and gate configuration. |
| `.context/runtime/workflows/plans.json` | runtime | No | Plan bindings and metadata. |
| `.context/runtime/workflows/plan-tracking/` | runtime | No | Phase-step tracking and acceptance-predicate execution results. |
| `.context/runtime/workflows/collaboration-sessions.json` | runtime | No | Handoff and collaboration records. |
| `.context/runtime/workflows/archive/` | runtime | No | Archived workflows and historical execution artifacts. |

### Contracts

[Task contracts and handoffs](/concepts/task-contracts/) that gate completion and formalize role transitions.

| Path | Classification | Git-tracked | Purpose |
| --- | --- | --- | --- |
| `.context/runtime/contracts/` | runtime | No | Root for contract definitions. |
| `.context/runtime/contracts/tasks/<taskId>.json` | runtime | No | Task contracts with required sensors and artifacts. |
| `.context/runtime/contracts/handoffs/<handoffId>.json` | runtime | No | Handoff contracts between agents and phases. |

### Evaluations

[Replay and failure-dataset](/concepts/replay-and-datasets/) artifacts.

| Path | Classification | Git-tracked | Purpose |
| --- | --- | --- | --- |
| `.context/runtime/evaluations/` | runtime | No | Root for replay and failure-analysis artifacts. |
| `.context/runtime/evaluations/replays/<replayId>.json` | runtime | No | Replayable session execution history (time-ordered events). |
| `.context/runtime/evaluations/datasets/<datasetId>.json` | runtime | No | Clustered failure datasets for analysis and learning. |

## What git ignores

dotcontext's `.gitignore` blocks all generated and local state:

```text
.context/cache/
.context/plans/
.context/runtime/
.context/harness/      # legacy
.context/workflow/     # legacy
.context/**/archive/
```

Everything else under `.context/` is committed: your docs, agents, skills, and the three authored config files (`config.json`, `config/policy.json`, `config/sensors.json`).

:::tip
Commit `config/policy.json` and `config/sensors.json` so your whole team shares the same gates. Leave `runtime/` ignored — committing it creates noisy diffs and never helps, because the harness regenerates it.
:::

## Legacy layout and migration

Earlier versions of dotcontext mixed config and runtime state under `.context/harness/` and `.context/workflow/`. The current layout separates authored `config/` from generated `runtime/`. Old checkouts are migrated automatically.

Migration runs **in place on first access**, is idempotent, and is memoized per `.context` path:

- **Durable artifacts** (config, workflow state, contracts) are migrated to the new layout.
- **Ephemeral state** (sessions, traces, artifacts, datasets, replays) is intentionally *not* migrated — it regenerates as needed.
- **Divergence handling** — if both legacy and new locations hold data, the new layout wins; the legacy copy is left untouched (no overwrite, no merge).

The files that move:

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

The legacy `.context/harness/` and `.context/workflow/` paths stay in `.gitignore` so un-migrated checkouts never accidentally commit runtime state.

:::note
You do not run migration manually. It happens the first time the CLI, harness, or MCP server touches a legacy `.context/` directory.
:::

## See also

- [The .context convention](/concepts/context-convention/) — the reasoning behind this layout.
- [Sensors](/concepts/sensors/) and [Policies](/concepts/policies/) — the two authored config files in depth.
- [Harness runtime](/concepts/harness-runtime/) — what generates the runtime state.
