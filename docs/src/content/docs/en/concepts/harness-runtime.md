---
title: The harness runtime
description: The reusable execution layer shared by the CLI and MCP — durable sessions, traces, artifacts, and checkpoints, and how they map to .context/runtime/sessions/.
sidebar:
  order: 2
---

The **harness** is the runtime at the center of dotcontext's product shape:

```text
cli -> harness <- mcp
```

Both the CLI and the MCP server are thin transports. The actual work — recording what an agent did, persisting the artifacts it produced, capturing checkpoints, and keeping a durable record you can resume or replay — lives in the harness. Because that layer is shared, an execution started over MCP and one driven from the CLI write to the same on-disk state in exactly the same format.

This page explains the four runtime entities the harness manages — **sessions**, **traces**, **artifacts**, and **checkpoints** — and where they live on disk.

::: tip[Why this matters]
A session is what turns a one-off agent run into something **legible, resumable, and auditable**. Once execution is recorded as durable state, you can pause and resume it, inspect every step, and reconstruct the whole timeline later with [replay](/concepts/replay-and-datasets/).
:::

## The runtime layer

The harness is a transport-agnostic execution layer. Whether an agent calls the `harness` MCP tool or you drive the runtime from CLI/admin commands, the runtime:

- creates and tracks **durable sessions** that survive across calls and processes,
- appends an **append-only trace** of everything that happened,
- records **artifacts** the run produced (text, JSON, or files), and
- captures **checkpoints** — named waypoints that bundle artifacts and state.

All of this is stored under `.context/runtime/`, which is generated state and is **not** version-controlled. See the [context layout reference](/reference/context-layout/) for the full directory map and what is tracked versus ignored.

## Where runtime state lives

Each session owns a folder under `.context/runtime/sessions/<sessionId>/`:

```text
.context/
└── runtime/                       # generated state, gitignored
    └── sessions/
        └── <sessionId>/
            ├── session.json       # the session record
            ├── trace.jsonl        # append-only event log (one JSON per line)
            └── artifacts/
                └── <artifactId>.json
```

| Path | What it holds |
| --- | --- |
| `.context/runtime/sessions/<id>/session.json` | The session record — status, timestamps, activity counters, and inline checkpoints |
| `.context/runtime/sessions/<id>/trace.jsonl` | Append-only event log, one JSON object per line |
| `.context/runtime/sessions/<id>/artifacts/<artifactId>.json` | One file per recorded artifact |

::: caution
Everything under `.context/runtime/` is regenerated as needed and is gitignored. Don't hand-edit these files — go through the harness so counters and the trace stay consistent.
:::

## Sessions

A **session** is a durable execution context. It is the unit you create, resume, complete, or fail, and it owns the traces, artifacts, and checkpoints recorded against it.

The session record is stored at `.context/runtime/sessions/<id>/session.json`:

```json
{
  "id": "sess_...",
  "name": "add-dark-mode",
  "status": "active",
  "repoPath": "/path/to/project",
  "createdAt": "2026-06-05T...",
  "updatedAt": "2026-06-05T...",
  "startedAt": "2026-06-05T...",
  "completedAt": null,
  "failedAt": null,
  "traceCount": 12,
  "artifactCount": 3,
  "checkpointCount": 1,
  "lastTraceAt": "2026-06-05T...",
  "lastCheckpointAt": "2026-06-05T...",
  "checkpoints": [],
  "metadata": {}
}
```

A session moves through four states:

| Status | Meaning |
| --- | --- |
| `active` | Running and accepting traces, artifacts, and checkpoints |
| `paused` | Suspended (for example after a checkpoint with `pause: true`) and resumable |
| `completed` | Finished successfully |
| `failed` | Finished with a failure recorded |

The record also keeps **activity counters** — `traceCount`, `artifactCount`, `checkpointCount` — and `lastTraceAt` / `lastCheckpointAt` timestamps so you can see at a glance how much happened and when, without parsing the trace.

Sessions are managed through the `harness` MCP tool, whose session actions include `createSession`, `listSessions`, `getSession`, `resumeSession`, `completeSession`, and `failSession`. Because the state is durable, a session created in one call can be resumed in a later one — even across processes.

## Traces

