---
title: Sensors & backpressure
description: How dotcontext runs quality checks as sensors, where the sensor catalog lives, and how sensor results feed PREVC phase gates.
sidebar:
  order: 4
---

A model can claim "tests pass" — but claims aren't evidence. **Sensors** are how the dotcontext harness turns quality into something the runtime can observe and enforce, rather than something an agent merely asserts in chat.

A sensor is an executable check the runtime runs — usually a shell command like your test or typecheck script — that emits a structured result: passed, failed, skipped, or blocked. That result becomes evidence, recorded in the session and consulted whenever a phase gate or [task contract](/concepts/task-contracts/) needs to know whether the work is actually good enough to move forward.

This is what we mean by **backpressure**: when a critical, blocking sensor fails, the runtime can push back and stop the workflow from advancing — instead of letting an agent declare victory and march on.

## Why sensors exist

Prompt-only quality is fragile. If the only signal the harness has is the agent's word, every gate is a vibe check. Sensors replace that with deterministic, repeatable evidence:

- **Legible** — a sensor run is a recorded trace, not a sentence in a transcript.
- **Reusable** — the same checks gate every phase, every session, every agent.
- **Auditable** — passes and failures are persisted and show up in [replay](/concepts/replay-and-datasets/) and failure datasets.

The runtime detects sensible defaults from your repository's stack at bootstrap, writes them to a catalog you can edit, and runs them on demand during the workflow.

## The built-in sensors

dotcontext ships three canonical built-in sensors. The bootstrap step inspects your repository and suggests the ones that apply.

| Sensor | What it checks | Detected from |
| --- | --- | --- |
| `i18n-coverage` | Non-base locale files have the same keyset as the base locale | `locales/*.json` or `i18n/*.json` present |
| `tests-passing` | The test suite passes (Jest JSON parsing by default; exit-code mode for other runners) | `scripts.test` in `package.json` |
| `typecheck-clean` | `tsc --noEmit` (or the configured command) exits cleanly | `tsconfig.json` present |

Bootstrap can also suggest a `lint` sensor when an ESLint config is found.

::: note
Which sensors get suggested depends on your stack. A TypeScript repo with i18n and Jest will get all three built-ins; a repo with no test script won't be offered `tests-passing`. You can always add, remove, or edit sensors by hand in the catalog.
:::

### Severity and blocking

Each sensor carries two important flags:

- **`severity`** — typically `critical` or `warning`. Critical sensors represent gates you don't want to cross with a failure; warnings are advisory.
- **`blocking`** — when `true`, a failed run applies backpressure: the runtime treats this as a hard gate that stops progress until it passes.

A `tests-passing` sensor is usually `critical` and `blocking`. A `lint` sensor is often a `warning` that surfaces findings without halting the workflow.

## The sensor catalog

Sensors live in a single, version-controlled catalog:

```text
.context/config/sensors.json
```

It's **generated at bootstrap** from your detected stack, and it's **yours to customize** — it sits under `.context/config/`, the authored, git-tracked half of the `.context/` layout (as opposed to the generated `.context/runtime/` state). Commit it so every teammate and every agent runs the same checks.

### Catalog shape

```json
{
  "version": 1,
  "generatedAt": "2026-06-05T12:00:00.000Z",
  "source": "bootstrap",
  "stack": {
    "primaryLanguage": "TypeScript",
    "languages": ["TypeScript", "JavaScript"],
    "frameworks": ["React"],
    "buildTools": ["npm"],
    "testFrameworks": ["Jest"],
    "packageManager": "npm"
  },
  "sensors": [
    {
      "id": "tests-passing",
      "name": "Tests passing",
      "description": "Run the package test script",
      "severity": "critical",
      "blocking": true,
      "enabled": true,
      "command": "npm test -- --runInBand",
      "script": "test"
    },
    {
      "id": "typecheck-clean",
      "name": "Typecheck clean",
      "description": "Type validation with no errors",
      "severity": "critical",
      "blocking": true,
      "enabled": true,
      "command": "npm run typecheck",
      "script": "typecheck"
    }
  ]
}
```

### Catalog fields

| Field | Type | Purpose |
| --- | --- | --- |
| `version` | number | Catalog schema version |
| `generatedAt` | string | When the catalog was generated |
| `source` | `bootstrap` \| `manual` | Whether it was generated or hand-authored |
| `stack` | object | Detected stack metadata that informed the defaults |
| `sensors[]` | array | The sensor definitions the runtime can execute |

### Sensor fields

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | string | Stable identifier referenced by task contracts and gates |
| `name` | string | Human-readable label |
| `description` | string | What the sensor verifies |
| `severity` | `critical` \| `warning` | How serious a failure is |
| `blocking` | boolean | Whether a failure applies backpressure |
| `enabled` | boolean | Whether the runtime runs it |
| `command` | string | The shell command to execute |
| `script` | string | The underlying package script, when applicable |

::: tip
Disable a sensor without deleting it by setting `"enabled": false`. That keeps the definition in the catalog (and in git history) for when you want it back.
:::

## What a run produces

When the runtime executes a sensor, it emits a structured result:

```ts
{
  status: "passed" | "failed" | "skipped" | "blocked",
  summary: string,
  evidence?: string[],   // file paths, findings, links
  output?: unknown,      // command stdout or parsed JSON
  details?: Record<string, unknown>
}
```

That result is persisted as a **trace** entry (event: `sensor.run`) in the active session under `.context/runtime/sessions/<sessionId>/trace.jsonl`. Because it's part of the durable session record, you can inspect it later, compare runs across sessions, and surface recurring failures in datasets.

## How sensors feed phase gates

Sensors are the evidence layer; gates are where that evidence is enforced. Two mechanisms consume sensor results:

1. **Task contracts.** A [task contract](/concepts/task-contracts/) can list `requiredSensors` — sensor IDs that must pass before the task can complete. When the runtime evaluates completion, any required sensor that didn't pass shows up as a missing gate, and the task can't be marked done.

2. **PREVC phase advancement.** As you move through the [PREVC workflow](/concepts/prevc-workflow/), the runtime can run sensors and record their results against the current phase. A blocking, critical sensor failure is backpressure against advancing — the workflow holds at the current phase until the underlying problem is fixed.

In practice, this means a phase like **Verify** isn't "done" because an agent says so. It's done because `tests-passing` and `typecheck-clean` actually ran and actually passed, and that evidence is on record.

### Running sensors

Through the MCP surface, sensor runs are driven by harness operations — for example `recordSensor` records a sensor run against a session, and the `workflow-manage` tool exposes a `runSensors` action to execute named sensors during the workflow. The results land in the session as traces, exactly as described above.

::: caution
A sensor is only as good as its command. If a sensor's `command` doesn't actually fail on bad input (for example, a test script that always exits `0`), the gate will pass even when it shouldn't. Verify your commands return non-zero on failure before trusting them as blocking gates.
:::

## Next steps

- Tune the catalog and write your own checks in [Customizing sensors and policies](/guides/customizing-sensors-and-policies/).
- See how `requiredSensors` plug into completion gates in [Task contracts & handoffs](/concepts/task-contracts/).
- Understand the phases sensors gate in [The PREVC workflow](/concepts/prevc-workflow/).
- Inspect recorded sensor runs and recurring failures in [Replay & datasets](/concepts/replay-and-datasets/).
