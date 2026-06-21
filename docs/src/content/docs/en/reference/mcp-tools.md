---
title: MCP tools reference
description: Complete reference of every dotcontext MCP tool — the consolidated gateway tools and the dedicated PREVC workflow tools, with their actions and key parameters.
sidebar:
  order: 1
---

This page is the exhaustive reference for the tools exposed by the dotcontext MCP server. If you want a practical, prompt-driven walkthrough instead, read [Using dotcontext with MCP](/guides/using-with-mcp/) first — then come back here when you need the exact action or parameter name.

dotcontext keeps its tool surface deliberately small. Instead of dozens of narrow tools, most capabilities are grouped under a handful of **consolidated gateway tools** that take an `action` parameter. A few **dedicated workflow tools** stand on their own because they are called constantly during PREVC.

:::note[Tool naming]
The tools below register under names like `explore`, `context`, `sync`, `plan`, `agent`, `skill`, `harness`, `workflow-init`, `workflow-status`, `workflow-guide`, `workflow-advance`, and `workflow-manage`. Your client may surface them with a server prefix (for example `mcp__dotcontext__explore`). The action names and parameters are identical regardless of the prefix.
:::

## How to read this page

Every consolidated tool follows the same shape:

- A required `action` parameter (an enum) selects what the tool does.
- The remaining parameters are optional and only apply to specific actions.

So a typical call looks like:

```json
{
  "action": "init",
  "repoPath": "/path/to/project",
  "autoFill": true
}
```

:::tip[Pass repoPath once]
Tools that operate on a project (notably `context`) cache the `repoPath` after the first call. Provide it on your first tool call in a session; later calls can omit it.
:::

## Consolidated gateway tools

### explore

File and code exploration — read files, list paths, search content, and extract code structure.

**Actions:** `read`, `list`, `analyze`, `search`, `getStructure`

| Parameter | Type | Applies to | Description |
| --- | --- | --- | --- |
| `action` | enum (required) | all | Action to perform |
| `filePath` | string | read, analyze | Target file |
| `pattern` | string | list, search | Glob (list) or regex (search) |
| `cwd` | string | all | Working directory for file operations |
| `fileGlob` | string | search | Glob to filter which files are searched |
| `maxResults` | number | search | Cap on the number of search results |
| `rootPath` | string | getStructure | Root for the directory structure |
| `maxDepth` | number | getStructure | Depth limit for the structure tree |
| `encoding` | enum: `utf-8` \| `ascii` \| `binary` | read | File encoding |
| `symbolTypes` | array | analyze | Extract `class` \| `interface` \| `function` \| `type` \| `enum` |
| `ignore` | array | list, search, getStructure | Patterns to exclude |

**Returns:** file contents, matched files, symbol analysis, search results, or a directory tree.

### context

Context scaffolding and semantic context — the entry point for creating and filling `.context/`.

**Actions:** `check`, `bootstrapStatus`, `init`, `fill`, `fillSingle`, `listToFill`, `getMap`, `buildSemantic`, `scaffoldPlan`, `searchQA`, `generateQA`, `getFlow`, `detectPatterns`