A **trace** is the append-only timeline of a session. Every meaningful event — a sensor run, a phase advance, an error — is appended as one line to `trace.jsonl`. This is the source of truth for what actually happened during a run.

Each trace entry looks like this:

```json
{
  "id": "trace_...",
  "sessionId": "sess_...",
  "level": "info",
  "event": "sensor.run",
  "message": "tests passed",
  "createdAt": "2026-06-05T...",
  "data": { "status": "passed" }
}
```

| Field | Notes |
| --- | --- |
| `level` | `debug`, `info`, `warn`, or `error` |
| `event` | Event type, e.g. `sensor.run`, `phase.advanced`, `artifact.added` |
| `message` | Human-readable description |
| `data` | Optional structured payload (sensor results, context, etc.) |

Because the file is **append-only** (`.jsonl`, one JSON object per line), traces are cheap to write and never rewrite earlier entries. Use the `harness` tool's `appendTrace` action to add an event and `listTraces` to read the timeline.

::: note
Trace `event` values like `sensor.run` are how the harness records [sensor](/concepts/sensors/) results into a session. That's what later lets task contracts check whether required sensors passed, and lets [failure datasets](/concepts/replay-and-datasets/) cluster error-level events.
:::

## Artifacts

An **artifact** is something a run produced and wants to keep — a generated document, a JSON payload, or a reference to a file on disk. Each artifact is stored as its own file under the session's `artifacts/` directory:

```json
{
  "id": "art_...",
  "sessionId": "sess_...",
  "name": "tech-spec",
  "kind": "file",
  "createdAt": "2026-06-05T...",
  "content": null,
  "path": "docs/tech-spec.md",
  "metadata": {}
}
```

| `kind` | Use it for |
| --- | --- |
| `text` | Small inline text content |
| `json` | Small inline structured content |
| `file` | A reference to a file (via `path`), for larger outputs |

For small outputs the value can live inline in `content`; for larger ones, set `path` to point at the file in the repo. Recorded artifacts are what **task contracts** check against when deciding whether a task's `requiredArtifacts` are satisfied — see [task contracts and handoffs](/concepts/task-contracts/) for how that gating works.

Add artifacts with the `harness` tool's `addArtifact` action and read them with `listArtifacts`.

## Checkpoints

A **checkpoint** is a named waypoint within a session. It bundles a set of artifacts and optional state so you have a meaningful, recoverable point to return to — useful between PREVC phases, before a risky step, or whenever you want a labeled snapshot.

Checkpoints are stored **inline** in the session record's `checkpoints` array (not as separate files):

```json
{
  "id": "ckpt_...",
  "note": "plan approved, before execution",
  "data": {},
  "artifactIds": ["art_..."],
  "createdAt": "2026-06-05T..."
}
```

| Field | Notes |
| --- | --- |
| `note` | Optional label describing the waypoint |
| `data` | Optional custom checkpoint payload |
| `artifactIds` | Artifacts to preserve at this point |

A checkpoint can also request that the session **pause** — pass `pause: true` and the session moves to `paused`, ready to be resumed later. Use the `harness` tool's `checkpoint` action to capture one.

## How sessions are recorded and replayed

The four entities compose into one durable record:

1. A **session** is created and becomes `active`.
2. As the run proceeds, events are appended to the **trace** and outputs are recorded as **artifacts**.
3. **Checkpoints** mark recoverable waypoints and can pause the session.
4. The session is eventually `completed` or `failed`.

Because all of this is persisted, the harness can reconstruct the full timeline later. **Replay** stitches a session's traces, artifacts, checkpoints, sensor runs, tasks, and handoffs back into a time-ordered event stream, and **failure datasets** mine those replays to cluster recurring problems. That's the subject of the next concept.

## Next steps

- [Replay and failure datasets](/concepts/replay-and-datasets/) — reconstruct a session's timeline and build a failure corpus from it.
- [Sensors](/concepts/sensors/) — the quality checks whose results land in the trace as `sensor.run` events.
- [Task contracts and handoffs](/concepts/task-contracts/) — gates that check recorded sensors and artifacts before a task can complete.
- [Context layout reference](/reference/context-layout/) — the full `.context/` directory map, including what is tracked versus ignored.
