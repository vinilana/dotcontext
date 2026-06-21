---
title: The PREVC workflow
description: How dotcontext structures development into five phases — Plan, Review, Execute, Verify, Confirm — and routes them by project scale.
sidebar:
  order: 3
---

PREVC is the workflow at the heart of dotcontext. It breaks any change down into five named phases — **P**lan, **R**eview, **E**xecute, **V**erify, **C**onfirm — and runs only the phases your change actually needs.

The point is not ceremony. A one-line bug fix should not march through the same gates as a security-sensitive feature. PREVC keeps small work fast and large work safe by routing phases based on the **scale** of the task, while keeping a single, durable record of what happened.

The canonical workflow state lives in `.context/runtime/workflows/prevc.json`. It is generated and managed by the harness — you drive it through the MCP `workflow-*` tools or the `dotcontext admin workflow` CLI.

## The five phases

Each phase has a single-letter code, a clear responsibility, and typical roles and outputs. P, E, and V are always part of any non-trivial route; R and C are optional and switch on as scale grows.

| Phase | Name | Responsibility | Optional? | Typical roles | Example outputs |
| --- | --- | --- | --- | --- | --- |
| **P** | Plan | Discovery, requirements, and specifications | No | planner, designer | PRD, tech-spec, requirements |
| **R** | Review | Architecture, technical decisions, design review | Yes | architect, designer | architecture, ADR, design-spec |
| **E** | Execute | Implementation and development | No | developer | code, unit tests |
| **V** | Verify | Tests, QA, and code review | No | qa, reviewer | test report, review comments, approval |
| **C** | Confirm | Documentation, deploy, and handoff | Yes | documenter | documentation, changelog, deploy |

### Plan (P)

Plan is where the work is understood before any code is written. You capture requirements, define expected outputs, and — for anything non-trivial — scaffold a plan document. The plan becomes the contract the rest of the workflow checks against.

:::tip[Authoring plans]
The plan you scaffold here drives the gates downstream. See [Authoring plans](/guides/authoring-plans/) for the structure and how phases map onto plan steps.
:::

### Review (R)

Review is an architecture and design checkpoint. It is where technical decisions get challenged and recorded as ADRs or design specs before implementation locks them in. Review is optional — it only runs for MEDIUM and LARGE work, where a wrong design choice is expensive to unwind.

### Execute (E)

Execute is implementation: the code, the unit tests, the actual change. Artifacts produced here (files, diffs) are recorded against the session so later phases and task contracts can verify them.

### Verify (V)

Verify runs your quality checks — tests, type checks, QA, code review. This is where [sensors](/concepts/sensors/) earn their keep: they run the project's checks (for example `npm test -- --runInBand`) and emit pass/fail/blocked results that gate completion.

### Confirm (C)

Confirm is the closing phase: documentation, changelog, deploy, and handoff. It only runs for LARGE work where the change needs to be communicated and shipped deliberately.

## Scale-adaptive routing

PREVC does not run all five phases every time. It routes only the phases a change needs, based on a **scale** you set explicitly or let the harness detect from your task description.

| Scale | Route | Est. time | Use cases |
| --- | --- | --- | --- |
| **QUICK** | E → V | ~5 min | Bug fixes and small tweaks (roughly 3 files or fewer, no compliance) |
| **SMALL** | P → E → V | ~15 min | Simple features (roughly 10 files or fewer) |
| **MEDIUM** | P → R → E → V | ~30 min | Regular features that need design (10–30 files; the default route) |
| **LARGE** | P → R → E → V → C | ~1+ hour | Complex systems, work that needs docs, compliance or security, 30+ files |

Notice the pattern: **E and V are always present** (you always implement and you always verify). Plan switches on at SMALL, Review at MEDIUM, and Confirm at LARGE.

### How scale is detected

When you initialize a workflow you can set `scale` directly. If you don't, the harness infers it from the `description` you pass, using signals like keywords and complexity:

- **Bug fix → QUICK**: words like `fix`, `bug`, `hotfix`, `patch`, `issue`
- **Simple feature → SMALL**: words like `add`, `simple`, `small`, `minor`, `tweak`
- **Security / compliance → LARGE**: words like `security`, `compliance`, `audit`, `gdpr`, `lgpd`
- **Needs docs → LARGE**: words like `document`, `docs`, `api`, `public`

