# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.9.2]

### Fixed

- **`@dotcontext/mcp install` now honors the guided install flow**
  - Running `npx @dotcontext/mcp install` in an interactive terminal now opens the same tool-selection prompt used by the main CLI compatibility command
  - Non-interactive runs without an explicit tool continue to fall back to `all` detected tools
  - The standalone MCP package now prints the post-install restart hint after successful installs, matching the CLI flow

- **Local release bundles are now executable through `npx` from the bundle root**
  - `build:packages` now generates package-local `node_modules/.bin` shims for bin-bearing bundles
  - `smoke:packages` now verifies `npm exec` against the generated `cli` and `mcp` bundle roots instead of checking only static manifest fields

## [0.9.0] - 2026-04-11

### Why this release matters

`0.9.0` is the release where `dotcontext` stops being described primarily as a CLI plus MCP installer and becomes a harness engineering runtime for agent-driven software delivery.

The reason for this shift is practical:

- The project already had three distinct responsibilities in the same codebase: operator commands, MCP transport, and runtime orchestration/state.
- Keeping those concerns blurred made the product harder to evolve, harder to reason about, and harder to make reliable for long-running agent workflows.
- The new harness layer makes the execution model explicit: sessions, traces, artifacts, sensors, task contracts, handoffs, policy, replay, and workflow state are now first-class runtime concerns instead of incidental side effects spread across the CLI and MCP adapters.

In product terms, this release establishes the architecture the project was already converging toward:

- `dotcontext` CLI for operator-facing sync, reverse-sync, install, and local admin flows
- `dotcontext/harness` as the reusable runtime and control plane
- `dotcontext/mcp` as the transport adapter agents talk to

This release does not just add new commands. It changes what the product is for:

- from scaffolding and sync around `.context`
- to a runtime that can govern how agents operate, validate work, exchange artifacts, persist execution state, and expose that behavior consistently through MCP and workflow layers

That is why many of the changes below are structural. The value of `0.9.0` is not only new functionality, but that the system now has a coherent runtime model instead of multiple partially overlapping ones.

### Added

- **Harness runtime foundation**: added a transport-agnostic harness layer with durable sessions, traces, artifacts, and checkpoints under `.context/harness`
  - New runtime state service for persistent execution state shared by CLI, workflow, and MCP adapters
  - Session quality snapshots with backpressure evaluation and task completion checks

- **Current tool-surface support in sync/export flows**
  - Added primary-surface support for `GEMINI.md` exports/imports for Gemini CLI
  - Added GitHub Copilot skill export/import support via `.github/skills`
  - Added Windsurf skill export/import support via `.windsurf/skills`
  - Added support for GitHub Copilot agent filename compatibility using `.agent.md`
  - Added support for per-tool agent filename suffixes and per-tool rules file extensions in the unified tool registry

- **Bootstrap policy scaffolding**: `context init` now also materializes a project-local harness policy document
  - Repositories now start with explicit `.context/harness/policy.json` instead of relying on implicit runtime defaults
  - Bootstrap readiness now distinguishes configuration readiness from runtime readiness

- **Harness quality controls**: added first-class sensors, backpressure policies, task contracts, and handoff contracts
  - Sensors can persist execution evidence and block completion when critical checks fail
  - Task contracts now define required sensors, artifacts, outputs, and acceptance criteria
  - Handoff contracts provide explicit evidence and artifact tracking between agent roles

- **Replay and dataset MVP**: added replayable harness sessions and failure dataset generation
  - Durable session replay with ordered event logs across traces, artifacts, checkpoints, sensors, tasks, and handoffs
  - Failure dataset builder with repeated-signature clustering for sensor, task, session, and trace failures

- **Harness policy engine**: added persistent policy documents and rule-based runtime authorization
  - Policy rules can target `tool`, `action`, `path`, and `risk`
  - Support for `allow`, `deny`, and `require_approval` effects
  - MCP harness gateway now supports `getPolicy`, `setPolicy`, `resetPolicy`, `registerPolicy`, `listPolicies`, and `evaluatePolicy`

- **Package productization workflow**: added local packaging, smoke validation, and release preparation for split package distribution
  - `build:packages` prepares bundle outputs for `cli`, `harness`, and `mcp`
  - `smoke:packages` validates generated bundle manifests and exports
  - `release:packages:patch|minor|major` prepares local release directories in `.release/releases/<version>`

### Changed

- **Repositioned generated Q&A as an optional helper layer instead of a default context path**
  - `context init` no longer enables `generateQA` by default
  - MCP and README descriptions now emphasize semantic context and snapshots as the primary codebase-understanding surface
  - `searchQA` is documented as keyword ranking over generated Q&A helper docs, not embedding-based semantic search

- **Architectural split is now explicit**: the codebase now follows `cli -> harness <- mcp`
  - `src/cli` is the operator-facing boundary
  - `src/harness` is the reusable runtime/domain boundary
  - `src/mcp` is the transport adapter boundary

- Updated CLI-facing documentation to reflect current public and hidden command surfaces, including `admin workflow`, `admin skill`, `sync`, `reverse-sync`, and the newer AI-tool context file conventions.

- **Sync/export surfaces updated toward current conventions**
  - Cursor rules directory exports now use `.mdc` files
  - Codex rules now export to `AGENTS.md`, while still importing legacy `.codex/instructions.md`
  - Google Antigravity now exports to `.agents/rules` and `.agents/workflows` while continuing to import legacy `.agent/*` layouts
  - Quick sync defaults and prompts now reflect the newer rules/skills target set for GitHub Copilot, Gemini, Windsurf, Codex, and Antigravity

- **Skill scaffolding now produces stronger source content and cleaner exported skills**
  - Scaffolded `.context/skills/*/SKILL.md` files now start with actionable starter sections (`Workflow`, `Examples`, `Quality Bar`, `Resource Strategy`) instead of near-empty placeholders
  - Built-in skill templates now bias toward concise procedural guidance, progressive disclosure, and trigger language in frontmatter descriptions instead of `When to Use` sections in the body
  - Exported AI-tool skills now use portable frontmatter with only `name` and `description`, improving compatibility with external skill runtimes

- **PREVC workflow state is now harness-native**
  - Canonical workflow state and workflow-to-session binding now live together under `.context/harness/workflows/prevc.json`
  - Legacy workflow-side binding files are treated only as migration inputs and are no longer part of the active runtime model

- **Workflow integration now uses harness runtime controls**
  - PREVC workflow initialization creates and binds harness sessions
  - Workflow advance can be blocked by harness completion checks
  - Workflow management records artifacts, checkpoints, tasks, handoffs, and sensor runs through the harness runtime

- **Failure dataset generation is now canonical and side-effect free**
  - Failure datasets are generated exclusively through `datasetService`
  - Replay generation for datasets no longer persists replay artifacts as a side effect

- **Package root is now library-safe**
  - The package root export now points at the CLI boundary instead of the process-bootstrapping entrypoint
  - MCP shutdown handling was centralized to avoid duplicate signal handlers and race conditions during server stop

- **MCP package surface is now explicit**
  - Preferred MCP installation now uses `npx @dotcontext/mcp install`
  - Generated AI-tool configs now start the server from `@dotcontext/mcp` instead of routing through the CLI package
  - The dedicated MCP package now supports both `install` and default server startup flows

- **MCP gateway surface expanded**
  - Added explicit harness operations for replay, dataset building, and policy document management
  - Harness-related gateway handlers are thinner and delegate to transport-agnostic services

- **Removed dormant standalone AI SDK internals**
  - Removed the unused `src/services/ai` runtime, provider auto-detection, and the old standalone provider dependency path
  - Moved the active scaffolding and explore helpers into `src/services/harness/contextTools.ts` to keep reusable execution logic inside the harness boundary
  - Kept semantic analysis centered on the active `tree-sitter` and optional LSP pipeline instead of bundling unused provider SDK dependencies

### Fixed

- **Policy enforcement consistency**
  - Aligned workflow and MCP policy handling around a single harness policy model
  - Fixed policy document operations through the MCP harness gateway
  - Sensor execution now goes through harness policy authorization
  - MCP `evaluatePolicy` now maps target/action/path/approval inputs correctly

- **Sync/export metrics and auditability**
  - `SyncService.run()` now returns aggregate results instead of only printing UI output
  - `ContextExportService` now reports the real number of exported agent files instead of a placeholder count
  - `ReverseQuickSyncService` now uses real import results for rules and agents instead of detection counts

