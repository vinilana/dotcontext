# Dotcontext Guide

`dotcontext` ships separate CLI and MCP package surfaces for shared AI context, PREVC workflow tracking, and context import/export across coding tools.

This guide reflects the current product shape in `0.9.x`:

- Context creation and AI-generated fills happen through MCP-connected AI tools.
- The standalone CLI is still useful for sync/import operations, MCP setup, and hidden `admin` utilities.
- The public product name is `dotcontext`.
- The operator CLI package is `@dotcontext/cli`.
- The MCP setup and server package is `@dotcontext/mcp`.

## Start Here

The fastest path for most users is:

```bash
# 1. Install the MCP server into your AI tool
npx @dotcontext/mcp install

# 2. In your AI tool, ask it to initialize context
# Example prompts:
#   init the context
#   plan authentication rollout using dotcontext
#   start the workflow

# 3. For non-trivial work, track execution from the CLI
npx -y @dotcontext/cli@latest admin workflow init "feature-name"
```

If you are using the MCP path, you usually do not need an API key. Your AI tool provides the model.

## What The Package Does Today

| Area | Current Role |
| --- | --- |
| MCP setup | Installs and configures the `dotcontext` MCP server across supported AI clients with client-specific config formats |
| Context scaffolding | Creates and fills `.context/` content through MCP-connected AI tools |
| Workflow tracking | Manages PREVC phase progression from the hidden `admin workflow` surface or MCP |
| Sync and imports | Exports rules and agents to AI tools, and imports existing tool-specific content back into `.context/` |
| Skills | Lists and exports built-in or project skills through the hidden `admin skill` surface |

## What Changed

Older docs and examples may still refer to flows that are no longer the primary path.

- Standalone CLI generation is no longer the recommended path for creating or filling context.
- Use MCP-connected AI tools for context init, plan scaffolding, and AI-generated content.
- There is no top-level `quick-sync` command, but interactive quick sync is still available from `npx -y @dotcontext/cli@latest`.

If you are looking for `init`, `fill`, `plan`, `update`, or `analyze` as direct CLI commands, that is expected. Those responsibilities moved into MCP workflows.

## Recommended Workflow

### 1. Install MCP

```bash
npx @dotcontext/mcp install
```

This configures the `dotcontext` MCP server for supported AI tools. Use `--dry-run` to preview changes, `--local` to install in the current project instead of your home directory, or pass a specific tool id such as `codex`, `cursor`, or `claude`.

When you run `npx @dotcontext/mcp install` in an interactive terminal without a tool id, the installer opens a guided tool picker. In non-interactive contexts, it defaults to installing for `all` detected tools.

Examples:

```bash
npx @dotcontext/mcp install codex
npx @dotcontext/mcp install cursor --local
npx @dotcontext/mcp install claude --dry-run --verbose
```

Currently supported install targets include Claude Code, Cursor, Windsurf, Continue.dev, Claude Desktop, VS Code (GitHub Copilot), Roo Code, Amazon Q Developer CLI, Gemini CLI, Codex CLI, Kiro, Zed, JetBrains IDEs, Trae AI, Kilo Code, and GitHub Copilot CLI.

### 2. Initialize Context From Your AI Tool

After MCP is installed, ask your AI assistant to initialize the repository context. A typical flow is:

1. Initialize `.context/`
2. Fill pending docs, agents, or plans
3. Start a PREVC workflow when the task is not trivial

Typical prompts:

- `init the context`
- `plan this task using dotcontext`
- `fill the pending context files`

### 3. Track Execution With PREVC

For work that needs structure, use the workflow commands:

```bash
npx -y @dotcontext/cli@latest admin workflow init "feature-name"
npx -y @dotcontext/cli@latest admin workflow status
npx -y @dotcontext/cli@latest admin workflow advance
```

The workflow uses PREVC:

| Phase | Meaning | Typical Output |
| --- | --- | --- |
| `P` | Planning | Requirements, PRD, scope |
| `R` | Review | Architecture, design decisions, approval |
| `E` | Execution | Code changes and implementation notes |
| `V` | Validation | Tests, QA, review feedback |
| `C` | Confirmation | Final docs, changelog, handoff |

When you link a plan to an active workflow, dotcontext now bootstraps a harness task contract for the current PREVC phase. On each `workflow-advance`, the previous contract is completed and a new one is derived from the linked plan for the next phase.

Structured plan metadata is canonical in frontmatter:

- `phases[].summary`
- `phases[].deliverables`
- `phases[].steps[].description`
- `phases[].steps[].assignee`
- `phases[].steps[].deliverables`

For larger tasks, the workflow can also record handoffs and collaboration:

```bash
npx -y @dotcontext/cli@latest admin workflow handoff feature-developer code-reviewer
npx -y @dotcontext/cli@latest admin workflow collaborate "API contract review"
```

### 4. Sync or Import Context As Needed

Use the CLI when you need to move rules or agents between `.context/` and tool-specific directories.

Export rules:

```bash
npx -y @dotcontext/cli@latest sync --preset cursor
```

Export agents:

```bash
npx -y @dotcontext/cli@latest sync --preset claude
```

Import rules or agents from existing tool configs:

```bash
npx -y @dotcontext/cli@latest import-rules
npx -y @dotcontext/cli@latest import-agents
```

Reverse-sync everything back into `.context/`:

```bash
npx -y @dotcontext/cli@latest reverse-sync --dry-run
```

### 4a. Interactive Quick Sync

If you want a guided export flow instead of calling individual commands, use the interactive CLI:

```bash
npx -y @dotcontext/cli@latest
```

The quick sync flow can export docs, agents, and skills together. It is part of the interactive experience, not a separate `quick-sync` command.

### 5. Review Progress

Generate a workflow report when you want a quick status snapshot:

```bash
npx -y @dotcontext/cli@latest admin report
```

You can also export the report as Markdown or JSON.

## `.context/` Layout

The exact files vary by project type, but the working structure is centered on `.context/`:

```text
.context/
├── docs/        # Project documentation
├── agents/      # Agent playbooks
├── skills/      # On-demand expertise guides
├── plans/       # Plan templates and execution tracking
└── workflow/    # PREVC workflow state
```

The generated docs are project-aware. You should expect the content to differ between CLI tools, libraries, backends, frontends, and monorepos.

## CLI Reference

These are the main commands currently exposed by the CLI:

| Command | Purpose |
| --- | --- |
| `npx -y @dotcontext/cli@latest` | Launch the interactive CLI, including quick sync |
| `npx @dotcontext/mcp install` | Install MCP configuration for supported AI tools |
| `npx -y @dotcontext/mcp@latest` | Start the MCP server manually |
| `npx -y @dotcontext/cli@latest admin workflow ...` | Manage PREVC workflow state |
| `npx -y @dotcontext/cli@latest admin skill list` | List available skills |
| `npx -y @dotcontext/cli@latest admin skill export` | Export skills to AI tool directories |
| `npx -y @dotcontext/cli@latest sync` | Export agent playbooks to AI tools |
| `npx -y @dotcontext/cli@latest export-rules` | Export `.context/docs` rules to AI tools |
| `npx -y @dotcontext/cli@latest import-rules` | Import rules into `.context/docs` |
| `npx -y @dotcontext/cli@latest import-agents` | Import agents into `.context/agents` |
| `npx -y @dotcontext/cli@latest reverse-sync` | Import rules, agents, and skills into `.context/` |
| `npx -y @dotcontext/cli@latest admin report` | Generate workflow progress reports |

## MCP Reference

The MCP server exposes focused tools instead of a large set of one-off commands.

| MCP Tool | Purpose |
| --- | --- |
| `explore` | Read files, list paths, search code, analyze symbols, inspect structure |
| `context` | Check/init/fill context, build semantic context, scaffold plans, and use optional Q&A/flow helpers |
| `workflow-init` | Start PREVC workflow tracking |
| `workflow-status` | Read current workflow status and the active harness task contract |
| `workflow-advance` | Advance to the next PREVC phase and rotate the active task contract |
| `workflow-manage` | Handoffs, collaboration, docs, approvals, gate changes, and manual contract definition |
| `sync` | Export or import docs, rules, agents, and skills |
| `plan` | Link plans, bootstrap structured phase contracts, update execution state, record decisions, commit phase artifacts |
| `agent` | Discover and orchestrate agents |
| `skill` | List, scaffold, export, and fill skills |

For AI-agent use, provide `repoPath` on the first context-heavy MCP call so dotcontext can cache the working repository.

## Skills

The current standalone skill commands are intentionally narrow:

```bash
npx -y @dotcontext/cli@latest admin skill list
npx -y @dotcontext/cli@latest admin skill export
```

Use the MCP `skill` tool when you want skill scaffolding or AI-assisted fill behavior. The CLI remains focused on discovery and export.

## Executable Acceptance