| Parameter | Type | Applies to | Description |
| --- | --- | --- | --- |
| `action` | enum (required) | all | Action to perform |
| `repoPath` | string | all | Project root; cached on first call |
| `outputDir` | string | init, fill | Defaults to `./.context` |
| `type` | enum: `docs` \| `agents` \| `both` | init | Scaffolding type |
| `semantic` | boolean | init, buildSemantic | Enable semantic analysis |
| `autoFill` | boolean | init | Auto-fill the scaffold with codebase content |
| `generateQA` | boolean | init | Generate Q&A helper docs under `.context/docs/qa` |
| `skipContentGeneration` | boolean | init | Skip pre-generation |
| `target` | enum: `docs` \| `agents` \| `skills` \| `plans` \| `sensors` \| `all` | fill | Fill target |
| `filePath` | string | fillSingle | File to fill |
| `section` | enum: `all` \| `meta` \| `stack` \| `structure` \| `architecture` \| `functionalPatterns` \| `dependencies` \| `stats` \| `keyFiles` \| `navigation` | getMap | Map section to return |
| `contextType` | enum: `documentation` \| `playbook` \| `plan` \| `compact` | buildSemantic | Semantic context variant |
| `query` | string | searchQA | Keyword used to rank Q&A results |
| `entryFile` | string | getFlow | Entry-point file |
| `entryFunction` | string | getFlow | Function name to trace |
| `planName` | string | scaffoldPlan | Plan identifier |
| `title` | string | scaffoldPlan | Plan title |
| `summary` | string | scaffoldPlan | Plan goal |
| `options` | object | buildSemantic | Builder options (`useLSP`, `maxContextLength`, …) |

**Returns:** scaffold status, filled content, semantic context, execution traces, Q&A search results, code-flow graphs, or detected patterns.

