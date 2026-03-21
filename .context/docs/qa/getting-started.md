---
slug: getting-started
category: getting-started
status: filled
generatedAt: 2026-03-18T21:32:50.399Z
---

# How do I set up and run this project?

## Prerequisites

- Node.js >= 20.0.0
- npm

## Installation (for development)

```bash
# Clone the repository
git clone https://github.com/vinilana/ai-coders-context.git
cd ai-coders-context

# Install dependencies
npm install

# Build the TypeScript source
npm run build
```

## Installation (as a user)

```bash
npm install -g @ai-coders/context
```

After installation the `ai-context` binary is available globally.

## Running in development

```bash
# Run directly from TypeScript source (uses tsx)
npm run dev

# Run from compiled output
npm start
```

## Key npm scripts

| Script | Purpose |
| --- | --- |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Run from source via `tsx` |
| `npm start` | Run compiled `dist/index.js` |
| `npm test` | Run Jest test suite |
| `npm run release` | Bump patch version and publish to npm |
| `npm run release:minor` | Bump minor version and publish |
| `npm run release:major` | Bump major version and publish |

## CLI commands overview

The CLI is built with Commander. Run `ai-context --help` to see all commands. Key commands include:

- **`ai-context sync-agents`** -- Synchronize agent playbooks
- **`ai-context reverse-sync`** -- Import rules, agents, and skills from AI tool directories
- **`ai-context mcp`** -- Start in MCP (Model Context Protocol) server mode
- **`ai-context mcp:install [tool]`** -- Install MCP configuration for AI tools
- **`ai-context export-rules`** -- Export rules for AI coding tools
- **`ai-context report`** -- Generate context reports
- **`ai-context workflow init|status|advance`** -- Manage PREVC workflow phases

## Interactive mode

Running `ai-context` with no command arguments enters interactive mode, which guides you through project state, workflow, sync, imports, and MCP setup using Inquirer prompts.

## Environment variables

- `AI_CONTEXT_LANG` -- Override the UI locale (`en` or `pt-BR`)
- A `.env` file in the project root is loaded automatically via `dotenv`

The standalone CLI no longer creates or fills context directly.
For context creation, plan scaffolding, AI-generated filling, or refresh, use MCP-enabled AI tools after running `ai-context mcp:install`.