A plan step can declare a verifiable acceptance predicate. The harness runs it
before allowing the step to be marked `completed`. A non-zero exit code rejects
the transition and the step keeps its prior status; the result is recorded
under `acceptanceRun` for auditing.

Seed an acceptance on the tracked step (JSON under
`.context/workflow/plan-tracking/<slug>.json`):

```json
{
  "stepIndex": 1,
  "description": "Cobertura i18n 100%",
  "status": "in_progress",
  "acceptance": {
    "kind": "shell",
    "command": ["npm", "test", "--", "i18n-coverage"],
    "timeoutMs": 60000
  }
}
```

Shell safety: `command` is an argv array, always spawned with `shell: false`
(no shell interpolation). Pass flags as separate array entries.

When the harness attempts to mark the step `completed`, a failing predicate
returns a structured response (via the MCP `plan.updateStep` action) with the
captured `tailStdout` / `tailStderr` and the non-zero `exitCode` rather than a
500 error. On success, the step transitions to `completed` and the passing
`acceptanceRun` is persisted.

## Declaring Execution Requirements in Plans

The `execution_evidence` gate (E -> V) only has teeth when the derived task
contract actually declares what evidence is required. Plan frontmatter is the
canonical place to declare it, per phase:

```yaml
---
type: plan
name: auth-rollout
description: "Authentication rollout."
planSlug: auth-rollout
generated: "2026-04-13"
status: filled
scaffoldVersion: "2.0.0"
phases:
  - id: phase-1
    prevc: P
    name: Planning
  - id: phase-2
    prevc: E
    name: Implementation
    required_sensors:
      - tests
      - typecheck
    required_artifacts:
      - handoff-summary
  - id: phase-3
    prevc: V
    name: Validation
    required_sensors:
      - tests
      - lint
---
```

`required_sensors` are sensor ids that must have `status==='passed'` in the
harness session. `required_artifacts` are artifact names/paths that must have
been recorded via `harness({ action: "recordArtifact", ... })`.

### Structured artifact requirements

`required_artifacts` accepts either bare strings (exact name match,
backwards-compatible) or structured `RequiredArtifactSpec` objects. Specs let
plans gatekeep multi-file work — e.g., "every locale must be translated" — that
exact-name matching cannot express.

Four `kind`s are supported:

| `kind`         | Shape                                                  | Match                                                  |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| `name`         | `{ kind: name, name: string }`                         | exact match against `artifact.path \|\| artifact.name` |
| `path`         | `{ kind: path, path: string }`                         | exact path match                                       |
| `glob`         | `{ kind: glob, glob: string, minMatches?: number }`    | minimatch glob; needs `>= minMatches` (default `1`)    |
| `file-count`   | `{ kind: file-count, glob: string, min: number }`      | shorthand for glob with `minMatches = min`             |

Example plan frontmatter:

```yaml
phases:
  - id: phase-2
    prevc: E
    name: Implementation
    required_sensors: [tests]
    required_artifacts:
      - { kind: glob, glob: "locales/**/*.json", minMatches: 5 }
      - { kind: file-count, glob: "docs/migration/*.md", min: 2 }
      - i18n-coverage-report   # legacy string == { kind: name, name: "i18n-coverage-report" }
```

When the gate blocks, `missingArtifacts` reports a human-readable description,
e.g. `glob(locales/**/*.json) min=5 (got 2)`. By default, matching runs only
against artifacts recorded on the active session.

#### `fromFilesystem: true`

For `glob` and `file-count`, set `fromFilesystem: true` to also scan the
project working tree (relative to `repoPath`) and union those hits with
recorded artifacts. This eliminates the false-blocked case where a file
exists in the repo but no one called `recordArtifact`.

```yaml
required_artifacts:
  - { kind: glob, glob: "locales/*.json", minMatches: 5, fromFilesystem: true }
  - { kind: file-count, glob: "docs/migration/*.md", min: 2, fromFilesystem: true }
```

Scan rules:

- Paths resolved outside `repoPath` are refused.
- `node_modules`, `.git`, and `dist` are always excluded.
- A 5s timeout protects against runaway scans; failure or timeout becomes a
  `blockingFinding` (`filesystem scan failed for <pattern>: <reason>`) rather
  than a crash.
- Recorded artifacts and filesystem hits are deduplicated by path so the
  same file never counts twice.

Rules:

- `plan({ action: "link", ... })` **hard-fails** if the plan has an Execution
  (`prevc: E`) phase without `required_sensors`. Declare them or remove the E
  phase from the plan. There is no escape flag — the point is to stop silent
  "execution verified" claims at the source.