:::tip[Standard init flow]
A typical first session is `check` → `init` (with `autoFill: true`) → `fillSingle` for each pending file → `scaffoldPlan` (non-trivial work only) → then start the [PREVC workflow](#dedicated-workflow-tools).
:::

### sync

Import/export synchronization between `.context/` and AI tool directories.

**Actions:** `exportRules`, `exportDocs`, `exportAgents`, `exportContext`, `exportSkills`, `reverseSync`, `importDocs`, `importAgents`, `importSkills`

| Parameter | Type | Applies to | Description |
| --- | --- | --- | --- |
| `action` | enum (required) | all | Action to perform |
| `preset` | string | export actions | Target AI tool preset (`claude`, `cursor`, …) |
| `force` | boolean | export/import | Overwrite existing files |
| `dryRun` | boolean | all | Preview without writing |
| `indexMode` | enum: `readme` \| `all` | exportDocs | Indexing strategy |
| `mode` | enum: `symlink` \| `markdown` | exportAgents | Export mode |
| `skipDocs` | boolean | reverseSync | Skip docs |
| `skipAgents` | boolean | reverseSync | Skip agents |
| `skipSkills` | boolean | reverseSync | Skip skills |
| `mergeStrategy` | enum: `skip` \| `overwrite` \| `merge` \| `rename` | import / reverseSync | Conflict handling |
| `includeBuiltIn` | boolean | exportSkills, importSkills | Include built-in skills |
| `autoDetect` | boolean | import actions | Auto-detect files to import |
| `addMetadata` | boolean | import actions | Add frontmatter metadata |

**Returns:** sync operation status, artifact counts, and written file paths.

:::note[CLI parity]
The `sync` actions mirror the standalone CLI commands (`sync`, `reverse-sync`, `import-rules`, `export-rules`). See [Using the CLI](/guides/using-the-cli/) when you want to run them outside an MCP session.
:::

### plan

Plan management and execution tracking, bound to PREVC phases.

**Actions:** `link`, `getLinked`, `getDetails`, `getForPhase`, `updatePhase`, `recordDecision`, `updateStep`, `getStatus`, `syncMarkdown`, `commitPhase`

| Parameter | Type | Applies to | Description |
| --- | --- | --- | --- |
| `action` | enum (required) | all | Action to perform |
| `planSlug` | string | most | Plan identifier |
| `phaseId` | string | updatePhase, commitPhase | PREVC phase ID (`P` \| `R` \| `E` \| `V` \| `C`) |
| `status` | enum: `pending` \| `in_progress` \| `completed` \| `skipped` | updatePhase, updateStep | Status to set |
| `phase` | enum: `P` \| `R` \| `E` \| `V` \| `C` | getForPhase | Filter by PREVC phase |
| `title` | string | recordDecision | Decision title |
| `description` | string | recordDecision, updateStep | Decision/step details |
| `alternatives` | array | recordDecision | Alternatives considered |
| `stepIndex` | number | updateStep | 1-based step number |
| `output` | string | updateStep | Step artifact path |
| `notes` | string | recordDecision, updateStep | Execution notes |
| `coAuthor` | string | commitPhase | Co-author/agent name on the commit |
| `stagePatterns` | array | commitPhase | Glob patterns to stage (default: `[".context/**"]`) |
| `dryRun` | boolean | commitPhase | Preview the commit |

**Returns:** plan status, phase progress, decision records, and execution timeline.

### agent

Agent orchestration and discovery for PREVC roles.

**Actions:** `discover`, `getInfo`, `orchestrate`, `getSequence`, `getDocs`, `getPhaseDocs`, `listTypes`

| Parameter | Type | Applies to | Description |
| --- | --- | --- | --- |
| `action` | enum (required) | all | Action to perform |
| `agentType` | string | getInfo, getDocs | Agent type identifier |
| `task` | string | orchestrate, getSequence | Task description |
| `phase` | enum: `P` \| `R` \| `E` \| `V` \| `C` | orchestrate, getPhaseDocs | PREVC phase filter |
| `role` | enum: `planner` \| `reviewer` \| `executor` \| `verifier` \| `completer` | orchestrate | PREVC role |
| `includeReview` | boolean | getSequence | Include code review in the sequence |
| `phases` | array | getSequence | Phase list to sequence across |

**Returns:** agent list, agent capabilities, recommended agents, handoff sequences, or agent documentation.

### skill

Skill management for on-demand expertise.

**Actions:** `list`, `getContent`, `getForPhase`, `scaffold`, `export`, `fill`

| Parameter | Type | Applies to | Description |
| --- | --- | --- | --- |
| `action` | enum (required) | all | Action to perform |
| `skillSlug` | string | getContent | Skill identifier |
| `phase` | enum: `P` \| `R` \| `E` \| `V` \| `C` | getForPhase | PREVC phase filter |
| `skills` | array | scaffold, fill, export | Specific skills to process |
| `includeContent` | boolean | list | Include full content in the listing |
| `includeBuiltIn` | boolean | list, export | Include built-in skills |
| `preset` | string | export | Target tool preset |
| `force` | boolean | export | Overwrite existing files |

**Returns:** skill list, skill content, phase-specific skills, or scaffold artifacts.

### harness

Explicit harness runtime operations — sessions, traces, artifacts, checkpoints, tasks, handoffs, datasets, sensors, and policies. This is the low-level surface behind durable execution history; you usually reach most of it indirectly through the workflow tools.

**Actions, grouped:**

| Group | Actions |
| --- | --- |
| Sessions | `createSession`, `listSessions`, `getSession`, `resumeSession`, `completeSession`, `failSession`, `replaySession`, `listReplays`, `getReplay` |
| Traces | `appendTrace`, `listTraces` |
| Artifacts | `addArtifact`, `listArtifacts` |
| Checkpoints | `checkpoint` |
| Tasks | `createTask`, `listTasks`, `evaluateTask` |
| Handoffs | `createHandoff`, `listHandoffs` |
| Datasets | `buildDataset`, `listDatasets`, `getDataset`, `getFailureClusters` |
| Sensors | `recordSensor`, `getSessionQuality` |
| Policy | `registerPolicy`, `listPolicies`, `getPolicy`, `setPolicy`, `resetPolicy`, `evaluatePolicy` |

**Key parameters (a subset — applicability depends on the action):**

| Parameter | Type | Description |
| --- | --- | --- |
| `action` | enum (required) | Action to perform |
| `sessionId` | string | Session resource identifier |
| `taskId` | string | Task contract identifier |
| `datasetId` | string | Failure dataset identifier |
| `name` / `title` / `description` | string | Resource metadata |
| `level` | enum: `debug` \| `info` \| `warn` \| `error` | `appendTrace` level |
| `event` | string | Trace event type (e.g. `sensor.run`) |
| `message` | string | Trace message |
| `data` / `metadata` / `content` | object | Structured payload |
| `expectedOutputs` / `acceptanceCriteria` / `requiredSensors` / `requiredArtifacts` | array | Task contract definition |
| `sensorId` / `sensorStatus` / `sensorSeverity` / `sensorBlocking` | — | Sensor run fields |
| `summary` / `evidence` | string / array | Sensor result summary |
| `from` / `to` / `artifacts` | — | Handoff fields |
| `scope` / `effect` / `target` / `pattern` | — | Policy fields |

**Returns:** session timelines, artifact inventories, task evaluations, sensor telemetry, replay records, failure clusters, or policy enforcement results.

:::tip[Want the concepts behind these?]
The harness entities are explained in depth under [Sessions, traces & artifacts](/concepts/harness-runtime/), [Sensors](/concepts/sensors/), [Policies](/concepts/policies/), [Task contracts & handoffs](/concepts/task-contracts/), and [Replay & failure datasets](/concepts/replay-and-datasets/).
:::

## Dedicated workflow tools

These four tools drive the PREVC workflow. They are kept separate from the consolidated gateway because they are called frequently and are central to structured development.

:::caution[Prerequisite]
Run the [context scaffold flow](#context) first — `.context/` must exist before initializing a workflow. The canonical workflow state lives in `.context/runtime/workflows/prevc.json`.
:::

### workflow-init

Initialize a PREVC workflow for structured development.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | Workflow/feature name |
| `description` | string | no | Task description used for scale auto-detection |
| `scale` | enum: `QUICK` \| `SMALL` \| `MEDIUM` \| `LARGE` | no | Force the project scale |
| `autonomous` | boolean | no | Skip workflow gates |
| `require_plan` | boolean | no | Require a plan before the P→R transition |
| `require_approval` | boolean | no | Require approval before the R→E transition |
| `archive_previous` | boolean | no | Archive an existing workflow first |

Scale controls which phases run:

| Scale | Phases | Rough effort |
| --- | --- | --- |
| `QUICK` | E → V | single file, ~5 min |
| `SMALL` | P → E → V | simple feature, ~15 min |
| `MEDIUM` | P → R → E → V | regular feature with design, ~30 min |
| `LARGE` | P → R → E → V → C | complex/systems/compliance, 1+ hour |

**Returns:** workflow status, the initial phase, and gate configuration; persists canonical state to `.context/runtime/workflows/prevc.json`.

### workflow-status

Get the current PREVC workflow status. Takes no required parameters.

**Returns:** current phase, all phase statuses, gate settings, linked plans, and agent activity.

### workflow-guide

Get adapter-neutral PREVC guidance from the harness. Takes optional `repoPath`, `phaseHint`, `intent`, and `format`.

**Returns:** workflow state, next steps, relevant skills, portable decision hints, and a compact or full renderable excerpt.

### workflow-advance

Advance to the next PREVC phase.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `outputs` | array | no | Artifact paths produced in the current phase |
| `force` | boolean | no | Bypass gates (P→R requires a plan when `require_plan` is set; R→E requires approval when `require_approval` is set) |

**Returns:** the next phase, updated phase statuses, and the gate-enforcement result.

### workflow-manage

Manage everything around the core phase loop — handoffs, collaboration, document creation, gates, approvals, autonomy, checkpoints, artifacts, task contracts, and ad-hoc sensor runs.

**Actions:** `handoff`, `collaborate`, `createDoc`, `getGates`, `approvePlan`, `setAutonomous`, `checkpoint`, `recordArtifact`, `defineTask`, `runSensors`

**Key parameters (a subset — applicability depends on the action):**

| Parameter | Type | Applies to | Description |
| --- | --- | --- | --- |
| `action` | enum (required) | all | Action to perform |
| `from` / `to` | string | handoff | Agents handing off / receiving |
| `artifacts` | array | handoff | Artifacts to hand off |
| `topic` | string | collaborate | Collaboration topic |
| `participants` | array | collaborate | Roles participating |
| `type` | enum: `prd` \| `tech-spec` \| `architecture` \| `adr` \| `test-plan` \| `changelog` | createDoc | Document type |
| `docName` | string | createDoc | Document name |
| `planSlug` | string | approvePlan | Plan identifier |
| `approver` | enum: `planner` \| `reviewer` \| `executor` \| `verifier` \| `completer` | approvePlan | Approving role |
| `notes` | string | approvePlan, setAutonomous | Notes / reason |
| `enabled` | boolean | setAutonomous | Enable or disable autonomy |
| `reason` | string | setAutonomous | Change reason |
| `name` / `kind` / `content` / `filePath` | — | recordArtifact | Artifact record fields |
| `taskTitle` / `taskDescription` / `expectedOutputs` / `acceptanceCriteria` / `requiredSensors` / `requiredArtifacts` | — | defineTask | Task contract fields |
| `sensors` | array | runSensors | Sensor IDs to execute |
| `data` | object | checkpoint | Checkpoint payload |
| `pause` | boolean | checkpoint | Pause the session after the checkpoint |

**Returns:** handoff confirmation, a collaboration session, an artifact record, gate status, a task contract, or sensor results.

## MCP resources

In addition to tools, the server exposes read-only resources your client can fetch by URI.

| Resource URI | MIME type | Description |
| --- | --- | --- |
| `context://codebase/{contextType}` | `text/markdown` | Semantic context variants — `documentation`, `playbook`, `plan`, or `compact`. Auto-refreshes on read; caching supported. |
| `file://{path}` | `text/plain` | Reads file contents; paths are validated against the workspace boundary. |
| `workflow://status` | `application/json` | Current PREVC workflow status — phases, roles, and a progress snapshot. |

## Recommended call flows

**Standard initialization:**

1. `context` → `check` (with `repoPath`) — verify `.context/` exists
2. `context` → `init` (with `autoFill: true`) — scaffold `.context/`
3. `context` → `fillSingle` — fill each pending file (run per file)
4. `context` → `scaffoldPlan` — optional, non-trivial work only
5. `workflow-init` — start PREVC (mandatory for non-trivial work)
6. `workflow-guide` → `workflow-advance` → handoffs → `workflow-guide`

**Phase-based orchestration:**

- `agent` → `orchestrate` (with `phase`) → `agent` → `getSequence` — discover agents for a phase
- `skill` → `getForPhase` (with `phase`) — pull phase-specific skills
- `workflow-manage` → `handoff` — transfer between agents

**Post-workflow:**

- `plan` → `syncMarkdown` — sync tracking back to the plan markdown
- `plan` → `commitPhase` (with `stagePatterns: [".context/**"]`) — commit phase artifacts

## Installing the server

To actually call these tools, install the MCP server into your AI client:

```bash
npx @dotcontext/mcp install
```

The installer supports 17 AI clients (Claude Code, Claude Desktop, Cursor, Windsurf, Continue.dev, VS Code / GitHub Copilot, Roo Code, Amazon Q Developer CLI, Google Gemini CLI, Codex CLI, Kiro, Zed, JetBrains IDEs, Trae AI, Kilo Code, GitHub Copilot CLI, and Pi). For the full setup and client-by-client details, see [Using dotcontext with MCP](/guides/using-with-mcp/).

## See also

- [Using dotcontext with MCP](/guides/using-with-mcp/) — prompt-driven walkthrough of this surface
- [The PREVC workflow](/concepts/prevc-workflow/) — phases, scales, and gates
- [Using the CLI](/guides/using-the-cli/) — the sync/admin surface outside MCP
- [dotcontext on GitHub](https://github.com/vinilana/dotcontext)