- **Reverse-sync signal quality**
  - Skill detection now imports only canonical `SKILL.md` files instead of treating any markdown file under skill directories as a skill
  - Agent import normalizes `.agent.md` filenames back into canonical `.context/agents/*.md`
  - Rules imported from non-markdown sources now normalize to `.md` targets in `.context/docs`
  - Skill merge mode now avoids re-appending identical imported content

- **Skill fill/export consistency**
  - Skill refill detection now respects scaffold `status: unfilled` metadata instead of weak placeholder/size heuristics
  - Exporting built-in skills now falls back to the stronger canonical template body when a scaffolded source file still has no meaningful body content

- **Packaging validation coverage**
  - Added smoke checks for generated `cli`, `harness`, and `mcp` package bundles before local release preparation

- **Workflow-plan approval drift**
  - `workflow-manage approvePlan` now persists approval metadata into workflow plan tracking instead of mutating transient in-memory refs
  - Re-linking an already approved plan now preserves approval metadata

- **Headless MCP installation**
  - `mcp:install` no longer no-ops in non-interactive contexts when no installed tools are detected
  - Headless installs now fall back deterministically to supported tool targets

- **MCP execution logging**
  - MCP activity now resolves workflow session binding through canonical harness state before appending traces
  - Logging falls back cleanly when stale workflow bindings point at missing sessions

### Technical Details

#### New Files
- `src/services/harness/policyService.ts` — persistent harness policy engine and authorization rules
- `src/services/harness/replayService.ts` — durable replay generation for harness sessions
- `src/services/harness/datasetService.ts` — failure dataset and cluster generation
- `src/services/harness/policyService.test.ts` — policy engine tests
- `src/services/harness/replayService.test.ts` — replay service tests
- `src/services/harness/datasetService.test.ts` — dataset service tests
- `scripts/smoke-package-bundles.js` — package smoke validation for generated bundles
- `scripts/release-packages.js` — local release preparation for split package outputs

#### Modified Files
- `src/index.ts` — consumes explicit CLI/MCP boundaries instead of deep service imports
- `src/cli/index.ts` — operator-facing boundary exports
- `src/harness/index.ts` — reusable harness boundary exports
- `src/mcp/index.ts` — MCP transport boundary exports
- `src/services/workflow/workflowService.ts` — workflow-to-harness session binding and completion enforcement
- `src/services/mcp/gateway/harness.ts` — harness runtime, replay, dataset, and policy operations
- `src/services/mcp/mcpServer.ts` — expanded harness tool schema
- `package.json` — added split exports and packaging/release scripts

## [0.8.0] - 2026-03-21

### Changed
- **BREAKING: Renamed package from `@ai-coders/context` to `@dotcontext/cli`**
  - CLI command changed from `ai-context` to `dotcontext`
  - MCP server name changed from `ai-context` to `dotcontext`
  - Why: The previous name caused frequent confusion with Context7 during
    prompt-based installation and search. "context" is too generic in the
    AI/LLM space. The new name "dotcontext" is unique, searchable, and
    directly references the `.context/` directory convention that is the
    core of this tool.
  - Migration: Replace `ai-context` with `dotcontext` in your shell aliases
    and MCP configurations. Re-run `npx dotcontext mcp:install` to
    update all tool integrations.

- **BREAKING: Standalone CLI no longer generates context or plans**
  - Context creation, filling, and refresh are now MCP-only — your AI tool provides the LLM
  - Plan initialization and management moved to MCP tools (`context` and `plan` gateways)
  - The standalone CLI is now focused on workflow management, sync, reverse sync, imports, and MCP setup
  - Migration: Run `npx dotcontext mcp:install` and use your MCP-connected AI tool for context and plan operations

### Added

- **Themed Inquirer Prompts**: Applied custom theme to all interactive prompts via new `themedPrompt.ts` wrappers (`themedSelect`, `themedConfirm`, `themedInput`, `themedPassword`, `themedCheckbox`), replacing raw inquirer calls with consistently styled interactions using the project's two-tone color scheme.

- **"View Pending Files" Option**: When the CLI detects unfilled scaffold files, users can now see which specific files need content before deciding to fill them.

- **Smart Defaults Transparency**: The interactive flow now displays detected project information on startup (e.g., "Detected: TypeScript project, openrouter provider configured") instead of silently using auto-detected values.

- **API Key Format Validation**: Lightweight format checks warn users when an API key doesn't match the expected prefix for a provider (e.g., `sk-` for OpenAI, `sk-ant-` for Anthropic). Non-blocking warnings only.

- **"Back" Navigation in Prompt Flows**: Added escape options in `promptAnalysisOptions()` and `promptLLMConfig()` so users can return to the previous menu instead of being forced through multi-step flows.

- **Comprehensive .context Content**: Rewrote all scaffolding files with project-specific content:
  - 4 documentation guides (project-overview, development-workflow, testing-strategy, tooling)
  - 7 agent playbooks with codebase-specific workflows and file references
  - 10 skill files (repurposed api-design to MCP Tool Design)
  - 3 QA guides (getting-started, project-structure, error-handling)
  - 1 development plan (simplify-interactive-cli)

- **Skills System**: Full skill scaffolding exported to `.claude/skills/`, `.gemini/skills/`, `.codex/skills/`

- **Multi-tool Context Export**: Context now syncs to Claude Code, Cursor, GitHub Copilot, Codex, Windsurf, and Gemini

- **Codex MCP Install Support**: `mcp:install` now supports Codex CLI directly
  - Writes MCP configuration to `.codex/config.toml`
  - Uses the documented `[mcp_servers.dotcontext]` TOML configuration block
  - Brings Codex in line with other first-class MCP install targets

- **GitIgnore Integration in FileMapper**: Automatic `.gitignore` respect prevents stack overflow in large repositories
  - New `GitIgnoreManager` class with spec-compliant `.gitignore` parsing via `ignore` npm package
  - O(1) cached lookups with hierarchical `.gitignore` loading from repo root
  - Graceful fallback to existing hardcoded excludes when no `.gitignore` found
  - Integrated into `FileMapper.getRepoStructure()` before glob scanning

- **Path Traversal Protection for MCP Server**: Security hardening for all file operations
  - New `PathValidator` class with null byte, URL-encoding, and traversal detection
  - `SecurityError` class with forensics metadata (attempted path, attack type)
  - Validates `filePath`, `rootPath`, and `cwd` params in `wrapWithActionLogging()` before tool execution

- **Semantic Context Cache**: In-memory caching for `SemanticContextBuilder` output
  - TTL-based expiration (default 5 minutes) with directory mtime invalidation
  - Per-repo and global invalidation methods
  - Integrated into MCP `registerResources()` context handler

- **CLI Modular Architecture**: Extracted command groups from monolithic `index.ts`
  - New `CLIDependencies` interface for dependency injection
  - Skill commands (5 subcommands) extracted to `src/cli/commands/skillCommands.ts`
  - Workflow commands (6 subcommands) extracted to `src/cli/commands/workflowCommands.ts`
  - `index.ts` reduced from 2818 to 2478 lines

### Fixed

- **`needsFill()` false positives**: Fixed bug where `needsFill()` matched `status: unfilled` in document body content (e.g., code examples in agent playbooks) instead of only checking the YAML frontmatter block. The function now parses only the frontmatter between `---` delimiters.

- **`configSummary` i18n**: `displayConfigSummary()` now uses the `_t()` translation function instead of hardcoded English labels ("Config:", "Options:", "Yes", "No").

- **Missing i18n key**: Added `agent.type.skill` translation key (en + pt-BR) that was referenced but undefined.

- **Guide Consistency**: Updated the user guide to match the real CLI surface
  - Clarifies that quick sync still exists in the interactive CLI
  - Removes the mismatch where Codex was described as an MCP install target before it was actually supported

- **Frontmatter-Safe Fill Pipeline**: 100% preservation of YAML frontmatter during fill operations
  - `needsFill()` now reads 15 lines (was 3) to detect `status:` in v2 scaffold format
  - `processTarget()` and `processTargetWithAgent()` now preserve frontmatter with `status: filled` update
  - `collectTargets()` filters by `needsFill()` with `--force` override to prevent re-filling
  - Added `force` option to `FillCommandFlags` and `ResolvedFillOptions`

### Security

