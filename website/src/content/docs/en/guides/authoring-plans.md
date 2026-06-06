---
title: Authoring plans
description: Scaffold a plan, write its phases and execution-evidence requirements, and link it to the PREVC workflow so the harness can enforce real completion gates.
sidebar:
  order: 3
---

A **plan** is the bridge between intent and enforcement. It describes *what* you intend to build and *how* — broken into PREVC phases, steps, and deliverables — and, crucially, it declares the **execution evidence** (sensors and artifacts) that must exist before a phase is allowed to complete.

When you link a plan to a workflow, the harness derives a **task contract** from it. That contract is what the `execution_evidence` gate consults to decide whether execution actually happened — not just whether someone *said* it did.

This guide walks through scaffolding a plan, writing its frontmatter, and linking it so those gates become meaningful.

:::tip[New to the concepts?]
Read [Task contracts](/concepts/task-contracts/) and the [PREVC workflow](/concepts/prevc-workflow/) first. This guide assumes you know what a phase, a sensor, and a contract are.
:::

## Why plans matter

Without a plan, a workflow can advance through phases on the agent's word alone. With a linked plan:

- Each PREVC phase carries a list of **required sensors** and **required artifacts**.
- Those requirements flow into a derived task contract.
- The `execution_evidence` gate (E → V) blocks advancement until the contract can complete — i.e. the required sensors have **passed** and the required artifacts have been **recorded**.

In short: a plan turns "trust me" into "show me."

## Scaffold a plan

Plans are **MCP-first**. Use the `context` tool's `scaffoldPlan` action to generate a frontmatter-driven plan template under `.context/plans/`.

```jsonc
// MCP tool: context
{
  "action": "scaffoldPlan",
  "repoPath": "/path/to/project",
  "planName": "dark-mode",
  "title": "Add dark mode",
  "summary": "Introduce a theme toggle with persisted preference and full i18n coverage."
}
```

| Parameter | Purpose |
| --- | --- |
| `action` | Must be `scaffoldPlan`. |
| `planName` | Plan identifier; slugified into the filename. |
| `title` | Human-readable plan title. |
| `summary` | One-line goal of the plan. |
| `repoPath` | Project root (provide on the first call; cached afterward). |

This writes a plan file to `.context/plans/<slug>.md` — for example `.context/plans/dark-mode.md`. The scaffolder also inspects your stack and pre-suggests phase requirements (for example a `tests-passing` sensor when it finds a test script).

:::note[Where plans live]
`.context/plans/` is treated as local working state and is git-ignored by default. If your team wants to version a plan, commit it explicitly.
:::

## Plan frontmatter

The scaffolded file is a Markdown document whose YAML frontmatter carries the structured plan. The harness reads the frontmatter; the prose body below it is for humans.

```yaml
---
type: plan
name: dark-mode
description: Add a dark mode theme toggle.
planSlug: dark-mode
summary: "Introduce a theme toggle with persisted preference and full i18n coverage."
agents:
  - type: "developer"
    role: "Implement the toggle and persistence"
  - type: "qa"
    role: "Validate themes and i18n"
docs:
  - ".context/docs/architecture.md"
phases:
  - id: "plan-1"
    name: "Design the toggle"
    prevc: "P"
    summary: "Decide on storage and theming approach."
    deliverables:
      - "tech-spec for theme storage"
    steps:
      - order: 1
        description: "Pick a persistence strategy (localStorage vs. cookie)."
        assignee: "planner"
        deliverables:
          - ".context/docs/tech-spec.md"
  - id: "exec-1"
    name: "Implement dark mode"
    prevc: "E"
    summary: "Build the toggle, wire persistence, add translations."
    required_sensors:
      - "tests-passing"
      - "typecheck-clean"
      - "i18n-coverage"
    required_artifacts:
      - kind: "glob"
        glob: "src/theme/**/*.ts"
        minMatches: 1
      - "changelog"
    steps:
      - order: 1
        description: "Add the theme context and toggle component."
        assignee: "developer"
        deliverables:
          - "src/theme/ThemeProvider.tsx"
generated: 2026-06-05
status: unfilled
scaffoldVersion: "2.0.0"
---
```

### Phase fields

Each entry in `phases[]` maps a plan-local phase onto a PREVC phase.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable phase identifier (e.g. `exec-1`). |
| `name` | string | Display name for the phase. |
| `prevc` | `P` \| `R` \| `E` \| `V` \| `C` | Which PREVC phase this maps to. |
| `summary` | string | One-line objective for the phase. |
| `deliverables` | string[] | What the phase as a whole should produce. |
| `steps` | object[] | Ordered work items within the phase. |
| `required_sensors` | string[] | Sensor IDs that must **pass** before the phase can complete. |
| `required_artifacts` | (string \| spec)[] | Artifacts that must be **recorded** before completion. |

