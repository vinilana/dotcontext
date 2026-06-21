---
title: Task contracts & handoffs
description: How dotcontext turns plan phases into enforceable task contracts with sensor and artifact gates, and how agents hand work off to each other.
sidebar:
  order: 6
---

A prompt that says "implement the feature and make sure tests pass" is a wish, not a contract. The agent decides what "done" means, and you find out whether it was right only after the fact.

A **task contract** flips that around. It states, up front and in machine-checkable terms, what a task must produce and which gates block its completion. The harness — not the model — decides whether the task can be marked complete. When work moves between agents, a **handoff contract** records exactly what was transferred and why.

This page explains what a task contract is, how it derives from a linked plan, the two kinds of gates (required sensors and required artifacts), the evidence gate that protects the `E -> V` transition, and how handoffs work.

## Why task contracts exist

Task contracts give agent execution three properties that loose prompts cannot:

- **Legible acceptance** — expected outputs and acceptance criteria are written down, not implied.
- **Enforced gates** — a task can only complete when its required sensors have passed and its required artifacts exist.
- **Auditable handoffs** — every transfer between agents is a durable record with artifacts and evidence attached.

Contracts are the bridge between the [PREVC workflow](/concepts/prevc-workflow/) (which phase are we in?) and the [sensors](/concepts/sensors/) and runtime state (did the work actually happen?).

## From plan to contract

A task contract is usually **derived from a linked plan**. When you author a plan and link it to a workflow, each plan phase carries the inputs, expected outputs, acceptance criteria, and gates for the work in that phase. The harness materializes those into a task contract under `.context/runtime/contracts/tasks/`.

This is why the convention is to author a plan first — see [Authoring plans](/guides/authoring-plans/). The plan is the human-readable source; the contract is the machine-enforced derivative.

You can also define a task contract directly through the harness or workflow tools when there is no full plan to draw from.

::: tip[The activeTaskId binding]
The PREVC workflow state file, `.context/runtime/workflows/prevc.json`, carries a `binding.activeTaskId` field. That ID points at a contract under `.context/runtime/contracts/tasks/`. In other words, the active workflow knows which task contract it is currently being held to. Gates evaluated during the workflow read from that contract.
:::

## Anatomy of a task contract

