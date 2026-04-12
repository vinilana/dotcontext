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

    CLI --> H["dotcontext/harness"]
    MCP --> H

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
    participant A as CLI or MCP Adapter
    participant H as Harness Runtime
    participant S as State Store

    U->>A: Start task / workflow action
    A->>H: Create or load session
    H->>S: Persist session state

    A->>H: Define task contract
    H->>S: Persist contract

    A->>H: Run sensors / add artifacts / append traces
    H->>S: Persist evidence and execution events

    A->>H: Evaluate backpressure + task completion
    H->>H: Apply policies and completion rules

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

## Current Repository Shape

```mermaid
flowchart TD
    Root["Repository Root"]

    Root --> CLI["src/cli"]
    Root --> Harness["src/harness"]
    Root --> MCP["src/mcp"]
    Root --> Services["src/services"]
    Root --> Scripts["scripts"]
    Root --> Context[".context"]

    CLI --> CLIBoundary["CLI boundary exports"]
    Harness --> HarnessBoundary["Harness boundary exports"]
    MCP --> MCPBoundary["MCP boundary exports"]

    Services --> HarnessServices["services/harness"]
    Services --> WorkflowServices["services/workflow"]
    Services --> MCPGateway["services/mcp/gateway"]
    Services --> Shared["services/shared"]

    HarnessServices --> Runtime["runtimeStateService"]
    HarnessServices --> Sensors["sensorsService"]
    HarnessServices --> Contracts["taskContractsService"]
    HarnessServices --> Execution["executionService"]
    HarnessServices --> Policy["policyService"]
    HarnessServices --> Replay["replayService"]
    HarnessServices --> Dataset["datasetService"]

    Scripts --> Packaging["build-package-bundles / smoke / release"]
    Context --> Docs["docs / plans / agents / skills"]
```

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