- Path traversal attacks via `../`, URL encoding (`%2e%2e`), and null bytes now blocked in MCP tool handlers
- Audit logging for security events with forensics metadata

### Performance

- Context generation 80-95% faster for unchanged files via semantic caching
- Eliminated stack overflow crashes in repositories with large unignored directories

### Technical Details

#### New Files
- `src/utils/gitignoreManager.ts` — GitIgnoreManager with hierarchical `.gitignore` loading
- `src/utils/gitignoreManager.test.ts` — 18 tests
- `src/utils/pathSecurity.ts` — PathValidator with comprehensive sanitization
- `src/utils/pathSecurity.test.ts` — 18 tests
- `src/services/semantic/contextCache.ts` — In-memory TTL cache with mtime invalidation
- `src/services/semantic/contextCache.test.ts` — 13 tests
- `src/cli/types.ts` — CLIDependencies interface
- `src/cli/commands/index.ts` — Barrel export
- `src/cli/commands/skillCommands.ts` — Extracted skill subcommands
- `src/cli/commands/workflowCommands.ts` — Extracted workflow subcommands
- `src/tests/integrity/postRefactoringIntegrity.test.ts` — 26 integration tests

#### Modified Files
- `src/utils/fileMapper.ts` — GitIgnoreManager integration
- `src/utils/frontMatter.ts` — `needsFill()` increased to 15 lines
- `src/services/fill/fillService.ts` — Frontmatter preservation, `force` option, `needsFill` filtering
- `src/services/mcp/mcpServer.ts` — PathValidator + ContextCache integration
- `src/index.ts` — Replaced inline skill/workflow commands with modular imports
- `package.json` — Added `ignore` dependency

### Removed

- **Irrelevant QA docs**: Removed `api-endpoints.md` (no REST API), `deployment.md` (npm package, not deployed service), and `testing.md` (redundant with `testing-strategy.md`).

### Acknowledgements

