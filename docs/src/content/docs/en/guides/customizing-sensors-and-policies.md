---
title: Customizing sensors & policies
description: Edit .context/config/sensors.json and policy.json to enforce project-specific quality checks and approval rules in the harness.
sidebar:
  order: 4
---

When you bootstrap a project, dotcontext writes two configuration files that the harness reads to enforce quality: `.context/config/sensors.json` and `.context/config/policy.json`. The bootstrap versions are a reasonable starting point, but they are generated from heuristics — they don't yet know which commands matter in *your* repo, or which paths your team wants to protect.

This guide shows you how to take ownership of both files: replace bootstrap defaults with real project commands, tune severities and blocking behavior, and write policy rules that gate workflow actions.

:::tip
Both files live under `.context/config/` and are **version-controlled** — commit them alongside your code so the whole team (and every agent) enforces the same gates. See [The .context layout](/reference/configuration/) for what is tracked vs. ignored.
:::

## Before you start

These are the concepts behind the two files:

- [Sensors](/concepts/sensors/) — executable quality checks that emit pass/fail/blocked results during a workflow.
- [Policies](/concepts/policies/) — declarative allow/deny/require-approval rules applied to workflow actions and path changes.

Both are consulted by the harness at runtime, so editing them changes behavior without touching code or prompts.

## Customizing sensors

