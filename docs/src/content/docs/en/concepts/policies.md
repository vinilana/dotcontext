---
title: Policies
description: How dotcontext uses declarative policy documents to gate tool and workflow actions with allow, deny, and approval rules.
sidebar:
  order: 5
---

Sensors tell you whether work is *good*. Policies tell you whether work is *allowed*. They are the harness's guardrails: declarative allow / deny / approve rules that gate tool invocations, path changes, and risk-sensitive phase transitions before they happen.

Policies live in a single version-controlled document so your whole team shares the same boundaries — protecting core paths, blocking secrets, and requiring review where it matters.

:::tip
Policies pair naturally with [sensors](/concepts/sensors/). Sensors verify outcomes; policies constrain actions. Together they form the quality and safety layer around the [PREVC workflow](/concepts/prevc-workflow/).
:::

## The policy document

Policies are stored in `.context/config/policy.json`. This file is **version-controlled and git-tracked** — it is authored configuration, treated as part of your project, not generated runtime state.

```json
{
  "version": 1,
  "defaultEffect": "allow",
  "rules": [
    {
      "id": "protect-repository-core",
      "effect": "require_approval",
      "when": {
        "tools": ["harness"],
        "actions": ["phase.advance"],
        "paths": ["src/**", "lib/**"],
        "risk": "high"
      },
      "pattern": "**/*.{ts,tsx}",
      "approvalRole": "architect",
      "reason": "Core changes require review"
    }
  ]
}
```

### Top-level fields

| Field | Type | Description |
| --- | --- | --- |
| `version` | number | Schema version of the policy document. |
| `defaultEffect` | `allow` \| `deny` | What happens when no rule matches an action. |
| `rules` | array | Ordered list of policy rules, evaluated sequentially. |

### Rule fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Stable identifier for the rule (used in evaluation results). |
| `effect` | `allow` \| `deny` \| `require_approval` | What the rule does when it matches. |
| `when` | object | The conditions under which the rule matches (see below). |
| `pattern` | string | Optional glob narrowing the rule to specific files. |
| `approvalRole` | string | Role required to approve when `effect` is `require_approval` (e.g. `architect`). |
| `reason` | string | Human-readable explanation surfaced in evaluation output. |

### The `when` matcher

The `when` block decides whether a rule applies to a given action:

| Condition | Matching | Example |
| --- | --- | --- |
| `tools` | Exact match against the tool name | `["harness"]` |
| `actions` | Exact or pattern match against the action | `["phase.advance"]` |
| `paths` | Glob / minimatch against affected file paths | `["src/**", "lib/**"]` |
| `risk` | Threshold — matches at or above the level | `"high"` |

Risk levels are ordered: `low` (1), `medium` (2), `high` (3), `critical` (4). A rule with `risk: "high"` matches actions tagged `high` or `critical`.

## How evaluation gates actions

When a tool or workflow action runs, the harness evaluates it against the policy document. Rules are checked **in order**, and every matching rule contributes to the outcome.

A policy evaluation returns a structured verdict:

```ts
{
  allowed: boolean,           // can the action proceed?
  blocked: boolean,           // did a deny rule match?
  requiresApproval: boolean,  // is an approval gate pending?
  reasons: string[],          // human-readable explanations
  matchedRules: Array<{
    rule,
    requiresApproval,
    blocked,
    approved
  }>
}
```

The three effects map to clear outcomes:

- **`allow`** — the action proceeds.
- **`deny`** — the action is blocked (`blocked: true`, `allowed: false`). No override path.
- **`require_approval`** — the action is gated until the named `approvalRole` signs off. Until then `requiresApproval: true` and the action cannot complete.

If no rule matches, the `defaultEffect` decides the result. A `defaultEffect` of `deny` gives you a deny-by-default posture where only explicitly allowed actions pass.

:::caution
Order matters. Rules are evaluated sequentially, and a `deny` match blocks the action regardless of later rules. Put your broadest protections where they make sense, and keep `id`s descriptive so blocked actions are easy to trace in the `reasons` output.
:::

## The bootstrap policy

When the harness initializes a project, it writes a starter `policy.json` with three sensible defaults:

| Rule | Effect | Purpose |
| --- | --- | --- |
| `protect-repository-core` | `require_approval` | Gate high-risk changes to core source paths. |
| `protect-repository-config` | `require_approval` | Gate high-risk changes to configuration directories. |
| `block-secrets` | `deny` | Hard-block edits to secret-bearing files such as `**/.env*` and `**/*.key`. |

These defaults are a starting point, not a finished policy. Customize them for your repository — see [Customizing sensors and policies](/guides/customizing-sensors-and-policies/).

## Policies and autonomous mode

Autonomous mode lets a workflow skip the manual workflow gates that normally pause execution between phases. You enable it at workflow start (`workflow-init` with `autonomous: true`) or toggle it later via `workflow-manage` (`action: "setAutonomous"`).

Policies are a separate, complementary layer:

- **Workflow gates** (plan-required, approval-required) are *process* checkpoints between phases. Autonomous mode is about skipping those.
- **Policies** are *content and risk* rules evaluated per action. They are not a workflow gate you toggle off — a `deny` rule still blocks the action, and a `require_approval` rule still demands its `approvalRole`.

In practice this means autonomous mode keeps agents moving through phases without manual pauses, while your policy document continues to protect core paths and block secrets. Use policies to set the hard boundaries you want to hold *even when* a workflow runs unattended.

:::note
Think of it as two dials. Autonomous mode controls *how much human ceremony* a workflow needs between phases. Policies control *what can happen at all*. Turning up autonomy never turns off your policy guardrails.
:::

## Managing policies with the harness tool

The `harness` MCP tool exposes policy operations directly, so agents can inspect and adjust the active policy without editing JSON by hand:

| Action | Purpose |
| --- | --- |
| `listPolicies` | List the active policy rules. |
| `getPolicy` | Read the current policy document. |
| `setPolicy` | Replace the policy document. |
| `registerPolicy` | Add a rule to the active policy. |
| `resetPolicy` | Restore the bootstrap defaults. |
| `evaluatePolicy` | Test an action against the policy and inspect the verdict. |

Relevant fields when registering or evaluating a rule include `scope`, `effect`, `target`, and `pattern`.

## Where to go next

- [Sensors](/concepts/sensors/) — the quality checks that pair with policy guardrails.
- [PREVC workflow](/concepts/prevc-workflow/) — the phases that policies gate.
- [Customizing sensors and policies](/guides/customizing-sensors-and-policies/) — tune `policy.json` and `sensors.json` for your repo.
- [MCP tools reference](/reference/mcp-tools/) — the full `harness` action surface.
