---
type: doc
name: project-overview
description: High-level overview of the project, its purpose, and key components
category: overview
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---

# Project Overview

**@dotcontext/cli** (v0.8.0) is an MCP-first context engineering toolkit for codebase documentation and AI agent prompts. MCP-enabled AI tools create and refresh the `.context` directory structure containing docs, agents, plans, and skills, while the standalone CLI now focuses on workflow management, sync/import utilities, reporting, and MCP configuration. The project also supports semantic code analysis via tree-sitter, a PREVC workflow engine, MCP server mode for AI tool integration, and context export/sync to Claude, Gemini, and Codex.

## Codebase Reference

The machine-readable codebase map lives at `.context/docs/codebase-map.json`. It contains file listings, dependency graphs, and structural metadata used by MCP tools, workflow orchestration, and codebase analysis features.

## Quick Facts

| Property         | Value                                      |
| ---------------- | ------------------------------------------ |
| Package name     | `@dotcontext/cli`                       |
| Version          | 0.8.0                                      |
| License          | MIT                                        |
| Node requirement | >= 20.0.0                                  |
| Language          | TypeScript (target ES2020, CommonJS)       |
| Binary           | `dotcontext`                               |
| Repository       | https://github.com/vinilana/ai-coders-context |

## Entry Points

- **CLI binary**: `dist/index.js` (mapped to the `dotcontext` command via `package.json` `bin` field)
- **Source entry**: `src/index.ts` -- registers all commander commands and starts the CLI
- **MCP server**: accessible through the `mcp` CLI command for AI tool integration

## Key Exports

The package ships only compiled output from `dist/`. Refer to `.context/docs/codebase-map.json` for a full inventory of exported modules and their relationships.

Primary public surface:
- CLI commands exposed through commander (sync, import/export, workflow, reporting, MCP setup, etc.)
- MCP server tools (via `src/services/mcp/`)

## File Structure

```
src/
  index.ts              # CLI entry point (commander setup)
  cli.test.ts           # CLI integration test
  types.ts              # Shared type definitions
  version.ts            # Version constant
  generators/           # Template generators
    agents/             # Agent prompt templates
    documentation/      # Doc templates
    plans/              # Plan templates
    shared/             # Shared generator utilities
    skills/             # Skill templates
  services/             # Core business logic
    ai/                 # MCP-facing AI tool definitions and provider helpers
    autoFill/           # Static scaffold auto-fill from semantic analysis
    export/             # Context export to AI tools
    import/             # Context import
    init/               # .context scaffolding initializer used by MCP tools
    mcp/                # MCP server and gateway handlers
    qa/                 # QA scaffolding service
    report/             # Context and workflow reporting
    reverseSync/        # Import external changes back into .context
    semantic/           # Tree-sitter semantic analysis
    shared/             # Shared helpers and service types
    stack/              # Stack detection and scaffold filtering
    state/              # Interactive state detection
    sync/               # Context sync to AI tools (Claude, Gemini, Codex)
    workflow/           # PREVC workflow service layer
    ... (and more)
  utils/                # Shared utilities
    frontMatter.*       # YAML frontmatter parsing
    i18n.*              # Internationalization (en, pt-BR)
    prompts/            # CLI prompt definitions (inquirer)
    ...
  workflow/             # Workflow config and state
.context/               # Generated context directory
  docs/                 # Documentation files
  agents/               # Agent playbooks
  plans/                # Plan documents
  skills/               # Skill definitions
```

## Technology Stack Summary

| Layer          | Technology                                           |
| -------------- | ---------------------------------------------------- |
| Runtime        | Node.js >= 20                                        |
| Language       | TypeScript 5.x (strict mode, CommonJS output)        |
| CLI framework  | commander 14.x                                       |
| Interactive UI | inquirer 12.x, chalk 4.x, ora 5.x, boxen, figures   |
| AI SDKs        | @ai-sdk/anthropic, @ai-sdk/openai, @ai-sdk/google, ai (Vercel AI SDK) |
| MCP            | @modelcontextprotocol/sdk 1.x                        |
| Code analysis  | tree-sitter, tree-sitter-typescript (optional)        |
| Validation     | zod 4.x                                              |
| Testing        | Jest 30.x with ts-jest                               |
| Dev tooling    | tsx (development runner), tsc (build)                 |

## Getting Started Checklist

1. Clone the repository: `git clone https://github.com/vinilana/ai-coders-context.git`
2. Install dependencies: `npm install`
3. Run in development mode: `npm run dev` (uses tsx for fast TypeScript execution)
4. Build for production: `npm run build`
5. Run tests: `npm test`
6. Try the CLI: `npx dotcontext mcp:install` to connect the package to your AI tool

## Next Steps

- Read **development-workflow.md** for branching, releases, and contribution guidelines.
- Read **testing-strategy.md** for test patterns and quality gates.
- Read **tooling.md** for scripts, IDE setup, and productivity tips.
- Explore `.context/agents/README.md` for agent playbook documentation.
- Review `.context/docs/codebase-map.json` for the full structural map of the codebase.
