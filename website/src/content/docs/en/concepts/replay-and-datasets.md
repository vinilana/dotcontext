---
title: Replay & failure datasets
description: Reconstruct durable, time-ordered session timelines with replay and cluster recurring failures into datasets for root-cause analysis.
sidebar:
  order: 7
---

Every workflow produces a trail of events: sensor runs, phase changes, artifacts, checkpoints, handoffs, and errors. **Replay** stitches that trail back together into a single, durable, time-ordered timeline you can inspect long after a session ends. **Failure datasets** then scan many replays to surface the failures that keep coming back.

Together they turn ephemeral session activity into a learning loop: replay tells you *what happened* in one run; datasets tell you *what keeps going wrong* across runs.

These features sit on top of the [harness runtime](/concepts/harness-runtime/), which records the underlying sessions, traces, artifacts, sensor runs, tasks, and handoffs.

## Why replay and datasets exist

A live session is great for getting work done, but its state is spread across several files and grows as the run proceeds. Once a run is over, you usually want answers to questions like:

- What was the exact order of events that led to a failure?
- Which sensor blocked the phase, and what was its evidence?
- Are we hitting the same typecheck error across ten different features?

Replay answers the first two by collapsing a session into one ordered event log. Datasets answer the third by clustering failures across many replays so patterns become obvious.

## Replay: a durable, ordered event log

A **replay** reconstructs a session's complete timeline from everything the harness recorded: the session record itself, its traces, artifacts, checkpoints, sensor runs, tasks, and handoffs. The result is a single document with a flat, time-ordered list of events that you can play back in sequence.

### What a replay contains

Each replay is a self-contained snapshot. Beyond the collected data, it carries a small header describing the run:

| Field | Meaning |
| --- | --- |
| `id` | Replay identifier |
| `sessionId` | The session this replay reconstructs |
| `repoPath` | Repository the session ran against |
| `createdAt` / `replayedAt` | When the replay was built |
| `fidelity` | `complete` or `partial` (whether all source data was available) |
| `eventCount` | Number of events in the ordered timeline |
| `summary` | Human-readable description of the run |

The collected source data (`session`, `artifacts`, `checkpoints`, `traces`, `sensorRuns`, `tasks`, `handoffs`) is included in full, and the `events` array merges all of it into one timeline:

```json
{
  "id": "replay-...",
  "sessionId": "session-...",
  "fidelity": "complete",
  "eventCount": 42,
  "summary": "Feature run with 1 failed sensor",
  "events": [
    {
      "id": "evt-...",
      "sessionId": "session-...",
      "createdAt": "2026-06-05T10:02:11.000Z",
      "source": "trace",
      "label": "phase.advanced P -> R",
      "payload": { "from": "P", "to": "R" }
    },
    {
      "id": "evt-...",
      "sessionId": "session-...",
      "createdAt": "2026-06-05T10:14:53.000Z",
      "source": "sensor",
      "label": "typecheck-clean failed",
      "payload": { "status": "failed" }
    }
  ]
}
```

Each event records its `source` — `session`, `trace`, `artifact`, `checkpoint`, `sensor`, `task`, or `handoff` — so you can tell at a glance where each entry came from.

### Where replays are stored

```text
.context/runtime/evaluations/replays/<replayId>.json
```

Like all harness runtime state, the `evaluations/` directory lives under `.context/runtime/` and is git-ignored. It is generated output, not authored configuration.

### Building and reading replays

Replay is an action on the `harness` MCP tool:

```jsonc
// Re-run a session into a durable replay
{ "action": "replaySession", "sessionId": "session-..." }

// List existing replays
{ "action": "listReplays" }

// Fetch one replay by id
{ "action": "getReplay", "replayId": "replay-..." }
```

:::tip
Build a replay right after a session finishes — whether it completed or failed. The replay is a stable artifact, so even if the live session is later archived or cleaned up, the timeline remains available for analysis.
:::

## Failure datasets: clustering what keeps breaking

A single replay tells you about one run. A **failure dataset** scans across replays to build a failure corpus, then groups related failures into clusters so you can see which problems recur.

### How failures are collected

The dataset builder walks replays and extracts failures of four kinds:

| Kind | What it captures |
| --- | --- |
| `sensor` | A sensor run that was blocked or failed |
| `task` | A task contract whose gates were not satisfied (missing sensors or artifacts) |
| `session` | A session that was marked failed |
| `trace` | An error-level or failed/blocked entry in the trace log |

### Signatures and clustering

Each failure is reduced to a **signature** — a normalized version of its message combined with the failure kind. Volatile details such as UUIDs are normalized (for example, replaced with `:uuid`) so that two failures describing the same underlying problem collapse to the same signature.

Failures that share a signature are grouped into a **cluster**. A cluster summarizes how often a problem appears and where:

```json
{
  "id": "dataset-...",
  "createdAt": "2026-06-05T11:00:00.000Z",
  "sessionCount": 12,
  "replayCount": 12,
  "failureCount": 27,
  "clusterCount": 4,
  "clusters": [
    {
      "signature": "task::typecheck-clean failed",
      "count": 9,
      "sessionIds": ["session-...", "session-..."],
      "exampleMessages": ["typecheck-clean failed: 3 type errors"],
      "firstSeenAt": "2026-05-28T09:11:00.000Z",
      "lastSeenAt": "2026-06-05T10:14:53.000Z"
    }
  ]
}
```

Each cluster carries its `count`, the `sessionIds` it spans, a few `exampleMessages`, and a `firstSeenAt` / `lastSeenAt` window — enough to tell whether a problem is new, chronic, or recently resolved.

### Where datasets are stored

```text
.context/runtime/evaluations/datasets/<datasetId>.json
```

Datasets live alongside replays under `.context/runtime/evaluations/` and are git-ignored.

### Building and reading datasets

Datasets are also actions on the `harness` MCP tool:

```jsonc
// Scan replays and build a failure dataset
{ "action": "buildDataset" }

// List datasets
{ "action": "listDatasets" }

// Fetch a dataset by id
{ "action": "getDataset", "datasetId": "dataset-..." }

// Inspect just the failure clusters
{ "action": "getFailureClusters", "datasetId": "dataset-..." }
```

:::note
A dataset is built from the replays that exist when you run `buildDataset`. To capture a session in a dataset, replay it first with `replaySession`, then rebuild the dataset.
:::

## A typical analysis loop

1. Run a workflow as usual; the harness records the session, its traces, sensor runs, and artifacts.
2. When the session ends, call `replaySession` to freeze its timeline into `.context/runtime/evaluations/replays/`.
3. After several sessions, call `buildDataset` to scan the accumulated replays.
4. Call `getFailureClusters` to see which failures recur most, then drill into individual replays with `getReplay` for the full event timeline behind a cluster.
5. Fix the root cause, then watch the cluster's `lastSeenAt` stop advancing in later datasets.

## Where to go next

- [Harness runtime](/concepts/harness-runtime/) — the sessions, traces, artifacts, and checkpoints that replays are built from.
- [Sensors & backpressure](/concepts/sensors/) — the quality checks whose failures populate datasets.
- [Task contracts & handoffs](/concepts/task-contracts/) — the gates that produce `task`-kind failures.
- [MCP tools reference](/reference/mcp-tools/) — the full `harness` action list, including replay and dataset actions.