:::note
Detection is a convenience, not a guarantee. When in doubt, set `scale` explicitly so the route is what you intend.
:::

## Gates and autonomous mode

Routing decides *which* phases run. **Gates** decide whether you're allowed to leave one phase for the next. They turn PREVC from a checklist into an enforceable process.

| Gate | What it requires | When it fires |
| --- | --- | --- |
| `require_plan` | A linked plan must exist before leaving Plan | P → R transition |
| `require_approval` | An approval must be recorded before leaving Review | R → E transition |
| `execution_evidence` | Recorded artifacts / passing sensors before completing execution | E and V transitions |

Gates are configured when you initialize a workflow and surfaced by `workflow-status`. When you call `workflow-advance`, the harness enforces the active gates: advancing P → R fails if `require_plan` is on and no plan is linked; advancing R → E fails if `require_approval` is on and no approval is recorded.

If you need to move forward anyway, `workflow-advance` accepts a `force` flag to bypass the gate — use it deliberately, since the bypass is recorded.

### Autonomous mode

For low-risk work, gates can get in the way. **Autonomous mode** lets an agent run the whole route without stopping for approvals.

- Set `autonomous: true` when calling `workflow-init` to start without gates.
- Toggle it later with `workflow-manage` using `action: "setAutonomous"` and `enabled: true | false`.

:::caution
Autonomous mode skips the human-in-the-loop gates (`require_plan`, `require_approval`). Reserve it for QUICK and SMALL work, or trusted automation — not for LARGE changes touching compliance-sensitive code.
:::

## Driving the workflow

PREVC is MCP-first. The dedicated `workflow-*` tools cover the full lifecycle:

| Tool | What it does |
| --- | --- |
| `workflow-init` | Start a PREVC workflow; set `name`, optional `description`, `scale`, `autonomous`, and gate flags |
| `workflow-status` | Report the current phase, all phase statuses, gates, linked plans, and activity |
| `workflow-guide` | Return adapter-neutral next steps, relevant skills, and portable gate decision hints |
| `workflow-advance` | Advance to the next phase; pass `outputs` produced and `force` to bypass gates |
| `workflow-manage` | Manage operations: `handoff`, `approvePlan`, `setAutonomous`, `getGates`, `recordArtifact`, `defineTask`, `runSensors`, and more |

A typical loop, after scaffolding `.context/`:

```text
workflow-init  ->  workflow-guide  ->  workflow-advance  ->  (handoff / gates)  ->  workflow-guide
```

The same operations are available from the CLI for low-level state management:

```bash
dotcontext admin workflow init "dark-mode" --description "Add dark mode" --scale MEDIUM
dotcontext admin workflow guide
dotcontext admin workflow status
dotcontext admin workflow advance --outputs plan.md
dotcontext admin workflow handoff planner developer --artifacts plan.md
```

:::tip
For the full parameter list of every `workflow-*` tool, see the [MCP tools reference](/reference/mcp-tools/).
:::

## How gates connect to task contracts

Gates check *that the phase is allowed to end*. **Task contracts** check *that the work itself is done* — they declare the sensors that must pass and the artifacts that must exist before a task can be marked complete. The two work together: a Verify gate is only meaningful if there's a contract describing what "verified" means.

You define task contracts during the workflow (for example with `workflow-manage` `action: "defineTask"`), and the harness evaluates them against recorded sensor runs and artifacts.

See [Task contracts and handoffs](/concepts/task-contracts/) for the full contract shape and how completion is evaluated.

## Where to go next

- [Authoring plans](/guides/authoring-plans/) — write the plan that the Plan phase produces and the gates check.
- [Task contracts and handoffs](/concepts/task-contracts/) — define the gates that decide when work is truly done.
- [Sensors](/concepts/sensors/) — the quality checks that power the Verify phase.
- [MCP tools reference](/reference/mcp-tools/) — every parameter for `workflow-init`, `workflow-status`, `workflow-advance`, and `workflow-manage`.
