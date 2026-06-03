# Dotcontext Harness Architecture

This document explains how dotcontext works as a harness engineering runtime, how the current architecture is consolidated, and how the repository is organized after the `cli -> harness <- mcp` split.

## Core Model

Dotcontext now treats harness engineering as a first-class runtime concern.

- `cli` is the operator-facing interface
- `harness` is the reusable runtime and domain layer
- `mcp` is the transport adapter that exposes the harness to AI tools

```mermaid
flowchart LR
    User["Human / Operator"] --> CLI["dotcontext/cli"]
    AITool["AI Tool / MCP Client"] --> MCP["dotcontext/mcp"]
    HookHost["Hook Host / Extension"] --> Hooks["dotcontext/harness hooks"]

    CLI --> H["dotcontext/harness"]
    MCP --> H
    Hooks --> H

    H --> WF["Workflow Runtime"]
    H --> RS["Runtime State"]
    H --> QC["Sensors + Backpressure"]
    H --> TC["Task Contracts + Handoffs"]
    H --> PO["Policy Engine"]
    H --> RP["Replay Service"]
    H --> DS["Failure Dataset Builder"]

    RS --> Store[".context/harness/*"]
    WF --> Store
    QC --> Store
    TC --> Store
    RP --> Store
    DS --> Store
    PO --> Policy[".context/harness/policy.json"]
```

## Consolidated Boundaries

The current architecture is intentionally asymmetric:

```text
cli -> harness <- mcp
```

That means:

- `harness` does not depend on `cli`
- `harness` does not depend on `mcp`
- `cli` and `mcp` are adapters over the same runtime
- transport concerns stay outside the core domain

This keeps the harness reusable for future adapters such as HTTP, workers, or SDKs.

## Harness Action Port

The reusable harness runtime now exposes transport-neutral action ports:

- `HarnessAdapterRuntime` is the adapter-facing facade for MCP-equivalent tools
- `HarnessHookAdapter` is the generic hook-facing adapter for Claude Code hooks, Codex hooks, pi.dev extensions, or other hook hosts
- `HarnessActionService` lives in `src/harness/application/actions`
- `HarnessAgentActionService` lives in `src/harness/application/agents`
- `HarnessSkillActionService` lives in `src/harness/application/skills`
- `HarnessPlanActionService` lives in `src/harness/application/workflow` or `src/harness/application/actions`
- `HarnessExploreActionService` lives in `src/harness/application/context`
- `HarnessContextActionService` lives in `src/harness/application/context`
- `HarnessSyncActionService` lives in `src/harness/application/exchange`
- `HarnessWorkflowManageActionService` lives in `src/harness/application/workflow`
- `HarnessWorkflowActionService` lives in `src/harness/application/workflow`
- `HarnessActionInput`, `HarnessAgentActionInput`, `HarnessSkillActionInput`, `HarnessPlanActionInput`, `HarnessExploreActionInput`, `HarnessContextActionInput`, `HarnessSyncActionInput`, `HarnessWorkflowManageActionInput`, workflow init/status/advance inputs, and their result types describe adapter-neutral runtime actions
- MCP delegates `harness`, `agent`, `skill`, `plan`, `explore`, `context`, `sync`, `workflow-init`, `workflow-status`, `workflow-advance`, and `workflow-manage` calls to these services and only wraps the result in an MCP response envelope

Future adapters such as Claude Code hooks, Codex hooks, HTTP endpoints, or editor extensions should consume these action services instead of copying MCP gateway logic. Protocol adapters are responsible only for validation, authentication, and protocol-specific response envelopes.

Adapters that want parity with the MCP tool set should prefer `HarnessAdapterRuntime.execute({ tool, params })`. It accepts MCP-equivalent tool names such as `context`, `workflow-advance`, or `harness`, and returns an adapter-neutral result kind (`json`, `text`, or `scaffold`) for the adapter to serialize into its own protocol.

Hook-based integrations should use `HarnessHookAdapter.handle(event)`. The event envelope is intentionally small: `{ tool, params, requestId?, source?, metadata? }`. The hook adapter validates the envelope, calls `HarnessAdapterRuntime`, and returns a hook response with `ok`, `source`, `tool`, `requestId`, and either `result` or `error`. Generic source factories such as `createClaudeCodeHarnessHookAdapter`, `createCodexHarnessHookAdapter`, and `createPiDevHarnessHookAdapter` live in the harness layer; host extension factories such as `createClaudeCodeHookAdapter`, `createCodexHookAdapter`, and `createPiDevHookAdapter` live in `src/integrations`. They label the host source without duplicating MCP gateway logic or assuming a vendor-specific protocol shape.

## Runtime Responsibilities

### 1. Runtime State

The harness persists durable execution state under `.context/harness`.

- sessions
- traces
- artifacts
- checkpoints
- contracts
- replays
- datasets
- policy documents