- When a phase omits requirements, `DerivedPlanTaskContractBuilder` falls back
  to conservative defaults: `E` -> `['tests']`, `V` -> `['tests', 'lint']`.
  Phases P/R/C have no default and honor only what the plan declares.
- Requirements propagate into the derived `HarnessTaskContract` on link and on
  each `workflow-advance` that rotates the active contract.

## Phase Gates são Executáveis

Phase advancement in PREVC is gated by three checks surfaced as
`GateCheckResult.gates`:

| Gate | Transition | Suppressed by `autonomous_mode`? |
| --- | --- | --- |
| `plan_required` | P → R when `require_plan` is on | Yes |
| `approval_required` | R → E when `require_approval` is on | Yes |
| `execution_evidence` | E → V whenever an active task contract exists | **No** |

`execution_evidence` consults the active `HarnessTaskContract` via
`evaluateTaskCompletion`. The gate fails closed when:

- the active task has `requiredSensors` that never passed in this session, or
- the active task has `requiredArtifacts` that were never recorded, or
- no active task contract exists for the current phase.

`autonomous_mode=true` only bypasses the policy gates
(`plan_required`, `approval_required`). It intentionally does **not** bypass
`execution_evidence` — "autonomous" does not mean "skip verification that
the work actually happened". To genuinely override, use `force: true` when
calling `workflow-advance`, which skips gate enforcement entirely at the
caller's responsibility.

## Built-in Sensors

### `i18n-coverage`

Compares translation keys between a base locale file and every other locale
file in a configured directory. Registered by default in every harness
session, but only executed when a plan/task contract declares it under
`required_sensors`.

Options (passed via `runSensors` `metadata` or `context`):

| Option        | Default     | Meaning                                                  |
| ------------- | ----------- | -------------------------------------------------------- |
| `baseLocale`  | `'en'`      | locale id used as the source of truth keyset             |
| `localesDir`  | `'locales'` | directory (repo-relative) containing `<locale>.json`     |
| `format`      | `'json'`    | `'json'` (top-level keys) or `'json-nested'` (flattened) |

Plan declaration:

```yaml
phases:
  - id: phase-2
    prevc: E
    name: Implementation
    required_sensors:
      - i18n-coverage
    required_artifacts:
      - { kind: glob, glob: "locales/*.json", minMatches: 3, fromFilesystem: true }
```

Output (persisted in the `sensor.run` trace):

```json
{
  "coverage":   { "en": 1, "pt": 1, "es": 0.66 },
  "missingKeys": { "en": [], "pt": [], "es": ["b", "c"] }
}
```

Pass condition: every non-base locale has `missingKeys.length === 0`.
Failure modes (all reported with the offending file/path, never crash):

- `localesDir` missing
- malformed JSON in any `<locale>.json`
- base locale absent from `localesDir`

## Troubleshooting

### "CLI init/plan/fill command not found"

That is expected in the current product. Use an MCP-connected AI tool for context creation, plan scaffolding, and AI-generated fill operations.

### ".context/ does not exist yet"

Install MCP and ask your AI tool to initialize context first. If you already have tool-specific files elsewhere, use `reverse-sync` to import them.

### "Workflow not initialized"

Initialize the workflow after `.context/` exists:

```bash
npx -y @dotcontext/cli@latest admin workflow init "feature-name"
```

### "I only need exports/imports"

You do not need the full PREVC workflow for that. Use the sync and import commands directly.

## Environment Notes

- Node.js `>=20` is required.
- The CLI supports English and `pt-BR`.
- The CLI package is `@dotcontext/cli`, the MCP package is `@dotcontext/mcp`, the CLI command is `dotcontext`, and the MCP server name is `dotcontext`.

## Quick Reference

```bash
npx -y @dotcontext/cli@latest
npx @dotcontext/mcp install
npx -y @dotcontext/cli@latest admin workflow init "feature-name"
npx -y @dotcontext/cli@latest admin workflow status
npx -y @dotcontext/cli@latest admin workflow advance
npx -y @dotcontext/cli@latest admin skill list
npx -y @dotcontext/cli@latest admin skill export
npx -y @dotcontext/cli@latest sync --preset claude
npx -y @dotcontext/cli@latest export-rules --preset cursor
npx -y @dotcontext/cli@latest reverse-sync --dry-run
npx -y @dotcontext/cli@latest admin report
```
