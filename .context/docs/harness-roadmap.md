---
type: doc
name: harness-roadmap
description: Product roadmap for evolving dotcontext into a harness engineering platform
category: roadmap
generated: 2026-04-11
status: filled
scaffoldVersion: "2.0.0"
---

# Harness Roadmap

This roadmap describes how dotcontext can evolve from its current architecture split into a full harness engineering platform.

The intended product shape is:

- `dotcontext/cli` as the operator-facing interface
- `dotcontext/harness` as the reusable runtime and domain layer
- `dotcontext/mcp` as the Model Context Protocol adapter over the harness

The roadmap is organized by product capability, not by code folder, because harness engineering is ultimately about runtime control, feedback, and reliability.

## Roadmap Principles

The roadmap assumes these design principles:

- transport adapters should stay thinner than the harness runtime
- runtime state should be explicit, inspectable, and durable
- computational sensors should be preferred where possible
- inferential controls should be added where deterministic checks are insufficient
- every autonomous capability should have matching observability and back-pressure
- PREVC should be treated as a strong default workflow, but not the only future execution model

## Now

These are the next capabilities that should be built on top of the current architecture. They have the best ratio of product value to implementation risk.

### 1. Session Runtime

Goal: make long-running harness execution first-class.

Features:

- persistent session objects for agent runs
- resumable execution with checkpoints
- append-only event log per session
- explicit run metadata: task, owner, repo, agents involved, timestamps
- artifact store for outputs, handoffs, and evidence

Why now:

- the architecture is already split into `cli`, `harness`, and `mcp`
- session state is the foundation for evals, replay, approvals, and observability

### 2. Sensors and Back-Pressure

Goal: formalize the harness feedback layer.

Features:

- sensors as first-class runtime concepts
- built-in computational sensors:
  - build
  - typecheck
  - lint
  - test
  - structural constraints
- sensor result model with pass/fail, severity, evidence, and timestamps
- configurable back-pressure so critical sensor failures block completion
- task completion rules based on sensor status instead of prompt-only conventions

Why now:

- this is where harness engineering starts to become materially different from prompt engineering
- it directly improves trust in agent output

### 3. Execution Traces and Observability

Goal: make agent behavior inspectable.

Features:

- trace timeline for tool calls, state transitions, retries, and failures
- normalized event model inside `dotcontext/harness`
- logs linked to session and task IDs
- evidence records attached to plans, phases, and approvals
- reporting views for failed runs and repeated failure classes

Why now:

- once sessions and sensors exist, traces become the main debugging surface
- this also creates the basis for future evaluation datasets

### 4. Task Contracts

Goal: replace vague agent assignments with explicit runtime contracts.

Features:

- structured task definition:
  - goal
  - inputs
  - expected outputs
  - acceptance criteria
  - required sensors
  - assigned agent type
- handoff contracts between planner, executor, reviewer, and evaluator
- artifact schema for task outputs

Why now:

- this reduces ambiguity in both single-agent and multi-agent operation
- it is the cleanest way to connect plans, workflow, sensors, and evidence

## Next

These should follow once sessions, sensors, traces, and task contracts exist.

### 5. Evaluator Layer

Goal: separate execution from judgment.

Features:

- evaluator agent role as a first-class harness component
- scorecards for:
  - correctness
  - architecture fit
  - test adequacy
  - docs adequacy
  - policy compliance
- evaluator loops for long-running tasks
- configurable stopping conditions based on evaluation quality

Why next:

- evaluator quality depends on session evidence and sensor results already existing

### 6. Guides as Runtime Assets

Goal: move guides from passive docs into active harness inputs.

Features:

- versioned guide assets
- guide bundles by task type, stack, or repo topology
- guide selection logic based on task contract and repo context
- constraints tied to guides, not just narrative instructions
- progressive disclosure of guides rather than monolithic injection

Why next:

- the repo already has docs, skills, and playbooks
- the next step is turning them into selected runtime assets with explicit effect

### 7. Harness Templates

Goal: package battle-tested harness configurations for common project types.

Features:

- templates for:
  - TypeScript monorepo
  - CRUD backend
  - frontend app
  - CLI tool
  - event-driven worker
- each template bundles:
  - default guides
  - default sensors
  - recommended agent topology
  - workflow defaults
  - expected artifacts

Why next:

- templates are the most scalable way to make harness engineering reusable

### 8. Multi-Agent Topologies

Goal: support controlled multi-agent execution as a native harness feature.

Features:

- planner / executor / reviewer / evaluator topology
- agent-specific task contracts
- isolated context windows by role
- artifact-based handoffs
- retry and escalation rules per role

Why next:

- the current codebase already models agents and orchestration
- after contracts and evidence exist, multi-agent operation becomes much safer to implement

## Later

These are strategically important, but should come after the runtime core is stable.

### 9. Policy and Governance Engine

Goal: make operational rules enforceable at runtime.

Features:

- policy rules for tools, paths, and environments
- approval requirements based on risk or scope
- secret handling and restricted connector policies
- role-based execution permissions
- audit-grade event trail

### 10. Replay and Evaluation Dataset Generation

Goal: turn harness usage into reusable learning data.

Features:

- replay of full sessions
- diff between expected and observed execution paths
- failure clustering
- datasets for prompt, workflow, and policy improvement
- model comparison using the same harness trace corpus

### 11. Workflow Engine Expansion

Goal: make PREVC one execution strategy among several.

Features:

- PREVC as default workflow template
- support for alternate engines:
  - fast single-pass execution
  - gated enterprise workflow
  - long-running autonomous workflow
  - review-heavy workflow
- workflow selection by task type and risk profile

### 12. Package Publication and Platform Distribution

Goal: turn the internal split into a public package and release model.

Features:

- independent package publication for:
  - `@dotcontext/cli`
  - `@dotcontext/harness`
  - `@dotcontext/mcp`
- package-specific smoke tests
- release channels and compatibility guarantees
- future adapters beyond MCP, such as HTTP or embedded SDK execution

## Suggested Sequencing

If the team wants a strict order, this is the most coherent path:

1. sessions
2. sensors
3. traces
4. task contracts
5. evaluator layer
6. guide assets
7. harness templates
8. multi-agent topologies
9. policy engine
10. replay and dataset generation
11. workflow engine expansion
12. independent package publication

## Success Criteria By Stage

### Stage 1 Success

The product can run a task with:

- durable session state
- explicit task contract
- sensor-backed completion rules
- inspectable trace output

### Stage 2 Success

The product can run the same task with:

- selected guides
- evaluator feedback
- template-driven defaults
- multi-agent handoffs with evidence

### Stage 3 Success

The product can operate in production with:

- policy enforcement
- replayability
- measurable harness quality
- package-level distribution and upgrade workflows

## Practical Recommendation

If only one quarter of work can be funded, the best roadmap slice is:

1. sessions
2. sensors with back-pressure
3. traces
4. task contracts

That is the smallest set that makes dotcontext meaningfully recognizable as a harness engineering platform instead of only an MCP-enabled workflow tool.