### 2. Guides

The current guide layer is implemented primarily through:

- workflow structure
- task contracts
- handoff contracts
- policy rules

These mechanisms constrain what the agent can do and what evidence it must produce.

### 3. Sensors

Sensors are the feedback layer.

- they run checks
- persist evidence
- produce blocking or non-blocking findings
- feed backpressure into task and workflow completion

### 4. Replay and Dataset

Replay and dataset generation turn runtime history into inspectable artifacts.

- session replay reconstructs the execution timeline
- failure datasets cluster repeated breakdowns
- this is the basis for future evaluation and learning loops

## Execution Lifecycle

The harness lifecycle is now explicit and durable.

```mermaid
sequenceDiagram
    participant U as User / AI Tool
    participant A as CLI, MCP, or Hook Adapter
    participant H as Harness Runtime
    participant S as State Store

    U->>A: Start task / workflow action
    A->>H: Create or load session
    H->>S: Persist session state

    A->>H: Link plan / define task contract
    H->>S: Persist contract

    A->>H: Run sensors / add artifacts / append traces
    H->>S: Persist evidence and execution events

    A->>H: Evaluate backpressure + task completion
    H->>H: Apply policies and completion rules

    A->>H: Advance PREVC phase
    H->>S: Complete active contract and persist next derived contract

    alt completion allowed
        H->>S: Checkpoint or complete session
        A-->>U: Success
    else blocked
        H-->>A: Blocking reasons
        A-->>U: Action required
    end

    A->>H: Replay session / build failure dataset
    H->>S: Read runtime history
    H-->>A: Replay or dataset output
```

When a linked plan includes structured `phases[].steps[].deliverables`, the workflow layer derives the active task contract from that metadata. `plan link` bootstraps the current phase contract, and `workflow-advance` rotates it while the harness remains responsible for persistence and completion checks.

## Current Repository Shape

```mermaid
flowchart TD
    Root["Repository Root"]

    Root --> CLI["src/cli"]
    Root --> Harness["src/harness"]
    Root --> MCP["src/mcp"]
    Root --> Integrations["src/integrations"]
    Root --> Shared["src/shared"]
    Root --> Scripts["scripts"]
    Root --> Context[".context"]

    CLI --> CLIAdapters["adapters / commands / services / ui"]
    Harness --> HarnessBoundary["application / domain / ports / adapters"]
    MCP --> MCPBoundary["server / gateway / logging / resources"]
    Integrations --> HostAdapters["claude-code / codex / pi-dev hooks"]
    Shared --> SharedCore["fs / context / registry / system"]

    HarnessBoundary --> Runtime["runtime state"]
    HarnessBoundary --> Sensors["sensors"]
    HarnessBoundary --> Contracts["task contracts"]
    HarnessBoundary --> Execution["execution"]
    HarnessBoundary --> Policy["policy"]
    HarnessBoundary --> Replay["replay"]
    HarnessBoundary --> Dataset["datasets"]

    Scripts --> Packaging["build-package-bundles / smoke / release"]
    Context --> Docs["docs / plans / agents / skills"]
```

The canonical source paths are `src/cli`, `src/harness`, `src/mcp`, `src/integrations`, and `src/shared`. `src/services` is not a target architecture folder. During migration, old deep imports should be redirected through package exports, local path aliases, or short-lived release-branch shims, but the source tree should not keep `src/services` as a permanent compatibility layer.

## Packaging Model

The codebase is still developed in one repository, but the runtime is now organized to package cleanly into three surfaces.

```mermaid
flowchart LR
    Repo["Monorepo Source"] --> Build["npm run build:packages"]
    Build --> B1[".release/packages/cli"]
    Build --> B2[".release/packages/harness"]
    Build --> B3[".release/packages/mcp"]

    B1 --> Smoke["npm run smoke:packages"]
    B2 --> Smoke
    B3 --> Smoke

    Smoke --> Release["npm run release:packages:*"]
    Release --> Local[".release/releases/<version>"]
```

## Why This Matches Harness Engineering

This architecture aligns with harness engineering in four practical ways:

1. The model is no longer the center of the system; the runtime is.
2. The core controls are explicit: guides, sensors, policies, contracts, and backpressure.
3. Execution is durable and inspectable through traces, replays, and datasets.
4. Transport is separated from control logic, so the harness can evolve without rewriting the CLI or MCP surface.

## Current Status

The current consolidated architecture already supports:

- durable harness sessions
- workflow-bound execution
- policy-controlled mutations
- evidence-driven completion checks
- replayable execution history
- clustered failure datasets
- local packaging and smoke validation for `cli`, `harness`, and `mcp`

The next layer of evolution is not more boundary work. It is product depth on top of this runtime:

- stronger default policies
- richer evaluator flows
- replay-driven benchmarking
- multi-agent templates
- publishable package distribution
