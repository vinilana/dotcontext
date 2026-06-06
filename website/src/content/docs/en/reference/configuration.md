---
title: Configuration reference
description: A reference for the version-controlled configuration files under .context/ — config.json, policy.json, and sensors.json — plus relevant environment variables.
sidebar:
  order: 4
---

dotcontext keeps a clear line between **authored configuration** and **generated runtime state**. Configuration lives under `.context/config/` (plus a top-level `.context/config.json`), it is meant to be committed to git, and it is shared by your whole team and every agent that touches the repo.

This page is the reference for those files: what each one is for, its shape, and whether it's tracked in git. For the *concepts* behind them, see [Policies](/concepts/policies/) and [Sensors & backpressure](/concepts/sensors/).

## The configuration files at a glance

| File | Purpose | Git-tracked | Source of truth |
| --- | --- | --- | --- |
| `.context/config.json` | Context generation configuration for repeatable scaffolding | Yes | Authored / generated at init |
| `.context/config/policy.json` | Harness policy rules and approval constraints | Yes | Authored / bootstrapped |
| `.context/config/sensors.json` | Sensor catalog for quality checks | Yes | Generated at bootstrap, edited by team |

::: tip[Commit your config]
Everything under `.context/config/` and `.context/config.json` belongs in version control. That's what makes quality gates and policies reproducible: every teammate and every agent runs against the same rules. The generated `.context/runtime/` directory is gitignored — see [The harness runtime](/concepts/harness-runtime/) for the full layout.
:::

## `.context/config.json`

**Purpose:** persists the configuration used to generate and regenerate your `.context/` scaffold, so the structure is reproducible across team checkouts.

**Classification:** versioned, git-tracked.

This file is written when you scaffold context (the `context init` MCP action) and is read by the semantic context builders so that re-running generation produces consistent results. It captures the metadata that drove the original scaffold rather than runtime state.

::: note
Context creation and fills are MCP-first — there is no standalone CLI command that authors `config.json`. It is produced and maintained through the MCP `context` tool. See [Using dotcontext with MCP](/guides/using-with-mcp/).
:::

## `.context/config/policy.json`

**Purpose:** declarative allow / deny / require-approval rules applied to workflow actions — tool invocations, path changes, and risk-based gates for PREVC phase transitions.

**Classification:** versioned, git-tracked, authored by the team.

Policies are how you encode "this kind of change needs review" or "never touch secrets" as data the runtime enforces, rather than a convention you hope an agent remembers. Read [Policies](/concepts/policies/) for the full model; this section documents the file shape.

### Document shape

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

| Field | Type | Purpose |
| --- | --- | --- |
| `version` | number | Policy document schema version |
| `defaultEffect` | `allow` \| `deny` | The effect applied when no rule matches |
| `rules[]` | array | Ordered list of policy rules, evaluated sequentially |

### Rule fields

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | string | Stable identifier for the rule |
| `effect` | `allow` \| `deny` \| `require_approval` | What happens when the rule matches |
| `when` | object | The conditions that must match for the rule to apply |
| `when.tools` | string[] | Tool names to match (e.g. `harness`) |
| `when.actions` | string[] | Action names to match (e.g. `phase.advance`) |
| `when.paths` | string[] | Glob patterns matched against file paths |
| `when.risk` | `low` \| `medium` \| `high` \| `critical` | Minimum risk threshold for the rule to apply |
| `pattern` | string | Optional glob narrowing the rule to specific files |
| `approvalRole` | string | Role required to approve when `effect` is `require_approval` |
| `reason` | string | Human-readable justification surfaced in evaluation output |

### How rules match

A policy evaluation walks the rules in order and matches on:

- **`tools`** — exact match against the invoking tool name.
- **`actions`** — exact or pattern match against the action.
- **`paths`** — glob / minimatch against the affected file paths.
- **`risk`** — matches at or above the threshold (`low` = 1, `medium` = 2, `high` = 3, `critical` = 4).

The result reports `allowed`, `blocked`, `requiresApproval`, a list of `reasons`, and the `matchedRules`.

### Bootstrap policy

On init, a starter `policy.json` is created with three rules so you have sensible protection out of the box:

| Rule | Effect | What it guards |
| --- | --- | --- |
| `protect-repository-core` | `require_approval` | High-risk changes to core source paths |
| `protect-repository-config` | `require_approval` | High-risk changes to config directories |
| `block-secrets` | `deny` | Secret-like patterns such as `**/.env*` and `**/*.key` |

::: caution
Order matters. Rules are evaluated top-to-bottom, and a `deny` rule that matches should sit where it can't be undermined by a broader `allow` below it. Keep `block-secrets`-style rules tight and explicit.
:::

## `.context/config/sensors.json`

**Purpose:** the catalog of executable quality checks (sensors) the runtime can run during a workflow.

**Classification:** versioned, git-tracked. Generated at bootstrap from your detected stack, then customized by the team.

Sensors turn "tests pass" from a claim into recorded evidence. The catalog is the single place that defines them. For the concept and how results feed phase gates, see [Sensors & backpressure](/concepts/sensors/).

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

### Top-level fields

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

### Built-in sensors and auto-detection

At bootstrap the runtime inspects your repository and suggests the built-in sensors that apply:

| Sensor | What it checks | Detected from |
| --- | --- | --- |
| `i18n-coverage` | Non-base locale files share the base locale's keyset | `locales/*.json` or `i18n/*.json` present |
| `tests-passing` | The test suite passes | `scripts.test` in `package.json` |
| `typecheck-clean` | `tsc --noEmit` (or configured command) exits cleanly | `tsconfig.json` present |

An ESLint config also triggers a suggested `lint` sensor (typically a non-blocking `warning`).

::: tip
Disable a sensor without losing it by setting `"enabled": false`. The definition stays in the catalog and in git history for when you want it back.
:::

## Environment variables

dotcontext is configured primarily through the files above rather than environment variables. The MCP server entry point itself takes **no required environment** — the standard install writes an empty `env` block:

```json
{
  "command": "npx",
  "args": ["-y", "@dotcontext/mcp@latest"],
  "env": {}
}
```

The CLI exposes the equivalent runtime knobs as flags rather than environment variables — for example `-r, --repo-path <path>` and `-v, --verbose` on the `mcp` command. See the [CLI guide](/guides/using-the-cli/) for the full surface.

::: note
If a configuration value isn't documented here, it isn't a supported knob — prefer the file-based configuration and CLI flags above over guessing at environment variables.
:::

## Where these files live

```text
.context/
├── config.json              # context generation config (versioned)
└── config/
    ├── policy.json           # policy rules (versioned)
    └── sensors.json          # sensor catalog (versioned)
```

Everything else the harness writes — sessions, workflow state, contracts, replays, datasets — lives under the gitignored `.context/runtime/` tree, covered in [The harness runtime](/concepts/harness-runtime/).

## Next steps

- Learn the model behind `policy.json` in [Policies](/concepts/policies/).
- Learn the model behind `sensors.json` in [Sensors & backpressure](/concepts/sensors/).
- Tune both files hands-on in [Customizing sensors and policies](/guides/customizing-sensors-and-policies/).
- See where generated state lives in [The harness runtime](/concepts/harness-runtime/).