A task contract is a JSON record. The fields that matter most day to day:

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | string | Stable contract identifier (referenced by `binding.activeTaskId`). |
| `title` | string | Human-readable task name. |
| `description` | string | What the task is about. |
| `status` | enum | `draft`, `ready`, `in_progress`, `blocked`, `completed`, or `failed`. |
| `inputs` | string[] | What the task starts from. |
| `expectedOutputs` | string[] | What the task should produce. |
| `acceptanceCriteria` | string[] | Conditions that define success. |
| `requiredSensors` | string[] | Sensor IDs that must pass before completion. |
| `requiredArtifacts` | (string &#124; spec)[] | Files/artifacts that must exist before completion. |
| `sessionId` | string | Session this contract is attached to (optional). |
| `owner` | string | Role or agent responsible (optional). |

`requiredSensors` and `requiredArtifacts` are the gates. Everything else describes the work; these two decide whether it is done.

### required_sensors

`requiredSensors` is a list of sensor IDs (for example `tests-passing`, `typecheck-clean`). Before a task can complete, each listed sensor must have a passing run recorded in the session. A sensor that failed, was blocked, or never ran leaves the gate open.

Sensors come from your sensor catalog at `.context/config/sensors.json`. See [Sensors & backpressure](/concepts/sensors/) for how they are detected and run.

### required_artifacts

`requiredArtifacts` declares the files or artifacts the task must produce. The shortest form is just a string:

```json
{
  "requiredArtifacts": ["test-report"]
}
```

A bare string is **short-form** for an exact name match — it is normalized to `{ "kind": "name", "name": "test-report" }`. You can also write the structured spec directly, which unlocks path, glob, and file-count matching:

| Spec | Matches when |
| --- | --- |
| `"name-string"` | Shorthand; normalized to a `name` spec (exact match on `artifact.name`). |
| `{ "kind": "name", "name": "..." }` | A recorded artifact has this exact name. |
| `{ "kind": "path", "path": "..." }` | A recorded artifact has this exact path. |
| `{ "kind": "glob", "glob": "...", "minMatches": 1, "fromFilesystem": false }` | At least `minMatches` artifacts match the glob. |
| `{ "kind": "file-count", "glob": "...", "min": 3, "fromFilesystem": false }` | At least `min` files match the glob. |

A fuller example:

```json
{
  "requiredArtifacts": [
    "tech-spec",
    { "kind": "path", "path": "docs/changelog.md" },
    { "kind": "glob", "glob": "src/**/*.test.ts", "minMatches": 1, "fromFilesystem": true },
    { "kind": "file-count", "glob": "src/components/**/*.tsx", "min": 2, "fromFilesystem": true }
  ]
}
```

#### The fromFilesystem option

By default, artifact gates check only artifacts that were explicitly recorded into the session (via `recordArtifact` and friends). That is precise, but it can produce false negatives: the files genuinely exist in the repo, the agent just never recorded them.

Setting `"fromFilesystem": true` on a `glob` or `file-count` spec tells the contract to **also scan the working tree** using the glob, and union those filesystem matches with the recorded artifacts. This closes the gap where files exist on disk but `recordArtifact` was not called.

The filesystem scan:

- resolves paths repo-relative as POSIX paths,
- times out after 5 seconds,
- ignores `**/node_modules/**`, `**/.git/**`, and `**/dist/**`.

::: note
`fromFilesystem` only applies to `glob` and `file-count` specs — the two kinds that count matches. `name` and `path` specs always check recorded artifacts.
:::

## Completing a task: the evaluation

When something asks "can this task complete?", the harness evaluates the contract against the current session and returns a structured verdict:

| Field | Meaning |
| --- | --- |
| `taskId` | The contract that was evaluated. |
| `canComplete` | `true` only if every gate is satisfied. |
| `missingSensors` | Required sensor IDs that did not pass. |
| `missingArtifacts` | Artifact specs that were not satisfied (with counts). |
| `blockingFindings` | Human-readable explanations of each open gate. |
| `matchedSensorRuns` | The passing sensor runs that satisfied the sensor gate. |
| `matchedArtifacts` | The artifacts that satisfied the artifact gate. |

If `canComplete` is `false`, `blockingFindings` tells you precisely what is missing — a failing sensor, an artifact glob with too few matches, and so on.

## The execution_evidence gate on E -> V

The most important place a task contract is enforced is the transition from **Execute (E)** to **Verify (V)** in the PREVC workflow.

dotcontext applies an **`execution_evidence`** gate at `E -> V`. The premise is simple: you should not move into verification until there is actual evidence that execution happened and held up. In practice that means the active task contract's gates — its `requiredSensors` and `requiredArtifacts` — must be satisfied before the workflow will advance from E to V.

This is what stops an agent from declaring "implementation done, moving to QA" while tests are red or the expected files were never written. The gate reads the contract bound by `binding.activeTaskId`, evaluates it, and blocks the advance if `canComplete` is `false`.

::: caution
If `E -> V` will not advance, evaluate the active task contract first. The `blockingFindings` from the evaluation are the authoritative list of what `execution_evidence` is waiting on — usually a sensor that has not passed or a required artifact that has not been produced or recorded.
:::

For how phases and gates fit together overall, see [The PREVC workflow](/concepts/prevc-workflow/).

## Handoffs between agents

A multi-phase workflow involves more than one agent: a planner produces a spec, an executor implements it, a verifier reviews it. Each transfer is a **handoff**, and dotcontext records it as a **handoff contract**.

A handoff contract captures:

| Field | Purpose |
| --- | --- |
| `id` | Stable handoff identifier. |
| `from` | Role or agent ID handing work off. |
| `to` | Role or agent ID receiving the work. |
| `artifacts` | Artifact IDs transferred in the handoff. |
| `taskId` | The task contract this handoff relates to (optional). |
| `sessionId` | The session the handoff belongs to (optional). |
| `evidence` | Links or findings passed along to the next agent. |

The receiving agent gets a concrete starting point — which artifacts to pick up and what evidence supports them — instead of inferring context from chat history. Because handoffs are durable records, they also show up later in [replay](/concepts/replay-and-datasets/) as part of the session timeline.

## Where contracts are stored

Both contract kinds live under the runtime tree, one file per contract:

```text
.context/runtime/contracts/
├── tasks/
│   └── <taskId>.json        # task contracts (derived from plan phases)
└── handoffs/
    └── <handoffId>.json     # handoff contracts between agents
```

These paths sit under `.context/runtime/`, which is generated state and is **gitignored** — contracts are reconstructable execution records, not source-controlled configuration. The plan they derive from, on the other hand, is something you author and can keep alongside the project.

## Putting it together

1. **Author a plan** with clear phases, expected outputs, and acceptance criteria. See [Authoring plans](/guides/authoring-plans/).
2. **Link the plan** to a workflow; the harness derives a **task contract** into `.context/runtime/contracts/tasks/` and binds it via `binding.activeTaskId`.
3. **During Execute (E)**, run [sensors](/concepts/sensors/) and record artifacts so the contract's gates fill in.
4. **At `E -> V`**, the `execution_evidence` gate evaluates the contract; the workflow advances only when `canComplete` is `true`.
5. **Hand off** to the next role with a handoff contract that carries the artifacts and evidence forward.

## Related

- [Authoring plans](/guides/authoring-plans/) — write the plan that a contract derives from.
- [The PREVC workflow](/concepts/prevc-workflow/) — phases, roles, and where gates apply.
- [Sensors & backpressure](/concepts/sensors/) — the quality checks behind `required_sensors`.
- [Replay & failure datasets](/concepts/replay-and-datasets/) — where contracts and handoffs show up in the timeline.