Special thanks to [@LorranHippolyte](https://github.com/LorranHippolyte) and [@jeansassi](https://github.com/jeansassi) for their massive contributions through pull requests.

## [0.7.1]

### Included Pull Requests

- [#31](https://github.com/vinilana/dotcontext/pull/31) - fix: exclude venv from semantic analysis
  - Excludes `venv/` and `.venv/` from semantic analysis by default to avoid noisy Python environment paths.
  - Persists user-defined `exclude` patterns during `init`, so `fillSingle` uses project-specific exclusions.
  - Aligns semantic analysis to shared default exclude patterns for consistent behavior across tools.
- [#23](https://github.com/vinilana/dotcontext/pull/23) - [Fix] Auto-fill files without LLMs
  - Adds project-type-aware filtering so generated scaffolding better matches CLI, web, backend, and other stacks.
  - Introduces static `defaultContent` across docs, agents, and skills, enabling usable output without LLM enhancement.
  - Replaces placeholder scaffold content with practical starter templates.

### Added

- **Project Type Filtering in InitService**: Scaffolds are now automatically filtered based on detected project type
  - Uses `StackDetector` and `classifyProject` to determine project type (cli, web-frontend, web-backend, full-stack, mobile, library, monorepo, desktop)
  - Passes `filteredDocs` and `filteredAgents` to generators based on project classification
  - CLI projects get core scaffolds only; web projects get additional architecture, security, and specialist agents
  - Graceful fallback to all scaffolds if classification fails

- **Static Default Content for Scaffolds**: All scaffolds now include useful template content out-of-the-box
  - New `defaultContent` field in `ScaffoldSection` type provides static content when not autoFilled
  - Serialization uses `defaultContent` directly instead of placeholder text ("_Content to be added._")
  - Works immediately without requiring LLM enhancement or semantic analysis

- **Agent Playbook Default Content**: All 14 agent playbooks now include comprehensive static content
  - **Mission** — Clear description of agent purpose and when to engage
  - **Responsibilities** — Concrete list of tasks the agent handles
  - **Best Practices** — Guidelines for effective agent operation
  - **Collaboration Checklist** — Step-by-step workflow with checkboxes
  - Agents: code-reviewer, bug-fixer, feature-developer, refactoring-specialist, test-writer, documentation-writer, performance-optimizer, security-auditor, backend-specialist, frontend-specialist, architect-specialist, devops-specialist, database-specialist, mobile-specialist

- **Documentation Default Content**: 8 core documentation templates now include useful starter content
  - **project-overview.md** — Quick facts, entry points, technology stack, getting started checklist
  - **development-workflow.md** — Branching model, local development commands, code review expectations
  - **testing-strategy.md** — Test types, running tests, quality gates, troubleshooting
  - **architecture.md** — System overview, layers, patterns table, diagrams placeholder
  - **tooling.md** — Required tools, automation commands, IDE setup recommendations
  - **security.md** — Authentication, secrets management, compliance checklist
  - **glossary.md** — Type definitions, enums, core terms, acronyms table
  - **data-flow.md** — Module dependencies, service layer, high-level flow diagram

- **Skill Default Content**: All 10 built-in skills now include comprehensive static content
  - **When to Use** — Clear activation triggers for each skill
  - **Instructions** — Step-by-step execution guide
  - **Examples** — Concrete, copy-pasteable examples
  - **Guidelines** — Best practices for effective use
  - Skills: commit-message, pr-review, code-review, test-generation, documentation, refactoring, bug-investigation, feature-breakdown, api-design, security-audit

### Changed

- **Scaffold Generation**: Scaffolds now generate with useful content instead of empty placeholders
  - Previously: `_Content to be added._` with guidance comments
  - Now: Practical template content that works for any project type
  - AutoFill still enhances with project-specific content when semantic analysis is available

### Fixed

- **Exclude Python virtual environments from semantic analysis by default**
  - Added `venv/` and `.venv/` to default exclude patterns
  - Unified `SemanticContextBuilder` to use shared default exclude patterns
  - Persisted user-provided `exclude` patterns from `init` into `.context/config.json` so `fillSingle` respects them

### Technical Details

#### Modified Files
- `src/services/init/initService.ts` — Added project type detection and scaffold filtering
- `src/generators/shared/structures/types.ts` — Added `defaultContent` field to `ScaffoldSection`
- `src/generators/shared/structures/serialization.ts` — Updated to use `defaultContent` when available
- `src/generators/shared/structures/agents/factory.ts` — Added `AgentDefaultContent` interface and section mapping
- `src/generators/shared/structures/agents/definitions.ts` — Added default content for all 14 agents
- `src/generators/shared/structures/skills/factory.ts` — Added `SkillDefaultContent` interface and section mapping
- `src/generators/shared/structures/skills/definitions.ts` — Added default content for all 10 skills
- `src/generators/shared/structures/documentation/projectOverview.ts` — Added default content
- `src/generators/shared/structures/documentation/workflow.ts` — Added default content
- `src/generators/shared/structures/documentation/testing.ts` — Added default content
- `src/generators/shared/structures/documentation/architecture.ts` — Added default content
- `src/generators/shared/structures/documentation/tooling.ts` — Added default content
- `src/generators/shared/structures/documentation/security.ts` — Added default content
- `src/generators/shared/structures/documentation/glossary.ts` — Added default content
- `src/generators/shared/structures/documentation/dataFlow.ts` — Added default content
- `src/services/semantic/types.ts` — Added `venv/` and `.venv/` to default exclude patterns
- `src/services/semantic/contextBuilder.ts` — Uses shared default exclude patterns in semantic analysis
- `src/services/ai/tools/initializeContextTool.ts` — Persists user exclude patterns in `.context/config.json`
- `src/services/ai/tools/fillScaffoldingTool.ts` — Applies persisted exclude patterns during `fillSingle`

## [0.7.0]

### Added

- **Interactive Mode Environment Prompt**: Ask user before loading `.env` file in interactive mode
  - Prompts "Load environment variables from .env file?" at startup
  - Default is No for explicit/secure approach
  - Command-line mode still loads `.env` automatically (no change)
  - MCP mode continues to skip `.env` loading (existing behavior)

- **MCP Install Command**: New `mcp:install` CLI command for easy MCP server configuration
  - Automatically configures ai-context MCP server in AI tools (Claude Code, Cursor, Windsurf, Cline, Continue.dev)
  - Interactive mode with tool detection and selection
  - Supports global (home directory) and local (project directory) installation
  - Merges with existing MCP configurations without overwriting
  - Dry-run mode for previewing changes
  - Bilingual support (English and Portuguese)

- **Gateway Tools Consolidation**: Unified MCP tools into 9 focused tools (5 gateways + 4 dedicated workflow tools)
  - `explore` - File and code exploration (read, list, analyze, search, getStructure)
  - `context` - Context scaffolding and semantic context (check, init, fill, fillSingle, listToFill, getMap, buildSemantic, scaffoldPlan)
  - `plan` - Plan management and execution tracking (link, getLinked, getDetails, getForPhase, updatePhase, recordDecision, updateStep, getStatus, syncMarkdown, commitPhase)
  - `agent` - Agent orchestration and discovery (discover, getInfo, orchestrate, getSequence, getDocs, getPhaseDocs, listTypes)
  - `skill` - Skill management (list, getContent, getForPhase, scaffold, export, fill)
  - `sync` - Import/export synchronization (exportRules, exportDocs, exportAgents, exportContext, exportSkills, reverseSync, importDocs, importAgents, importSkills)
  - `workflow-init` - Initialize PREVC workflow (creates .context/workflow/)
  - `workflow-status` - Get current workflow status
  - `workflow-advance` - Advance to next phase
  - `workflow-manage` - Manage handoffs, collaboration, documents, gates
  - Standardized response utilities and shared context across all handlers
  - Improved organization, discoverability, and reduced cognitive load

- **MCP Export Tools**: New granular export tools for docs, agents, and skills
  - `exportDocs` - Export documentation from `.context/docs/` with README indexing mode
  - `exportAgents` - Export agents from `.context/agents/` (symlink by default)
  - `exportContext` - Unified export of docs, agents, and skills in one operation

- **MCP Import Tools**: Individual import tools for each content type
  - `importDocs` - Import documentation from AI tool directories into `.context/docs/`
  - `importAgents` - Import agents from AI tool directories into `.context/agents/`
  - `importSkills` - Import skills from AI tool directories into `.context/skills/`

- **README Index Mode**: New `indexMode` option for docs export
  - `readme` (default) - Export only README.md files as indices
  - `all` - Export all matching files (previous behavior)
  - Cleaner exports that reference documentation indices

- **Content Type Registry**: Extensible registry for future content types
  - `ContentTypeRegistry` in `src/services/shared/contentTypeRegistry.ts`
  - Supports docs, agents, skills, plans
  - Easy addition of new content types (prompts, workflows, etc.)

- **Unified Context Export Service**: Orchestrates export of all content types
  - `ContextExportService` combines docs, agents, and skills export
  - Configurable skip options for each content type
  - Consistent error handling and reporting

- **MCP Response Optimization**: New `skipContentGeneration` option for `initializeContext`
  - Reduces response size from ~10k tokens to ~500 tokens
  - Enables two-phase workflow: scaffold first, fill on-demand
  - Default `true` for MCP to reduce context usage
  - Use `fillSingleFile` or `fillScaffolding` tools to generate content when needed

- **Workflow Gates System**: Comprehensive gate checking for phase transitions
  - `require_plan` gate - Enforces plan creation before P → R transition
  - `require_approval` gate - Requires plan approval before R → E transition
  - Automatic gate settings based on project scale (QUICK, SMALL, MEDIUM, LARGE, ENTERPRISE)
  - Custom error types for gate violations (`WorkflowGateError`)
  - New `getGates` action to check current gate status
  - Unit tests for gate checking logic

- **Workflow Autonomous Mode**: Toggle autonomous execution for AI agents
  - `setAutonomous` action to enable/disable autonomous mode
  - Autonomous mode bypasses certain gates for faster iteration
  - Tracks reason for mode changes in workflow status

- **Execution History Tracking**: Detailed action logging throughout workflow lifecycle
  - `ExecutionHistory` structure tracks all workflow actions
  - Records phase starts, completions, plan linking, step execution
  - `archive_previous` option for workflow initialization (archive vs delete existing)
  - Methods to archive or clear plans and workflows

- **Plan Execution Management**: Step-level tracking and synchronization
  - `updateStep` action for updating individual step status
  - `getStatus` action for retrieving plan execution status
  - `syncMarkdown` action to sync tracking data back to plan markdown files
  - Detailed interfaces for step execution (`StepExecution`) and phase tracking (`PhaseExecution`)

- **Git Integration for Plans**: Commit completed phases directly from MCP
  - `commitPhase` action creates git commits for completed workflow phases
  - Optional co-authoring support with `coAuthor` parameter
  - Configurable staging patterns with `stagePatterns` (default: `.context/**`)
  - Dry-run mode for previewing commits
  - Commit tracking records hash and timestamp for each phase

- **Breadcrumb Logging**: Step-level execution trails for debugging
  - Enhanced `PlanLinker` with breadcrumb trail generation
  - `generateResumeContext` provides step-level context for session resumption
  - Actions tracked: step_started, step_completed, step_skipped
  - Improves AI agent ability to resume interrupted workflows

- **V2 Scaffold System**: New scaffold generation architecture
  - Frontmatter-only files that define structure without content
  - `scaffoldStructure` context passed to AI agents for content generation
  - Centralized scaffold structure definitions in `scaffoldStructures.ts`
  - Supports documentation, agents, and skills scaffolding
  - Improved validation and serialization of scaffold structures
  - Deprecated legacy templates in favor of new system

- **Fill Tool Enhancements**: Better context for content generation
  - `fillSingleFile` and `fillScaffolding` exports from scaffolding tools now include scaffold structure context
  - Semantic context integrated into fill instructions
  - Removed deprecated content generation functions
  - Enhanced error handling and user guidance

- **Q&A Service**: Question and answer generation from codebase (via MCP context gateway)
  - `QAService` for generating and searching Q&A entries
  - `generateQA` action in context gateway creates Q&A files from codebase analysis
  - `searchQA` action for semantic search over generated Q&A
  - Utilizes pre-computed codebase maps when available

- **Topic & Pattern Detection**: Automatic detection of functional patterns (via MCP context gateway)
  - `TopicDetector` identifies capabilities in codebase
  - Detects: authentication, database access, API endpoints, caching, messaging, etc.
  - `detectPatterns` and `getFlow` actions provide pattern analysis
  - Used to generate contextually relevant Q&A and architectural insights

- **Context Metrics Service**: Usage tracking for context tools (via MCP metrics gateway)
  - Tracks context tool usage and file reads
  - Provides insights into pre-computed context effectiveness
  - Guides optimization of codebase map generation
  - Accessible via `metrics` gateway with tracking and reporting actions

- **Enhanced Tool Status**: Improved response structures
  - New `incomplete` status for tracking pending actions
  - `instruction` field with clear next-step guidance
  - `pendingWrites` replaces `requiredActions` for clarity
  - `checklist` field for actionable task lists

- **Scaffold Enhancement Prompt**: Consistent MCP enhancement instructions across all scaffolding operations
  - New `MCP_SCAFFOLD_ENHANCEMENT_PROMPT` constant for standardized AI guidance
  - New `createScaffoldResponse()` helper ensures all scaffold responses include enhancement instructions
  - `_actionRequired`, `_status: "incomplete"`, and `_warning` signals for AI agent awareness
  - `enhancementPrompt` field with clear workflow steps
  - `nextSteps` array with actionable instructions
  - `pendingEnhancement` list of files requiring content
  - Applied to: `context init` and `scaffoldPlan` MCP actions
  - Ensures AI agents always receive instructions to enhance scaffolding via MCP tools

### Changed

- **Context Initialization Simplified**: `.context` folder creation now uses simple path logic instead of complex detection
  - `.context` is created in the specified path or current working directory
  - Cleaner, more predictable behavior without hidden traversal logic
  - Internal complexity reduced from 496 lines to ~20 lines
  - Public APIs remain unchanged - static factory methods (`WorkflowService.create()`, `PlanLinker.create()`) are preserved
  - Backwards compatibility maintained for existing code

- **MCP Action Logging**: Logs every MCP tool invocation to `.context/workflow/actions.jsonl` with sanitized metadata for auditability.

- **Phase Orchestration Skills**: Workflow responses now include recommended skills alongside agent orchestration for each PREVC phase.

- **Workflow Status Serialization**: Omits empty or default sections to keep `status.yaml` minimal and readable.

- **Agents Export Default**: Changed default sync mode from `markdown` to `symlink`
  - Symlinks keep AI tool directories automatically synchronized
  - Changes in `.context/agents/` reflect immediately in target directories

- **MCP Tool Simplification**: Removed project-setup and project-report tools
  - Simplified from 11 tools to 9 tools (5 gateways + 4 dedicated workflow tools)
  - New explicit workflow: `context init` → `fillSingle` → `workflow-init`
  - Project setup functionality now achieved through composable steps
  - Removed `ProjectAction`, `ProjectParams`, `WorkflowAction`, `WorkflowParams` types
  - Enhancement prompts no longer use function call syntax
  - Tool descriptions clarify that workflow-init creates `.context/workflow/` folder
  - Added MCP README.md documentation for simplified tool structure

- **MCP Server Architecture**: Gateway pattern replaces individual tools
  - Single entry point per domain (explore, context, workflow, etc.)
  - Action-based dispatching within each gateway
  - Consistent parameter validation and error handling

- **Scaffold Generation**: Templates now generate structure, not content
  - AI agents receive scaffold structure and fill based on context
  - Better separation of structure definition and content generation

- **Workflow Initialization**: New settings and options
  - `autonomous`, `require_plan`, `require_approval` settings
  - Scale-based default settings for different project sizes
  - `archive_previous` controls handling of existing workflows

### Breaking Changes

- **ENTERPRISE Scale Removed**
  - `ProjectScale.ENTERPRISE` enum value removed (breaking change for TypeScript code)
  - Consolidated into `ProjectScale.LARGE` for simpler mental model
  - Security/compliance keywords now map to LARGE scale instead of ENTERPRISE
  - **Backward compatibility**: Existing `status.yaml` files with `scale: ENTERPRISE` automatically migrate to LARGE
  - **API compatibility**: `getScaleFromName('enterprise')` maps to LARGE for smooth transitions
  - **MCP interface**: `workflow-init` scale parameter no longer accepts 'ENTERPRISE'

- **Context Initialization**
  - `.context` is now created only in the specified path or current working directory

### Fixed

- **Workflow Init Paths**: Correctly resolves `.context` repo paths to ensure `status.yaml` is created in the expected location.
- **Plan Index Initialization**: Ensures `.context/workflow/plans.json` is created when starting a workflow.
- **Export Validation**: Export commands now properly check if source directories exist
  - `exportContext`, `exportDocs`, `exportAgents`, `exportSkills` only export content that actually exists in `.context/`
  - Added `fs.pathExists` checks before processing docs, agents, and skills directories
  - Skills export without `includeBuiltIn` no longer fails silently when `.context/skills/` doesn't exist
  - Prevents misleading success messages when exporting non-existent content

### Technical Details

#### New Files
- `src/services/mcp/gateway/` - Gateway handler modules
  - `explore.ts` - File/code exploration handler
  - `context.ts` - Context management handler
  - `plan.ts` - Plan management handler
  - `agent.ts` - Agent orchestration handler
  - `skill.ts` - Skill management handler
  - `sync.ts` - Sync operations handler
  - `workflowInit.ts` - Workflow initialization handler
  - `workflowStatus.ts` - Workflow status handler
  - `workflowAdvance.ts` - Workflow advance handler
  - `workflowManage.ts` - Workflow management handler
  - `shared.ts` - Shared utilities and response helpers
- `src/services/mcp/README.md` - MCP tools documentation and usage guide
- `src/workflow/gates/gateChecker.ts` - Gate checking logic
- `src/workflow/gates/gateChecker.test.ts` - Gate checker unit tests
- `src/workflow/errors.ts` - Custom workflow error types
- `src/generators/shared/scaffoldStructures.ts` - Centralized scaffold definitions
- `src/services/qa/qaService.ts` - Q&A generation service
- `src/services/qa/topicDetector.ts` - Functional pattern detection
- `src/utils/gitService.ts` - Git operations utility
- `src/types/scaffoldFrontmatter.ts` - Scaffold frontmatter types
- `src/services/mcp/mcpInstallService.ts` - MCP installation service for AI tools
- `src/services/mcp/mcpInstallService.test.ts` - Unit tests for MCP install service
- `src/services/export/contextExportService.ts` - Unified export orchestrator
- `src/services/shared/contentTypeRegistry.ts` - Extensible content type definitions
- `src/services/mcp/gateway/response.ts` - Gateway response helpers and scaffold response builder
- `src/services/mcp/gateway/types.ts` - Gateway action types and parameters
- `src/services/mcp/gateway/index.ts` - Gateway module exports
- `src/services/mcp/gateway/shared.ts` - Shared utilities for gateway handlers
- `src/services/mcp/gateway/metrics.ts` - Context metrics tracking gateway

#### Modified Files
- `src/index.ts` - Interactive mode environment prompt, conditional dotenv loading
- `src/utils/prompts/index.ts` - Added `promptLoadEnv()` function
- `src/utils/i18n.ts` - Added `prompts.env.loadEnv` translations (EN/PT)
- `src/services/mcp/mcpServer.ts` - Gateway integration and new actions
- `src/services/mcp/gateway/context.ts` - Gateway implementation with `init`, `scaffoldPlan` actions, Q&A and pattern detection
- `src/services/ai/tools/scaffoldPlanTool.ts` - Added consistent `status: "incomplete"` pattern and `nextStep` guidance
- `src/prompts/defaults.ts` - Added `MCP_SCAFFOLD_ENHANCEMENT_PROMPT` constant
- `src/workflow/orchestrator.ts` - Gate checking and execution history
- `src/workflow/status/statusManager.ts` - Execution tracking and settings
- `src/workflow/plans/planLinker.ts` - Step tracking and commit support
- `src/services/ai/tools/fillScaffoldingTool.ts` - Scaffold structure integration, exports both `fillScaffoldingTool` and `fillSingleFileTool`
- `src/services/ai/schemas.ts` - New action schemas and parameters
- `src/generators/documentation/documentationGenerator.ts` - V2 scaffold support
- `src/generators/agents/agentGenerator.ts` - V2 scaffold support
- `src/generators/skills/skillGenerator.ts` - V2 scaffold support
- `src/index.ts` - Added `mcp:install` CLI command with interactive mode
- `src/services/mcp/index.ts` - Exported MCPInstallService
- `src/utils/i18n.ts` - Added translations for mcp:install command (EN + PT-BR)
- `src/services/export/exportRulesService.ts` - Added `indexMode` option and source path validation
- `src/services/export/skillExportService.ts` - Added skills directory existence check
- `src/services/export/index.ts` - Export ContextExportService
- `src/services/shared/index.ts` - Export ContentTypeRegistry

## [0.6.2] - 2026-01-16

### Added

- **Google Antigravity Support**: Full bidirectional sync support for Google Antigravity
  - Rules export to `.agent/rules/` directory
  - Agents sync to `.agent/agents/` directory
  - Workflows (skills) export to `.agent/workflows/` directory
  - New `antigravity` preset for export and sync commands
  - MCP tools updated to include `antigravity` preset option

- **Trae AI Support**: Full bidirectional sync support for Trae AI
  - Rules export to `.trae/rules/` directory
  - Agents sync to `.trae/agents/` directory
  - New `trae` preset for export and sync commands
  - MCP tools updated to include `trae` preset option

- **Windsurf Directory Format**: Changed Windsurf rules export from single file to directory format
  - Now exports to `.windsurf/rules/` as multiple markdown files
  - Aligns with Windsurf documentation (12,000 char limit per file)

- **Reverse Quick Sync**: Import rules, agents, and skills from AI tool directories into `.context/`
  - Inverse of Quick Sync - consolidates scattered AI tool configurations into centralized `.context/`
  - New `reverse-sync` CLI command with comprehensive options
  - Interactive mode with component selection and merge strategy prompts
  - Supports 12 AI tools: Claude, Cursor, GitHub Copilot, Windsurf, Cline, Continue, Gemini, Codex, Aider, Zed, Antigravity, Trae

- **Tool Detection**: High-level detection of which AI tools are present in a repository
  - `ToolDetector` class aggregates results from rules, agents, and skills detectors
  - Returns summary grouped by tool with file counts
  - MCP tool: `detectAITools`

- **Skills Detection**: New detector for skills from AI tool directories
  - `SkillsDetector` class scans `.claude/skills/`, `.gemini/skills/`, `.codex/skills/`
  - Parses SKILL.md frontmatter for metadata (name, description, phases, tags)
  - Follows existing AgentsDetector pattern

- **Import Skills Service**: Import skills with merge strategy support
  - `ImportSkillsService` class with four merge strategies: skip, overwrite, merge, rename
  - Adds frontmatter metadata to imported files (source_tool, source_path, imported_at)
  - Preserves skill directory structure during import

- **Merge Strategies**: Flexible conflict handling for imports
  - `skip` - Skip existing files (default)
  - `overwrite` - Replace existing files
  - `merge` - Append content with separator
  - `rename` - Create `{name}-{tool}.md` for conflicts

- **MCP Tools for Reverse Sync**:
  - `detectAITools` - Detect AI tool configurations with summary
  - `reverseQuickSync` - Import from AI tool directories to `.context/`

- **CLI Command**: `npx @ai-coders/context reverse-sync [options]`
  - `--dry-run` - Preview changes without importing
  - `--force` - Overwrite existing files
  - `--skip-agents`, `--skip-skills`, `--skip-rules` - Skip specific components
  - `--merge-strategy <strategy>` - How to handle conflicts
  - `--no-metadata` - Skip frontmatter metadata addition
  - `-v, --verbose` - Verbose output

- **Interactive Menu**: Added "Reverse Sync (import from AI tools)" option
  - Component selection (rules, agents, skills)
  - Merge strategy selection
  - Detection summary display

- **i18n Support**: Full English and Portuguese translations for reverse sync

### Technical Details

#### New Files
- `src/services/reverseSync/types.ts` - Types and interfaces
- `src/services/reverseSync/presets.ts` - SKILL_SOURCES and tool mappings
- `src/services/reverseSync/skillsDetector.ts` - Skills detection
- `src/services/reverseSync/toolDetector.ts` - High-level tool detection
- `src/services/reverseSync/importSkillsService.ts` - Skills import service
- `src/services/reverseSync/reverseQuickSyncService.ts` - Main orchestrator
- `src/services/reverseSync/index.ts` - Module exports

#### Modified Files
- `src/index.ts` - Added `reverse-sync` CLI command and interactive menu option
- `src/services/mcp/mcpServer.ts` - Added `detectAITools` and `reverseQuickSync` MCP tools
- `src/utils/i18n.ts` - Added reverse sync translations (EN/PT)

## [0.6.1] - 2026-01-15

### Added

- **Auto-fill instructions for scaffolding**: MCP scaffolding tools now return detailed fill instructions
  - `initializeContext` returns semantic context and per-file fill instructions when `autoFill=true` (default)
  - `scaffoldPlan` returns fill instructions for the plan template
  - AI agents receive comprehensive prompts to fill each generated file
  - New `fillPrompt` field with complete instructions for all files
  - New `fillInstructions` per file with specific guidance (architecture, data-flow, conventions, etc.)

- **Workflow file path visibility**: `workflowInit` and `workflowStatus` now return file paths
  - `statusFilePath`: Absolute path to `.context/workflow/status.yaml`
  - `contextPath`: Path to the `.context` directory
  - Helps AI agents and users locate workflow state files

- **New `autoFill` parameter**: Added to `initializeContext` and `scaffoldPlan` MCP tools
  - Defaults to `true` - scaffolding tools return semantic context and fill instructions
  - Set to `false` to skip context building and get template-only response

### Changed

- **Scaffolding tool responses**: Now include structured fill instructions instead of generic nextSteps
  - Each generated file includes type-specific fill instructions
  - Semantic context included for codebase-aware content generation
  - Clear action directives for AI agents to fill files

### Fixed

- **MCP `fillSkills` no longer requires API key**: Fixed critical bug where `fillSkills` MCP tool
  incorrectly required an AI API key when called via Claude Code
  - MCP tools now return fill instructions instead of calling LLM services directly
  - API keys are only required for CLI usage, never for MCP
  - Design principle: AI agent (Claude Code) IS the LLM, so MCP tools return context/instructions

### Technical Details

#### Modified Files
- `src/services/ai/schemas.ts` - Added `autoFill` parameter to input schemas
- `src/services/ai/tools/initializeContextTool.ts` - Returns fill instructions and semantic context
- `src/services/ai/tools/scaffoldPlanTool.ts` - Returns fill instructions for plans
- `src/services/ai/tools/fillScaffoldingTool.ts` - Exported helper functions for reuse
- `src/services/ai/tools/index.ts` - Updated exports
- `src/services/mcp/mcpServer.ts` - Fixed `fillSkills` to return fill instructions instead of calling SkillFillService, added `autoFill` to tool schemas, file paths to workflow responses

## [0.6.0] - 2026-01-14

### Added

- **Quick Sync Service**: Unified synchronization of agents, skills, and documentation
  - New `quick-sync` command for one-click export to all AI tools
  - Component selection: choose agents, skills, docs, or all
  - Target selection: export to specific tools or all at once
  - **Selective doc targets**: Choose which rules files to export (cursorrules, CLAUDE.md, AGENTS.md, windsurfrules, clinerules, CONVENTIONS.md)
  - **AGENTS.md universal export**: New preset for tools that support universal agent files
  - CLI: `npx @ai-coders/context quick-sync [--components agents,skills,docs] [--targets claude,cursor]`
  - Interactive mode with per-component target selection (agents, skills, docs separately)

- **getCodebaseMap MCP Tool**: Retrieve structured codebase data
  - Access pre-analyzed codebase information from `.context/docs/codebase-map.json`
  - Sections: `stack`, `structure`, `architecture`, `symbols`, `publicAPI`, `dependencies`, `stats`
  - Token-efficient retrieval with specific section queries
  - Reduces need for repeated codebase analysis

- **Project Type Classification**: Smart filtering for agents and documentation
  - Automatic project type detection (backend, frontend, fullstack, api, library, cli, mobile)
  - Filter agent playbooks based on project type
  - Filter documentation templates based on relevance
  - `scaffoldFilter` service for intelligent scaffolding selection

- **Interactive Mode Enhancements**:
  - Welcome screen with PREVC visual explanation
  - User prompt input on startup
  - Multi-select component options for scaffolding (docs, agents, skills)
  - Target selection with presets for AI tools

- **Front Matter Wrapping**: Enhanced options for generated files
  - Additional front matter options: `wrap`, `template`, `source`
  - Better metadata management for scaffolded files

- **Agent Front Matter Enhancement**: Agent playbooks now include name and description
  - `name` field auto-populated from agent title
  - `description` field auto-populated from first responsibility
  - Improves agent discovery and metadata for AI tools

- **Skills System**: On-demand expertise for AI agents (Claude Code, Gemini CLI, Codex)
  - 10 built-in skills: commit-message, pr-review, code-review, test-generation, documentation, refactoring, bug-investigation, feature-breakdown, api-design, security-audit
  - `SkillRegistry` class for skill discovery and management
  - `SkillGenerator` for scaffolding SKILL.md files
  - `SkillExportService` for exporting to `.claude/skills/`, `.gemini/skills/`, `.codex/skills/`
  - CLI commands: `skill init`, `skill list`, `skill export`, `skill create`, `skill fill`
  - MCP tools: `listSkills`, `getSkillContent`, `getSkillsForPhase`, `scaffoldSkills`, `exportSkills`, `fillSkills`
  - Skills are mapped to PREVC phases for workflow integration

- **Skill Fill Feature**: AI-powered skill personalization
  - `skill fill` CLI command personalizes skills with project-specific content
  - `fillSkills` MCP tool for programmatic skill filling
  - `SkillAgent` - New AI agent for skill personalization (follows PlaybookAgent pattern)
  - `buildSkillContext()` method in SemanticContextBuilder for skill-specific context
  - Uses docs and agents context for richer personalization
  - Semantic analysis mode for token-efficient generation
  - i18n support for English and Portuguese

- **Plan-Workflow Integration**: Link plans to PREVC workflow phases
  - `PlanLinker` class for managing plan-workflow relationships
  - Plans now include PREVC phase mapping in frontmatter
  - Track plan status, decisions, and risks per workflow phase
  - MCP tools: `linkPlan`, `getLinkedPlans`, `getPlanDetails`, `getPlansForPhase`, `updatePlanPhase`, `recordDecision`

- **Agent Lineup in Plans**: Plans now include recommended agents in frontmatter
  - AI agents can discover which agents to use for each plan step
  - `AgentLineupEntry` type with phase mapping
  - Frontmatter parsing extracts agent lineup automatically

- **Custom Agent Discovery**: Support for custom agent playbooks
  - Discover agents from `.context/agents/` directory
  - Support for both built-in and custom agents (e.g., `marketing-agent.md`)
  - MCP tools: `discoverAgents`, `getAgentInfo`

- **Centralized Agent Registry**: Single source of truth for agent management
  - `AgentRegistry` class with caching and metadata retrieval
  - `BUILT_IN_AGENTS` constant with type-safe agent types
  - `isBuiltInAgent()` helper for validation
  - Exported from `workflow/agents` module

- **New MCP Tools for Plan Management**:
  - `linkPlan` - Link a plan file to the current workflow
  - `getLinkedPlans` - Get all linked plans for current workflow
  - `getPlanDetails` - Get detailed information about a linked plan
  - `getPlansForPhase` - Get plans relevant to a PREVC phase
  - `updatePlanPhase` - Update plan phase status
  - `recordDecision` - Record a decision for a plan
  - `discoverAgents` - Discover all available agents (built-in + custom)
  - `getAgentInfo` - Get metadata for a specific agent

### Changed

- **UI/UX Minimalist**: Removed emoticons from all UI components
  - Report service uses text indicators: `[x]`, `[>]`, `[ ]`, `[-]`
  - Menu choices use simple text without emoji prefixes
  - Cleaner, more professional interface

- **PlanLinker Refactored**: Now delegates agent operations to AgentRegistry (SRP)

### Fixed

- **Orphaned Spinners**: Fixed CLI spinners not stopping properly in certain conditions
  - Prevents visual artifacts when operations complete or fail

- **Skills Path Construction**: Fixed Quick Sync creating incorrect folder paths for skills
  - Now uses absolute paths consistent with agents sync behavior
  - Skills correctly exported to `.claude/skills/`, `.gemini/skills/`, etc.

### Technical Details

#### New Files
- `src/services/quickSync/quickSyncService.ts` - Quick Sync service for unified synchronization
- `src/services/quickSync/index.ts` - Quick Sync module exports
- `src/services/ai/tools/getCodebaseMapTool.ts` - MCP tool for codebase map retrieval
- `src/services/stack/projectTypeClassifier.ts` - Project type classification service
- `src/services/stack/scaffoldFilter.ts` - Intelligent scaffold filtering
- `src/generators/documentation/codebaseMapGenerator.ts` - Codebase map generation
- `src/services/ai/agents/skillAgent.ts` - AI agent for skill personalization
- `src/services/fill/skillFillService.ts` - Service orchestrating skill fill operations
- `src/workflow/plans/types.ts` - Plan-workflow integration types
- `src/workflow/plans/planLinker.ts` - Plan-workflow linking service
- `src/workflow/plans/index.ts` - Plans module exports
- `src/workflow/agents/agentRegistry.ts` - Centralized agent registry
- `src/workflow/agents/index.ts` - Agents module exports

#### Modified Files
- `src/services/semantic/contextBuilder.ts` - Added `buildSkillContext()` method
- `src/services/ai/prompts/sharedPrompts.ts` - Added `getSkillAgentPrompt()`
- `src/services/ai/agentEvents.ts` - Added 'skill' to AgentType
- `src/services/mcp/mcpServer.ts` - Added `fillSkills` MCP tool
- `src/utils/i18n.ts` - Added skill fill translations (EN/PT)

#### New Exports from `workflow` module
```typescript
// Plan Integration
export { PlanLinker, createPlanLinker, PlanReference, LinkedPlan, ... } from './plans';

// Agent Registry
export { BUILT_IN_AGENTS, AgentRegistry, createAgentRegistry, ... } from './agents';
```

## [0.5.2] - 2026-01-09

### Fixed

- **Dotenv configuration handling**: Updated dotenv configuration to respect command-line arguments
  - MCP server now skips loading `.env` file when `--skip-dotenv` flag is passed
  - Prevents environment variable conflicts when running as MCP server
  - Fix MCP to work in Antigravity and Codex

## [0.5.1] - 2026-01-09

### Added

- **Update command**: New `update` command for selective documentation updates
  - Target specific files or sections without regenerating everything
  - Supports `--files` flag to update specific documentation files
  - Preserves manual edits in other files

- **StateDetector service**: Wizard-based project state detection
  - Automatically detects scaffolding completeness (docs, agents, plans)
  - Parses YAML front matter for instant status detection
  - Provides actionable recommendations based on project state

- **YAML front matter utilities**: Instant status detection for generated files
  - `parseFrontMatter()` - Extract metadata from markdown files
  - `updateFrontMatter()` - Update metadata while preserving content
  - `hasFrontMatter()` - Quick check for front matter presence
  - Status tracking: `generated`, `filled`, `customized`

- **Documentation guides**: Extracted detailed guides from README
  - `docs/GUIDE.md` - Comprehensive usage guide
  - `docs/MCP.md` - MCP server setup and configuration
  - `docs/PROVIDERS.md` - Multi-provider configuration guide

- **New MCP tools for incremental scaffolding**: Avoid output size limits
  - `listFilesToFill` - Returns only file paths (~1KB response) for efficient listing
  - `fillSingleFile` - Process one scaffold file at a time (~10KB per file)
  - MCP server now exposes 12 tools (up from 10)

- **Tests for new utilities**:
  - `frontMatter.test.ts` - 12 tests for YAML front matter parsing/updating
  - `stateDetector.test.ts` - 8 tests for project state detection

### Changed

- **Simplified README**: Streamlined to essentials with links to detailed guides
- **Interactive mode improvements**:
  - Menu reordered to prioritize plan creation over docs update
  - Plan creation now asks for goal/summary instead of just name
- **Quick setup fix**: Uses correct `both` value instead of `all` for scaffold type
- **fillScaffolding pagination**: Added `offset` and `limit` parameters (default: 3 files)
  - Prevents output size errors for large projects
  - Returns `pagination.hasMore` to indicate remaining files
- **Centralized tool descriptions**: Single source of truth for MCP and AI SDK
  - New `toolRegistry.ts` with all tool descriptions
  - MCP server uses `getToolDescription()` instead of inline strings
- **Shared agent prompts**: Eliminated redundancy across agents
  - New `prompts/sharedPrompts.ts` with common prompt components
  - `getDocumentationAgentPrompt()`, `getPlaybookAgentPrompt()`, `getPlanAgentPrompt()`
  - Agents now import prompts instead of defining inline

### Removed

- **Direct OpenRouter client**: Removed `OpenRouterClient` class and `OpenRouterConfig` type
  - OpenRouter is now used exclusively through AI SDK via OpenAI-compatible provider
  - Simplifies provider architecture with single unified approach

### Technical Details

#### New Files
- `src/services/state/stateDetector.ts` - StateDetector service
- `src/services/state/stateDetector.test.ts` - StateDetector tests
- `src/services/update/updateService.ts` - Update command service
- `src/utils/frontMatter.ts` - YAML front matter utilities
- `src/utils/frontMatter.test.ts` - Front matter tests
- `src/services/ai/toolRegistry.ts` - Centralized tool descriptions
- `src/services/ai/prompts/sharedPrompts.ts` - Shared agent system prompts
- `src/services/ai/prompts/index.ts` - Prompts barrel export
- `docs/GUIDE.md` - Usage guide
- `docs/MCP.md` - MCP documentation
- `docs/PROVIDERS.md` - Provider configuration

#### Removed Files
- `src/services/openRouterClient.ts` - Legacy direct OpenRouter client

## [0.5.0] - 2026-01-08

### Added

- **MCP Server**: New `mcp` command for Claude Code integration via Model Context Protocol
  - Exposes 10 code analysis tools: `readFile`, `listFiles`, `analyzeSymbols`, `getFileStructure`, `searchCode`, `buildSemanticContext`, `checkScaffolding`, `initializeContext`, `fillScaffolding`, `scaffoldPlan`
  - Exposes 2 resource templates: `context://codebase/{contextType}` for semantic context, `file://{path}` for file contents
  - Uses stdio transport for seamless Claude Code integration
  - Configure in `~/.claude/settings.json` with `npx @ai-coders/context mcp`

- **MCP Scaffolding Tools**: New tools for AI agents to manage `.context` scaffolding
  - `checkScaffolding` - Check if scaffolding exists with granular status (docs, agents, plans separately)
  - `initializeContext` - Initialize `.context` scaffolding with template files
  - `fillScaffolding` - Analyze codebase and generate content for each template (AI agent writes the suggestedContent to each file)
  - `scaffoldPlan` - Create plan templates in `.context/plans/` with optional semantic analysis

- **Passthrough Server**: New `serve` command for external AI agent integration
  - JSON-RPC style communication via stdin/stdout
  - Supports methods: `capabilities`, `tool.list`, `tool.call`, `context.build`, `agent.run`
  - Real-time notifications for progress, tool calls, and results
  - Protocol types with Zod validation for type safety
  - Enables any AI agent to use code analysis tools without MCP support

- **Agent sync command**: New `sync-agents` command to sync agent playbooks to AI tool directories
  - Syncs from `.context/agents/` (source of truth) to tool-specific directories
  - Built-in presets: `claude` (.claude/agents), `github` (.github/agents), `cursor` (.cursor/agents)
  - Two sync modes: `symlink` (default, uses relative symlinks) and `markdown` (generates reference files)
  - Custom target support via `--target` flag for any AI tool directory
  - `--dry-run` to preview changes, `--force` to overwrite existing files
  - Cross-platform: Windows fallback (file copy) when symlinks require elevated permissions
  - Full i18n support (English and Portuguese)

- **Interactive sync flow**: Added "Sync agents to AI tools" option to interactive mode
  - Prompts for source directory, sync mode, target selection, and options
  - Supports preset selection or custom path input

- **Multi-provider AI support**: Added support for OpenAI, Anthropic, Google, and OpenRouter providers
  - New `--provider` flag for `fill` and `plan` commands
  - Auto-detection of available API keys from environment variables
  - Provider-specific model defaults (e.g., `gpt-5.2` for OpenAI, `claude-sonnet-4.5` for Anthropic)

- **Semantic context mode**: Token-efficient LLM calls using pre-computed Tree-sitter analysis
  - Enabled by default for faster, more consistent documentation generation
  - New `--no-semantic` flag to disable and use tool-based exploration instead
  - New `--languages` flag to specify programming languages for analysis
  - Supports: TypeScript, JavaScript, Python, Go, Rust, Java, C++, C#, Ruby, PHP

- **Real-time agent progress display**: Visual feedback during LLM operations
  - Shows which agent is currently working (DocumentationAgent, PlaybookAgent, PlanAgent)
  - Displays tool calls and their results in real-time
  - Progress indicators for multi-step operations

- **SemanticContextBuilder**: New service for generating optimized context strings
  - `buildDocumentationContext()` - Context for documentation generation
  - `buildPlaybookContext()` - Context for agent playbook generation
  - `buildPlanContext()` - Context for development plan generation
  - Caches analysis results for efficiency

- **LSP integration for semantic analysis**: Optional deep semantic analysis via Language Server Protocol
  - New `--lsp` flag for `fill` command to enable LSP-enhanced analysis
  - Enabled by default for `plan fill` (use `--no-lsp` to disable)
  - Adds type information, implementations, and references to symbol analysis
  - Supports TypeScript, JavaScript, Python, Go, and Rust language servers
  - Graceful fallback when LSP servers are unavailable

- **CodebaseAnalyzer**: New orchestrator for hybrid Tree-sitter + LSP analysis
  - Combines fast syntactic analysis with deep semantic understanding
  - Architecture layer detection (Services, Controllers, Models, Utils, etc.)
  - Design pattern detection (Factory, Repository, Service Layer, Observer, etc.)
  - Entry point and public API identification
  - Dependency graph construction

- **Unit tests for services**: Comprehensive test coverage for core services
  - `PlanService` tests (13 tests) - scaffolding, plan fill, error handling, LSP options
  - `FillService` tests (17 tests) - directory validation, agent processing, options handling
  - `CodebaseAnalyzer` tests (24 tests) - LSP integration, architecture detection, pattern detection

- **Agent event callback system**: Infrastructure for tracking agent progress
  - `onAgentStart`, `onAgentStep`, `onToolCall`, `onToolResult`, `onAgentComplete` callbacks
  - Integrated with CLI UI for real-time display

- **Interactive mode enhancements**:
  - Language selection for semantic analysis (checkbox interface)
  - Semantic mode toggle (defaults to enabled)
  - Provider and model selection

### Changed

- **AI SDK integration**: Replaced axios-based OpenRouter client with Vercel AI SDK
  - Enables tool-based agent workflows with `generateText` and `maxSteps`
  - Structured outputs with Zod schemas
  - Better error handling and streaming support

- **FillService refactored**: Now uses specialized agents instead of basic LLM client
  - `DocumentationAgent` for docs/*.md files
  - `PlaybookAgent` for agents/*.md files
  - Agents support both semantic and tool-based modes

- **PlanService refactored**: Uses `PlanAgent` with tool support
  - Better context gathering for plan generation
  - Support for referenced docs and agents

- **Default behavior**: Semantic context mode is now the default
  - More token-efficient out of the box
  - Use `--no-semantic` for thorough tool-based exploration

### Removed

- **axios dependency**: Replaced with Vercel AI SDK for HTTP requests
- **OpenRouterClient**: Replaced with `AISdkClient` supporting multiple providers

### Technical Details

#### New Dependencies
- `ai` - Vercel AI SDK core
- `@ai-sdk/openai` - OpenAI provider
- `@ai-sdk/anthropic` - Anthropic provider
- `@ai-sdk/google` - Google provider
- `@ai-sdk/openrouter` - OpenRouter provider
- `zod` - Schema validation for structured outputs
- `@modelcontextprotocol/sdk` - MCP server SDK for Claude Code integration

#### New Files
- `src/services/sync/` - Agent sync service module
  - `types.ts` - Type definitions (SyncMode, PresetName, SyncOptions, etc.)
  - `presets.ts` - Built-in target presets (claude, github, cursor)
  - `symlinkHandler.ts` - Cross-platform symlink creation
  - `markdownReferenceHandler.ts` - Markdown reference file generation
  - `syncService.ts` - Main sync orchestrator
  - `index.ts` - Barrel export
- `src/services/ai/aiSdkClient.ts` - Main AI SDK client
- `src/services/ai/providerFactory.ts` - Provider creation factory
- `src/services/ai/schemas.ts` - Zod schemas for tools and outputs
- `src/services/ai/tools/*.ts` - Code analysis tools (readFile, listFiles, analyzeSymbols, checkScaffolding, initializeContext, scaffoldPlan, etc.)
- `src/services/ai/agents/*.ts` - Specialized agents (DocumentationAgent, PlaybookAgent, PlanAgent)
- `src/services/ai/agentEvents.ts` - Agent event callback types
- `src/services/semantic/contextBuilder.ts` - SemanticContextBuilder for pre-computed context
- `src/services/semantic/codebaseAnalyzer.ts` - Main orchestrator for hybrid analysis
- `src/services/semantic/lsp/lspLayer.ts` - LSP client for semantic queries
- `src/services/semantic/treeSitter/treeSitterLayer.ts` - Tree-sitter based parsing
- `src/services/semantic/types.ts` - Shared types for semantic analysis
- `src/services/plan/planService.test.ts` - PlanService unit tests
- `src/services/fill/fillService.test.ts` - FillService unit tests
- `src/services/semantic/codebaseAnalyzer.test.ts` - CodebaseAnalyzer unit tests
- `src/services/mcp/` - MCP server module
  - `mcpServer.ts` - Main MCP server implementation
  - `mcpServer.test.ts` - MCP server tests
  - `index.ts` - Barrel export
- `src/services/passthrough/` - Passthrough server module
  - `protocol.ts` - JSON-RPC protocol types with Zod schemas
  - `protocol.test.ts` - Protocol tests
  - `stdinReader.ts` - stdin JSON reader with event emitter
  - `commandRouter.ts` - Command routing and tool execution
  - `commandRouter.test.ts` - Router tests
  - `index.ts` - Barrel export
- `src/services/serve/` - Serve command service
  - `serveService.ts` - Main serve service implementation
  - `index.ts` - Barrel export

#### Environment Variables
```bash
# Provider API keys
OPENROUTER_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...

# Model overrides
OPENROUTER_MODEL=x-ai/grok-4.1-fast
OPENAI_MODEL=gpt-5.2
ANTHROPIC_MODEL=claude-sonnet-4.5
GOOGLE_MODEL=gemini-3-flash-preview
```

## [0.4.0] - Previous Release

Initial release with scaffolding capabilities, `init`, `fill`, and `plan` commands.