`.context/config/sensors.json` is the **sensor catalog** — the list of quality checks the harness can run, plus a snapshot of your project's stack. A bootstrap catalog looks like this:

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
      "id": "test",
      "name": "Test",
      "description": "Run package test script",
      "severity": "critical",
      "blocking": true,
      "enabled": true,
      "command": "npm test -- --runInBand",
      "script": "test"
    }
  ]
}
```

### Step 1 — Replace bootstrap commands with real ones

The bootstrap catalog guesses commands from your stack. Open the file and replace each `command` with the exact invocation your project uses. For a Node/TypeScript repo that might be:

```json
{
  "sensors": [
    {
      "id": "build",
      "name": "Build",
      "description": "Compile the project",
      "severity": "critical",
      "blocking": true,
      "enabled": true,
      "command": "npm run build"
    },
    {
      "id": "test",
      "name": "Test suite",
      "description": "Run the full test suite",
      "severity": "critical",
      "blocking": true,
      "enabled": true,
      "command": "npm test -- --runInBand"
    },
    {
      "id": "typecheck",
      "name": "Typecheck",
      "description": "Type validation without emit",
      "severity": "critical",
      "blocking": true,
      "enabled": true,
      "command": "npm run typecheck"
    },
    {
      "id": "lint",
      "name": "Lint",
      "description": "Static analysis",
      "severity": "warning",
      "blocking": false,
      "enabled": true,
      "command": "npm run lint"
    }
  ]
}
```

Use the command that *actually* fails CI in your project. If your tests run via `pytest`, `cargo test`, or `go test ./...`, put that in `command` instead — sensors are language-agnostic shell commands.

### Step 2 — Set `source` to `manual`

The bootstrap process may regenerate a catalog whose `source` is `"bootstrap"`. Once you've customized the file, change the top-level field so your edits are treated as authoritative:

```json
{
  "version": 1,
  "source": "manual"
}
```

:::caution
Leaving `source` as `"bootstrap"` signals that the catalog is auto-generated and may be overwritten on a re-bootstrap. Setting it to `"manual"` marks the catalog as owned by your team.
:::

### Step 3 — Tune severities and blocking

Each sensor carries a `severity` and a `blocking` flag that decide how a failure is treated:

| Field | Values | What it controls |
| --- | --- | --- |
| `severity` | `critical`, `warning` | How serious a failure is; surfaces in failure datasets and quality scores. |
| `blocking` | `true`, `false` | Whether a failed run blocks workflow/task completion. |
| `enabled` | `true`, `false` | Whether the sensor is eligible to run at all. |

A common pattern: make `build`, `test`, and `typecheck` `critical` + `blocking`, while keeping `lint` a non-blocking `warning` so style issues surface without halting delivery.

### How sensors run

When the harness runs a sensor, it emits a structured result and records it as a trace (`event: "sensor.run"`) in the active session:

```json
{
  "status": "passed",
  "summary": "All 214 tests passed",
  "evidence": ["coverage/lcov-report/index.html"]
}
```

`status` can be `passed`, `failed`, `skipped`, or `blocked`. Required sensors that don't end up `passed` will block a task contract from completing — see [Task contracts & handoffs](/concepts/task-contracts/).

You can trigger sensors from the MCP `workflow-manage` tool with `action: "runSensors"`, or via the `harness` tool's `recordSensor` action. Task contracts reference sensors by their `id` in `requiredSensors`.

## Customizing policies

`.context/config/policy.json` is a **policy document** — declarative rules that allow, deny, or require approval for workflow actions and path changes. A bootstrap policy protects core paths, config directories, and secrets:

```json
{
  "version": 1,
  "defaultEffect": "allow",
  "rules": [
    {
      "id": "protect-repository-core",
      "effect": "require_approval",
      "when": {
        "paths": ["src/**", "lib/**"],
        "risk": "high"
      },
      "approvalRole": "architect",
      "reason": "Core changes require review"
    },
    {
      "id": "block-secrets",
      "effect": "deny",
      "when": {
        "paths": ["**/.env*", "**/*.key"]
      },
      "reason": "Never touch secrets"
    }
  ]
}
```

### Rules and effects

A policy is a `defaultEffect` plus an ordered list of `rules`. Each rule pairs a `when` matcher with an `effect`:

| Field | Values | Meaning |
| --- | --- | --- |
| `defaultEffect` | `allow`, `deny` | Result when no rule matches. |
| `effect` | `allow`, `deny`, `require_approval` | What happens when the rule matches. |
| `approvalRole` | a PREVC role (e.g. `architect`) | Who must approve when `effect` is `require_approval`. |
| `reason` | string | Human-readable justification surfaced in evaluation output. |

The `when` block decides what a rule matches against:

| Matcher | Type | Matches |
| --- | --- | --- |
| `tools` | array | Tool name (e.g. `["harness"]`). |
| `actions` | array | Action name (e.g. `["phase.advance"]`). |
| `paths` | array | File paths via glob/minimatch (e.g. `["src/**"]`). |
| `risk` | `low`, `medium`, `high`, `critical` | Matches at or above the threshold. |

You can also set a top-level `pattern` on a rule (e.g. `"**/*.{ts,tsx}"`) to scope it to specific file types.

### Step 1 — Adjust protected paths

Update the `paths` globs to match your repository's layout. If your source lives in `app/` and `packages/`, protect those instead of `src/` and `lib/`:

```json
{
  "id": "protect-repository-core",
  "effect": "require_approval",
  "when": {
    "paths": ["app/**", "packages/**"],
    "risk": "high"
  },
  "approvalRole": "reviewer",
  "reason": "Core packages require a reviewer sign-off"
}
```

### Step 2 — Add project-specific rules

Compose rules from the matchers above. A few examples:

```json
{
  "rules": [
    {
      "id": "deny-migration-edits-mid-flight",
      "effect": "deny",
      "when": {
        "paths": ["db/migrations/**"],
        "actions": ["phase.advance"]
      },
      "reason": "Migrations are frozen during execution"
    },
    {
      "id": "approve-infra-changes",
      "effect": "require_approval",
      "when": {
        "paths": ["infra/**", "**/*.tf"],
        "risk": "medium"
      },
      "approvalRole": "architect",
      "reason": "Infrastructure changes need an architect"
    }
  ]
}
```

Rules are evaluated **in order**, so place broad `deny` rules before narrower `allow` ones when you need a default-deny posture for a path.

### How policies are evaluated

When a workflow action runs, the harness evaluates the policy and returns a structured verdict:

```json
{
  "allowed": false,
  "blocked": false,
  "requiresApproval": true,
  "reasons": ["Core changes require review"],
  "matchedRules": [
    { "rule": "protect-repository-core", "requiresApproval": true, "blocked": false, "approved": false }
  ]
}
```

`require_approval` rules don't block outright — they pause for the named `approvalRole` to sign off. You can register, inspect, and evaluate policies through the MCP `harness` tool (`registerPolicy`, `listPolicies`, `getPolicy`, `setPolicy`, `resetPolicy`, `evaluatePolicy`).

## Commit your changes

Because both files are version-controlled, commit them as part of your normal flow:

```bash
git add .context/config/sensors.json .context/config/policy.json
git commit -m "chore(context): customize sensors and policies"
```

Everyone who pulls the repo — and every agent that reads `.context/` — now enforces the same checks and gates.

## Next steps

- [Sensors](/concepts/sensors/) — the full sensor model, result shapes, and built-ins.
- [Policies](/concepts/policies/) — evaluation semantics and the bootstrap rule set.
- [Configuration & the .context layout](/reference/configuration/) — every config file and what git tracks.
- [Task contracts & handoffs](/concepts/task-contracts/) — how `requiredSensors` gate completion.
