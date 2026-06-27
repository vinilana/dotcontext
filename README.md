# @dotcontext/cli

[![npm version](https://badge.fury.io/js/@dotcontext%2Fcli.svg)](https://www.npmjs.com/package/@dotcontext/cli)
[![CI](https://github.com/vinilana/dotcontext/actions/workflows/ci.yml/badge.svg)](https://github.com/vinilana/dotcontext/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Formerly `@ai-coders/context`.** The package was renamed to avoid confusion with Context7 and other generic "context" tools. The `.context/` directory convention is unchanged. See [Migration from @ai-coders/context](#migration-from-ai-coderscontext).

<img width="1672" height="941" alt="Dotcontext" src="https://github.com/user-attachments/assets/d967d901-edcf-4512-af56-3b98322a4522" />

**Dotcontext is a harness for your harness.** We provide the contextual layer you need to keep the work going no matter which tool you switch to.

Instead of re-teaching every AI tool your project from scratch, dotcontext keeps a durable contextual layer in your repo — shared project context, workflow structure, policies, sensors, task contracts, replayable execution history, and MCP access — that travels with the project across whatever tool you use next.

The point is not only to give a model more context. The point is to make agent execution legible, constrained, reusable, and auditable.

## What Dotcontext Is

Dotcontext is three things at once:

- a `.context/` convention for durable project knowledge
- a harness runtime that governs how agents execute work
- CLI, MCP, and host integration surfaces that expose the same runtime to humans, AI tools, and lifecycle hooks

The repository is organized around one runtime and five package surfaces:

```text
cli -> harness <- mcp
              <- integrations (host hooks / extensions)
```

| Surface | Package | Role |
| --- | --- | --- |
| CLI | `@dotcontext/cli` | Operator-facing sync, import/export, MCP setup, hook install, reports, and admin workflows |
| Harness | `@dotcontext/harness` | Reusable runtime, domain rules, sessions, policies, sensors, contracts, replay, and workflow state |
| MCP | `@dotcontext/mcp` | MCP transport adapter and installer for AI tools |
| Integrations | `@dotcontext/integrations` | Host hook adapters and event mappers for Claude Code, Codex CLI, and Pi |
| Pi extension | `@dotcontext/pi` | Pi npm extension for in-process lifecycle hooks |

For the full system view, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Why Dotcontext Exists

Most agent workflows break down for the same reasons:

- project knowledge is scattered across tool-specific formats
- execution rules live in prompts instead of runtime controls
- agents can change code without producing evidence
- there is no durable record of why an agent did what it did
- teams cannot reuse the same operating model across Claude, Cursor, Codex, Copilot, Windsurf, Gemini, and other tools

Dotcontext solves that layer by combining context, workflow, contracts, sensors, policies, traces, replay, and MCP access behind one harness.

## Getting Started / Como Começar

### Path 1: MCP, recommended, no API key

Use this path when you want an AI coding tool to initialize context, create plans, fill docs, and operate the PREVC workflow.

```bash
npx @dotcontext/mcp install
```

Lifecycle hooks for Claude Code, Codex CLI, and Pi are the recommended companion to MCP for bootstrap, tracing, and workflow reminders. They are optional and non-blocking: MCP remains the full dotcontext tool surface, and hook failures should not prevent MCP from working.

```bash
npx -y @dotcontext/cli@latest hook install
```

When you use the CLI MCP installer directly, interactive installs recommend eligible hooks after MCP is configured. Non-interactive installs only write hooks when you opt in:

```bash
npx -y @dotcontext/cli@latest mcp:install codex --with-hooks
npx -y @dotcontext/cli@latest mcp:install codex --with-hooks --hook-format toml
npx -y @dotcontext/cli@latest mcp:install codex --no-hooks
```

`--no-hooks` suppresses the recommendation entirely. For Codex CLI, finish hook activation inside Codex by running `/hooks` and trusting the project hooks.

Then prompt your AI tool:

```text
init the context
plan [YOUR TASK] using dotcontext
start the workflow
```

No Dotcontext API key is required. Your AI tool provides the model.

Em português:

```text
init the context
plan [SUA TAREFA] using dotcontext
start the workflow
```

### Path 2: CLI for sync and admin tools

Use the CLI for local operator tasks such as sync, reverse sync, imports, reports, hidden admin utilities, and compatibility MCP setup.

```bash
npx -y @dotcontext/cli@latest
```

Context creation, AI-generated fills, and plan scaffolding are MCP-first. The standalone CLI does not provide the old direct `init`, `fill`, `plan`, `update`, or `analyze` command flow.

## Core Concepts

### Shared Context

One `.context/` directory stores durable project knowledge and workflow state.

```text
.context/
├── docs/        # Durable project documentation (versioned with the repo)
├── agents/      # Agent playbooks
├── skills/      # On-demand expertise guides
├── plans/       # Structured PREVC plans and execution tracking
├── config/      # Authored config: policy.json and sensors.json (version-controlled)
└── runtime/     # Generated state (gitignored):
    ├── sessions/      # one folder per session: session.json, trace.jsonl, artifacts/
    ├── workflows/     # PREVC state (prevc.json), plan tracking, collaboration records
    ├── contracts/     # task and handoff contracts
    └── evaluations/   # replays and failure datasets
```

### Harness Runtime

The runtime is the reusable execution layer used by both CLI and MCP:

- durable sessions, traces, artifacts, and checkpoints
- sensors and backpressure
- task contracts and handoffs
- policy enforcement
- PREVC workflow state
- replay and failure dataset generation

### PREVC Workflow

PREVC remains the default execution model for structured work.

| Phase | Name | Purpose |
| --- | --- | --- |
| `P` | Planning | Define requirements, scope, and plan before implementation |
| `R` | Review | Validate approach, architecture, risks, and approvals |
| `E` | Execution | Implement against the approved plan |
| `V` | Validation | Run tests, sensors, QA, and review against acceptance criteria |
| `C` | Confirmation | Final docs, changelog, deployment, and handoff |

Scale-adaptive routing can shorten the workflow:

| Scale | Phases | Use Case |
| --- | --- | --- |
| `QUICK` | E -> V | Bug fixes, typos, small tweaks |
| `SMALL` | P -> E -> V | Simple features |
| `MEDIUM` | P -> R -> E -> V | Regular features with design decisions |
| `LARGE` | P -> R -> E -> V -> C | Complex systems, compliance, or broad changes |

### Plan-Driven Contracts

Structured plans carry canonical phase metadata in frontmatter:

- `phases[].summary`
- `phases[].deliverables`
- `phases[].steps[].description`
- `phases[].steps[].assignee`
- `phases[].steps[].deliverables`
- `phases[].required_sensors`
- `phases[].required_artifacts`

`plan({ action: "link" })` bootstraps the active PREVC phase into a harness task contract when a workflow is running. `workflow-advance` completes the previous active contract and derives the next one from the linked plan.

Execution-phase plans must declare `required_sensors`. This prevents a plan from silently claiming execution is verified without evidence.

### Executable Evidence

The `execution_evidence` gate checks the active task contract before E -> V:

- required sensors must have passed
- required artifacts must be recorded or found through allowed filesystem scans
- blocking findings stop phase advancement

`autonomous_mode` bypasses only policy gates such as plan approval. It does not bypass execution evidence. Use `force: true` on `workflow-advance` only when you intentionally accept that responsibility.

### Sensors

`context({ action: "init" })` bootstraps `.context/config/sensors.json` so each project can customize its quality checks.

Built-in sensors registered by the harness:

| Sensor | What it checks |
| --- | --- |
| `i18n-coverage` | Non-base locale files have the same keyset as the base locale |
| `tests-passing` | Test suite passes, with Jest JSON parsing by default and exit-code mode for other runners |
| `typecheck-clean` | `tsc --noEmit`, or a configured command, exits cleanly |

Plan scaffolding can auto-suggest phase requirements based on the repository:

| Detected feature | Suggested sensor |
| --- | --- |
| `locales/*.json` or `i18n/*.json` | `i18n-coverage` |
| real `scripts.test` in `package.json` | `tests-passing` |
| `tsconfig.json` | `typecheck-clean` |
| ESLint config | `lint` |

For the full sensor and artifact model, including structured artifact requirements and `fromFilesystem: true`, see the [Sensors & policies guide](https://dotcontext.dev/guides/customizing-sensors-and-policies/) and [Authoring plans](https://dotcontext.dev/guides/authoring-plans/) on the documentation site.

## MCP Server Setup

The MCP package gives AI coding assistants the Dotcontext runtime through MCP tools.

### Recommended Installation

Use the installer. It is the source of truth for supported tools and config formats:

```bash
npx @dotcontext/mcp install
```

If you already have the MCP package installed globally, `dotcontext-mcp install` works too. The legacy `dotcontext mcp:install` CLI flow remains available as a compatibility path.

The installer:

- detects installed AI tools on your system
- opens an interactive tool picker when run in a terminal without a tool id
- configures the `dotcontext` MCP server in each selected tool
- supports global home-directory and local project-directory installation
- falls back to all detected tools in non-interactive runs without a tool id
- merges with existing MCP configs without overwriting unrelated servers
- supports `--dry-run` and `--verbose`
- writes the config shape required by each supported client

The CLI `mcp:install` flow can also recommend lifecycle hooks for the MCP targets that have supported host integrations: `claude` -> `claude-code`, `codex` -> `codex`, and `pi` -> `pi`. Hooks are recommended, optional, and non-blocking; they add deterministic session bootstrap, edit/bash traces, and PREVC workflow reminders, while MCP remains the full tool surface.

Interactive `mcp:install` prompts after the MCP config step for eligible targets. Non-interactive installs do not write hooks unless `--with-hooks` is present. Use `--no-hooks` to suppress the recommendation in scripts, and `--hook-format json|toml` to choose the Codex hook config format for the recommended hook step. MCP install is global by default; recommended hooks install project-local config by default. For Pi, the combined flow lets the MCP installer own the MCP snippet and does not duplicate it from the Pi extension hook step.

Examples:

```bash
# Interactive install for detected tools
npx @dotcontext/mcp install

# Install for a specific tool
npx @dotcontext/mcp install codex

# Install in the current project instead of your home directory
npx @dotcontext/mcp install cursor --local

# Preview without writing files
npx @dotcontext/mcp install claude --dry-run --verbose

# CLI combined MCP + recommended hooks for Codex
npx -y @dotcontext/cli@latest mcp:install codex --with-hooks

# Codex hooks in TOML during the combined CLI flow
npx -y @dotcontext/cli@latest mcp:install codex --with-hooks --hook-format toml

# MCP only, without hook recommendation output
npx -y @dotcontext/cli@latest mcp:install codex --no-hooks

# Remove dotcontext MCP config
npx -y @dotcontext/cli@latest mcp:uninstall codex --dry-run
```

### Supported MCP Install Targets

`install` currently supports these tool ids:

| Tool ID | Tool | Config Shape |
| --- | --- | --- |
| `claude` | Claude Code | `mcpServers` JSON |
| `cursor` | Cursor AI | `mcpServers` JSON with `type: "stdio"` |
| `windsurf` | Windsurf | `mcpServers` JSON |
| `continue` | Continue.dev | standalone `.continue/mcpServers/dotcontext.json` |
| `claude-desktop` | Claude Desktop | `mcpServers` JSON |
| `vscode` | VS Code (GitHub Copilot) | `servers` JSON |
| `roo` | Roo Code | `mcpServers` JSON |
| `amazonq` | Amazon Q Developer CLI | `mcpServers` JSON |
| `gemini` | Gemini CLI | `mcpServers` JSON |
| `codex` | Codex CLI | TOML `[mcp_servers.dotcontext]` |
| `kiro` | Kiro | `mcpServers` JSON |
| `zed` | Zed Editor | `context_servers` JSON |
| `jetbrains` | JetBrains IDEs | `servers` array |
| `trae` | Trae AI | `mcpServers` JSON |
| `kilo` | Kilo Code | `mcp` JSON |
| `copilot-cli` | GitHub Copilot CLI | `mcpServers` JSON |
| `pi` | Pi | `mcpServers` JSON (`.mcp.json` or `~/.config/mcp/mcp.json`) |

The installer supports **17 AI clients** total. The legacy tool id `gemini-cli` is accepted as an alias for `gemini`.

### Manual Configuration

Use manual configuration only when you cannot use `@dotcontext/mcp install`. Dotcontext writes this command into client configs:

```text
command: npx
args: ["-y", "@dotcontext/mcp@latest"]
```

#### Standard `mcpServers` JSON

Used by Claude Code, Windsurf, Claude Desktop, Roo Code, Amazon Q Developer CLI, Gemini CLI, Trae AI, Kiro, and GitHub Copilot CLI.

```json
{
  "mcpServers": {
    "dotcontext": {
      "command": "npx",
      "args": ["-y", "@dotcontext/mcp@latest"],
      "env": {}
    }
  }
}
```

#### Cursor

```json
{
  "mcpServers": {
    "dotcontext": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@dotcontext/mcp@latest"],
      "env": {}
    }
  }
}
```

#### Continue.dev

```json
{
  "command": "npx",
  "args": ["-y", "@dotcontext/mcp@latest"],
  "env": {}
}
```

#### VS Code (GitHub Copilot)

```json
{
  "servers": {
    "dotcontext": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@dotcontext/mcp@latest"],
      "env": {}
    }
  }
}
```

#### Zed

```json
{
  "context_servers": {
    "dotcontext": {
      "command": "npx",
      "args": ["-y", "@dotcontext/mcp@latest"],
      "env": {}
    }
  }
}
```

#### JetBrains IDEs

```json
{
  "servers": [
    {
      "name": "dotcontext",
      "command": "npx",
      "args": ["-y", "@dotcontext/mcp@latest"],
      "env": {}
    }
  ]
}
```

#### Kilo Code

```json
{
  "mcp": {
    "dotcontext": {
      "type": "local",
      "command": ["npx", "-y", "@dotcontext/mcp@latest"],
      "enabled": true
    }
  }
}
```

#### Codex CLI

```toml
[mcp_servers.dotcontext]
command = "npx"
args = ["-y", "@dotcontext/mcp@latest"]
```

### Hook Install (Claude Code, Codex CLI, Pi)

Lifecycle hooks bootstrap context, append durable traces after file edits, and surface workflow guidance when it is useful, with lower token cost than loading the full MCP surface on every turn. They are recommended for hook-capable hosts, but optional and non-blocking.

```bash
npx -y @dotcontext/cli@latest hook install
```

Hook install writes project-level configuration by default. Use `--global` only when you intentionally want home-directory hook config.

`SessionStart` resolves the project root first (`--repo-path`, then the nearest parent with `.context/`, then `cwd`) and checks readiness. If the repository is not initialized yet, the hook returns a short JSON-safe hint and does not create `.context/runtime`. Partial context lists up to three missing areas. Ready context gets compact navigation, a daily no-workflow reminder, or active PREVC preflight when a workflow is running.

`PostToolUse` appends durable `tool.use` traces for `Write`, `Edit`, and `Bash`. Bash traces include best-effort classification such as `test`, `build`, `lint`, or `inspection` without running extra commands. Repeated trace append failures are counted under `.context/runtime/hooks/trace-failures.json` and stay non-blocking.

`Stop` and session-end hooks stay quiet unless there is an active PREVC workflow. Missing, inactive, malformed, or reentrant workflow state returns a successful no-op so end-of-turn feedback does not become noise.

Examples:

```bash
npx -y @dotcontext/cli@latest hook install claude-code --dry-run
npx -y @dotcontext/cli@latest hook install codex
npx -y @dotcontext/cli@latest hook install codex --format toml
npx -y @dotcontext/cli@latest hook install pi
npx -y @dotcontext/cli@latest hook install claude-code --global
npx -y @dotcontext/cli@latest hook doctor codex --json
```

| Host | Config | Dispatch |
| --- | --- | --- |
| `claude-code` | `.claude/settings.json` | `npx -y @dotcontext/cli@latest hook dispatch --source claude-code` |
| `codex` | `.codex/hooks.json` or inline in `.codex/config.toml` | `npx -y @dotcontext/cli@latest hook dispatch --source codex` |
| `pi` | `pi install npm:@dotcontext/pi` | In-process TypeScript extension |

Codex-specific activation step:

```text
/hooks
```

After installing Codex hooks, run `/hooks` in Codex and trust project hooks when prompted. The config file can be present before this step, but Codex will not execute project hooks until they are trusted.

Diagnose Codex hook setup with:

```bash
npx -y @dotcontext/cli@latest hook doctor codex
npx -y @dotcontext/cli@latest hook doctor codex --json
```

The doctor checks Codex hook config, TOML `[features].hooks = true`, the current dotcontext dispatch command, `.context/`, workflow state, recent traces, and trace append failures.

For Pi, combine the extension (hooks) with MCP for the full tool surface:

```bash
pi install npm:@dotcontext/pi
npx @dotcontext/mcp install pi --local
pi install npm:pi-mcp-adapter
```

When Pi hooks are installed from `mcp:install pi --with-hooks`, the MCP installer has already written the MCP config, so the Pi hook step should not add a second `.mcp.json` snippet.

To remove the Pi extension, use the canonical Pi command:

```bash
pi uninstall @dotcontext/pi
```

### Local Development MCP Config

For local development, build first and point directly to the dedicated MCP binary:

```bash
npm run build
```

```json
{
  "mcpServers": {
    "dotcontext-dev": {
      "command": "node",
      "args": ["/absolute/path/to/this-repo/dist/mcp/bin.js"]
    }
  }
}
```

## MCP Tools

The MCP adapter currently exposes 12 tools: 7 action-based gateways plus 5 dedicated workflow entry points.

### Action Gateways

| Tool | Purpose | Actions |
| --- | --- | --- |
| `explore` | File and code exploration | `read`, `list`, `analyze`, `search`, `getStructure` |
| `context` | Context scaffolding and semantic context | `check`, `bootstrapStatus`, `init`, `fill`, `fillSingle`, `listToFill`, `getMap`, `buildSemantic`, `scaffoldPlan`, `searchQA`, `generateQA`, `getFlow`, `detectPatterns` |
| `sync` | Import/export synchronization with AI tools | `exportRules`, `exportDocs`, `exportAgents`, `exportContext`, `exportSkills`, `reverseSync`, `importDocs`, `importAgents`, `importSkills` |
| `plan` | Plan linking, tracking, decisions, steps, markdown sync, and phase commits | `link`, `getLinked`, `getDetails`, `getForPhase`, `updatePhase`, `recordDecision`, `updateStep`, `getStatus`, `syncMarkdown`, `commitPhase` |
| `agent` | Agent orchestration and discovery | `discover`, `getInfo`, `orchestrate`, `getSequence`, `getDocs`, `getPhaseDocs`, `listTypes` |
| `skill` | Skill management | `list`, `getContent`, `getForPhase`, `scaffold`, `export`, `fill` |
| `harness` | Explicit runtime operations | sessions, traces, artifacts, checkpoints, tasks, handoffs, sensors, policies, replay, datasets |

`context init` also bootstraps `.context/config/sensors.json`. While that catalog is still in bootstrap form, `context listToFill` and `context fill` can return it so the AI can customize project-specific quality sensors.

`searchQA` ranks generated `.context/docs/qa/*.md` helper docs by keyword match. It is a lightweight shortcut, not embedding-based semantic retrieval, and `generateQA` is opt-in.

### Dedicated Workflow Tools

| Tool | Description |
| --- | --- |
| `workflow-init` | Initialize a PREVC workflow with scale detection, gates, and harness session binding |
| `workflow-status` | Read current workflow status, phases, linked plans, and active harness task contract |
| `workflow-guide` | Read adapter-neutral next steps, relevant skills, and portable gate decision hints |
| `workflow-advance` | Advance to the next PREVC phase with gate checking and task-contract rotation |
| `workflow-manage` | Manage handoffs, collaboration, workflow docs, gates, approvals, artifacts, checkpoints, manual contracts, and sensor runs |

For AI-agent use, provide `repoPath` on the first context-heavy MCP call so dotcontext can cache the working repository.

## CLI Reference

### Requirements

- Node.js `>=20`

### Commands

| Command | Purpose |
| --- | --- |
| `npx -y @dotcontext/cli@latest` | Launch the interactive CLI with Synchronize my context, Import my context, Integrations, Settings, and Exit |
| `npx @dotcontext/mcp install` | Install MCP configuration for supported AI tools |
| `npx -y @dotcontext/cli@latest mcp:install [tool] --with-hooks` | Install MCP config and eligible recommended hooks for Claude Code, Codex CLI, or Pi |
| `npx -y @dotcontext/cli@latest mcp:uninstall [tool]` | Remove dotcontext MCP config while preserving unrelated client config |
| `npx -y @dotcontext/cli@latest hook install [host]` | Install lifecycle hooks for Claude Code, Codex CLI, or Pi |
| `npx -y @dotcontext/cli@latest hook doctor codex` | Diagnose Codex hook config, trust prerequisites, traces, and runtime state |
| `npx -y @dotcontext/cli@latest hook uninstall [host]` | Remove dotcontext hook entries |
| `npx -y @dotcontext/mcp@latest` | Start the MCP server manually |
| `npx -y @dotcontext/cli@latest sync` | Export agent playbooks to AI tools |
| `npx -y @dotcontext/cli@latest export-rules` | Export `.context/docs` rules to AI tools |
| `npx -y @dotcontext/cli@latest import-rules` | Import rules into `.context/docs` |
| `npx -y @dotcontext/cli@latest import-agents` | Import agents into `.context/agents` |
| `npx -y @dotcontext/cli@latest reverse-sync` | Import rules, agents, and skills into `.context/` |
| `npx -y @dotcontext/cli@latest admin workflow ...` | Manage PREVC workflow state from the hidden admin surface |
| `npx -y @dotcontext/cli@latest admin skill list` | List available skills |
| `npx -y @dotcontext/cli@latest admin skill export` | Export skills to AI tool directories |
| `npx -y @dotcontext/cli@latest admin report` | Generate workflow progress reports |

Examples:

```bash
npx -y @dotcontext/cli@latest sync --preset claude
npx -y @dotcontext/cli@latest export-rules --preset cursor
npx -y @dotcontext/cli@latest reverse-sync --dry-run
npx -y @dotcontext/cli@latest admin workflow init "feature-name"
npx -y @dotcontext/cli@latest admin workflow status
npx -y @dotcontext/cli@latest admin workflow advance
npx -y @dotcontext/cli@latest admin report
```

## Sync and Tool Surface Support

Dotcontext can export/import rules, agents, and skills across these current tool surfaces. As of 1.0.0, legacy flat-file and old-layout surfaces (e.g. `.cursorrules`, `.windsurfrules`, `.clinerules`, `.continuerules`, `.github/copilot/*`, `.codex/instructions.md`, the Antigravity `.agent/*` layout, older `.claude` memory files) are no longer imported or exported.

| Tool | Primary surface | Sync | MCP | Hooks |
| --- | --- | --- | --- | --- |
| Cursor | `.cursor/rules/*.mdc`, `.cursor/agents` | ✓ | ✓ | — |
| Claude Code | `CLAUDE.md`, `.claude/agents`, `.claude/skills` | ✓ | ✓ | ✓ |
| GitHub Copilot | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, `.github/agents/*.agent.md`, `.github/skills` | ✓ | ✓ (`vscode`, `copilot-cli`) | — |
| Windsurf | `.windsurf/rules`, `.windsurf/agents`, `.windsurf/skills` | ✓ | ✓ | — |
| Gemini CLI | `GEMINI.md`, `.gemini/skills` | ✓ | ✓ | — |
| Codex CLI | `AGENTS.md`, `.codex/skills`, `.codex/config.toml` | ✓ | ✓ | ✓ |
| Pi | MCP + extension | — | ✓ | ✓ (`@dotcontext/pi`) |
| Google Antigravity | `.agents/rules`, `.agents/agents`, `.agents/workflows` | ✓ | — | — |
| Trae AI | `.trae/rules`, `.trae/agents` | ✓ | ✓ | — |
| Cline | `.cline/rules`, `.cline/agents` | ✓ | — | — |
| Continue.dev | `.continue/rules`, `.continue/agents` | ✓ | ✓ | — |
| Aider | `CONVENTIONS.md` | ✓ | — | — |
| Zed | `.zed/rules` | ✓ | ✓ | — |

## Roadmap

Lifecycle hooks ship today for Claude Code, Codex CLI, and Pi. The harness runtime and `hook dispatch` model are host-agnostic; upcoming work extends `hook install` to more agents:

- **Cursor hooks** — bootstrap, durable traces, and PREVC workflow reminders (MCP and sync already supported)
- **Google Antigravity hooks** — harness-backed lifecycle integration for Antigravity hosts
- **OpenCode hooks** — session bootstrap, tracing, and workflow guidance for OpenCode CLI
- **Additional hosts** — Windsurf, GitHub Copilot, and other MCP clients as stable hook surfaces emerge

## Built-In Agents and Skills

Dotcontext includes 14 built-in agent playbook types:

| Agent | Focus |
| --- | --- |
| `architect-specialist` | System architecture and patterns |
| `feature-developer` | New feature implementation |
| `bug-fixer` | Bug identification and fixes |
| `test-writer` | Test suites and coverage |
| `code-reviewer` | Code quality and best practices |
| `security-auditor` | Security vulnerabilities |
| `performance-optimizer` | Performance bottlenecks |
| `documentation-writer` | Technical documentation |
| `backend-specialist` | Server-side logic and APIs |
| `frontend-specialist` | User interfaces |
| `database-specialist` | Database solutions |
| `devops-specialist` | CI/CD and deployment |
| `mobile-specialist` | Mobile applications |
| `refactoring-specialist` | Code structure improvements |

Built-in skills include commit messages, PR review, code review, test generation, documentation, refactoring, bug investigation, feature breakdown, API design, and security audit flows.

```bash
npx -y @dotcontext/cli@latest admin skill list
npx -y @dotcontext/cli@latest admin skill export
```

Use MCP `skill` actions when you want skill scaffolding or AI-assisted fill behavior.

## Development

Install dependencies and validate the codebase:

```bash
npm install
npm run build
npm test -- --runInBand
```

For package/release surface changes:

```bash
npm run build:packages
npm run smoke:packages
```

The package build prepares local bundles in `.release/packages/cli`, `.release/packages/harness`, `.release/packages/mcp`, `.release/packages/integrations`, and `.release/packages/pi`.

## Documentation

📖 **Full documentation site** (bilingual EN / PT-BR), built with Astro + Starlight, lives in [`docs/`](./docs/). Run it locally with `cd docs && npm install && npm run dev`, or build the static site with `npm run build`. It covers installation, a quickstart, all concepts (the `.context` convention, the harness runtime, PREVC, sensors, policies, task contracts, replay), guides, and full MCP/CLI/hook references.

Other references in this repo:

- [Documentation site](https://dotcontext.dev) — user guide, concepts, and MCP/CLI/hook reference ([`docs/`](./docs/) source)
- [Architecture](./ARCHITECTURE.md) - harness architecture and package boundaries
- [Contributing](./CONTRIBUTING.md) - contributor workflow
- [Changelog](./CHANGELOG.md) - release-facing changes

## Videos and Community

PT-BR tutorial:

https://www.youtube.com/watch?v=5BPrfZAModk

Overview video:

[![Watch the video](https://img.youtube.com/vi/p9uV3CeLaKY/0.jpg)](https://www.youtube.com/watch?v=p9uV3CeLaKY)

Built by [AI Coders Academy](http://aicoders.academy/).

- [AI Coders Academy](http://aicoders.academy/) - Courses and resources for AI-powered coding
- [YouTube Channel](https://www.youtube.com/@aicodersacademy) - Tutorials, demos, and best practices
- [Connect with Vini](https://www.linkedin.com/in/viniciuslanadepaula/) - Creator of Dotcontext

## Migration from @ai-coders/context

### What changed

| Before | After |
| --- | --- |
| `npm install @ai-coders/context` | `npm install @dotcontext/cli` |
| `npx @ai-coders/context` | `npx -y @dotcontext/cli@latest` |
| CLI command: `ai-context` | CLI command: `dotcontext` |
| MCP server name: `"ai-context"` | MCP server name: `"dotcontext"` |
| Env var: `AI_CONTEXT_LANG` | Env var: `DOTCONTEXT_LANG` |

### Migration steps

1. Update global installs, if applicable:

   ```bash
   npm uninstall -g @ai-coders/context
   npm install -g @dotcontext/cli
   ```

2. Re-run the MCP installer:

   ```bash
   npx @dotcontext/mcp install
   ```

3. Replace old shell aliases from `ai-context` to `dotcontext`.

4. Rename `AI_CONTEXT_LANG` to `DOTCONTEXT_LANG` if you set it.

5. Keep your `.context/` directory. The directory convention remains the same.

## License

MIT (c) Vinícius Lana