### Step fields

Each entry in `phases[].steps[]` is a concrete unit of work.

| Field | Type | Meaning |
| --- | --- | --- |
| `order` | number | Position of the step within the phase. |
| `description` | string | What the step does. |
| `assignee` | string | Role or agent responsible (e.g. `developer`). |
| `deliverables` | string[] | Files or outputs the step produces. |

### Required sensors

`required_sensors` lists sensor IDs from your [sensor catalog](/concepts/sensors/) (`.context/config/sensors.json`). The IDs must match exactly — for example `tests-passing`, `typecheck-clean`, or `i18n-coverage`. A phase is only considered complete when each listed sensor has a recorded run with `status: "passed"` in the session.

### Required artifacts

`required_artifacts` accepts a short string (interpreted as an exact artifact **name**) or a structured spec for flexible matching:

| Spec | Matches |
| --- | --- |
| `"changelog"` | An artifact recorded with `name: "changelog"`. |
| `{ kind: "name", name: "..." }` | Exact artifact name. |
| `{ kind: "path", path: "..." }` | Exact artifact path. |
| `{ kind: "glob", glob: "...", minMatches?: n }` | At least `minMatches` artifacts matching the glob. |
| `{ kind: "file-count", glob: "...", min: n }` | At least `min` files matching the glob. |

Glob and file-count specs can also scan the working tree, so a contract can be satisfied by files that exist in the repo even if `recordArtifact` was never called for them.

## Why Execution phases must declare `required_sensors`

This is the most important habit when authoring plans.

The `execution_evidence` gate fires on the **E → V** transition. It looks for an active task contract and checks whether that contract can complete. There are two ways it blocks you:

1. **No active contract.** If nothing is linked, the gate has nothing to verify and refuses to advance. The fix is to link a plan (so a contract is derived) or define a task explicitly.
2. **Incomplete evidence.** If a contract exists but its required sensors haven't passed or its required artifacts haven't been recorded, the gate reports the missing items and blocks advancement.

If your Execution phase declares **no** `required_sensors` and **no** `required_artifacts`, the derived contract is trivially satisfiable — the gate becomes a rubber stamp. Declaring requirements on the Execution phase is the canonical way to make `execution_evidence` meaningful: it forces real test runs, real type checks, and real recorded output before validation can begin.

:::caution[Don't leave Execution empty]
An Execution phase with empty `required_sensors` defeats the purpose of the workflow. At minimum, require the sensors that prove your change is sound — typically `tests-passing` and `typecheck-clean`.
:::

When the gate blocks you, it tells you exactly what to do next, for example:

```text
Execution evidence is incomplete: required sensors not passed (tests-passing).
Hint: Run the required sensors via harness({ action: "runSensors", sensorIds: ["tests-passing"] })
and record the required artifacts via harness({ action: "recordArtifact", ... }) before advancing.
```

## Link a plan

Scaffolding writes the file; **linking** activates it. The `plan` tool's `link` action attaches the plan to the current workflow and derives a task contract from each phase's requirements.

```jsonc
// MCP tool: plan
{
  "action": "link",
  "planSlug": "dark-mode"
}
```

Once linked:

- The plan appears under the workflow's active plans.
- Each phase's `required_sensors` and `required_artifacts` populate the derived task contract's `requiredSensors` and `requiredArtifacts`.
- The `execution_evidence` gate has something concrete to check.

You can inspect the linked plan and its phase mapping at any time:

```jsonc
// MCP tool: plan
{ "action": "getLinked" }
```

```jsonc
// MCP tool: plan
{ "action": "getDetails", "planSlug": "dark-mode" }
```

## A typical authoring flow

1. Scaffold the structure with `context({ action: "scaffoldPlan", ... })`.
2. Edit `.context/plans/<slug>.md` — flesh out phases, steps, deliverables, and (most importantly) `required_sensors` / `required_artifacts` on the Execution phase.
3. Link it with `plan({ action: "link", planSlug: "<slug>" })`.
4. Run the workflow. As you reach **E → V**, run the required sensors and record artifacts so the gate passes.
5. Track progress with `plan({ action: "updateStep", ... })` and `plan({ action: "updatePhase", ... })` as work lands.

## Related reading

- [Task contracts](/concepts/task-contracts/) — how requirements become enforceable gates.
- [PREVC workflow](/concepts/prevc-workflow/) — the phases and transitions a plan maps onto.
- [Sensors](/concepts/sensors/) — the quality checks referenced by `required_sensors`.
- [MCP tools reference](/reference/mcp-tools/) — full `context` and `plan` action lists.
