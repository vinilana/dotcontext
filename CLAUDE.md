# Project Rules and Guidelines

> Auto-generated from .context/docs on 2026-03-18T21:47:40.751Z

## README

# Documentation Index

Welcome to the `@ai-coders/context` repository knowledge base. Start with the project overview, then dive into specific guides as needed.

## Core Guides

| Guide | File | Primary Inputs |
| --- | --- | --- |
| Project Overview | [`project-overview.md`](./project-overview.md) | Roadmap, README, stakeholder notes |
| Development Workflow | [`development-workflow.md`](./development-workflow.md) | Branching rules, CI config, contributing guide |
| Testing Strategy | [`testing-strategy.md`](./testing-strategy.md) | Test configs, CI gates, known flaky suites |
| Tooling & Productivity | [`tooling.md`](./tooling.md) | CLI scripts, IDE configs, automation workflows |

## Q&A

Frequently asked questions are organized by topic in the [`qa/`](./qa/) directory.
See [qa/README.md](./qa/README.md) for the full index.

## Codebase Map

Machine-readable project structure and stack metadata: [`codebase-map.json`](./codebase-map.json)

## Repository Snapshot

```
AGENTS.md
CHANGELOG.md
CLAUDE.md
CONTRIBUTING.md
LICENSE
README.md
docs/             -- Published documentation produced by this tool
example-documentation.ts
jest.config.js
package.json
package-lock.json
prompts/          -- Prompt templates (update_plan_prompt.md, update_scaffold_prompt.md)
scripts/          -- Build and test helper scripts
src/              -- TypeScript source (~240 files): CLI entrypoint, services, generators, utilities
tsconfig.json
```


## qa/README

# Q&A Index

Project type: **cli-tool**

Generated: 2026-03-18T21:32:55.004Z

## Getting-started

- [How do I set up and run this project?](./getting-started.md)

## Architecture

- [How is the codebase organized?](./project-structure.md)

## Operations

- [How are errors handled?](./error-handling.md)

## Testing

See [testing-strategy.md](../testing-strategy.md) in the parent docs directory for full test framework documentation.

