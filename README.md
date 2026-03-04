# @ai-coders/context

[![npm version](https://badge.fury.io/js/@ai-coders%2Fcontext.svg)](https://www.npmjs.com/package/@ai-coders/context)
[![CI](https://github.com/vinilana/ai-coders-context/actions/workflows/ci.yml/badge.svg)](https://github.com/vinilana/ai-coders-context/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**The Ultimate MCP for AI Agent Orchestration, Context Engineering, and Spec-Driven Development.**
Context engineering for AI now is stupidly simple.

Stop letting LLMs run on autopilot. PREVC is a universal process that improves AI output through 5 simple steps: **Planning, Review, Execution, Validation, and Confirmation**. Context-oriented. Spec-driven. No guesswork.

## The Problem

Every AI coding tool invented its own way to organize context:

```
.cursor/rules/          # Cursor
.claude/                # Claude Code
.windsurf/rules/        # Windsurf
.github/agents/         # Copilot
.cline/                 # Cline
.agent/rules/           # Google Antigravity
.trae/rules/            # Trae AI
AGENTS.md               # Codex
```

Using multiple tools? Enjoy duplicating your rules, agents, and documentation across 8 different formats. Context fragmentation is real.

## The Solution

One `.context/` directory. Works everywhere.

```
.context/
├── docs/           # Your documentation (architecture, patterns, decisions)
├── agents/         # Agent playbooks (code-reviewer, feature-developer, etc.)
├── plans/          # Work plans linked to PREVC workflow
└── skills/         # On-demand expertise (commit-message, pr-review, etc.)
```

Export to any tool.
**Write once. Use anywhere. No boilerplate.**


## Youtube video
[![Watch the video](https://img.youtube.com/vi/p9uV3CeLaKY/0.jpg)](https://www.youtube.com/watch?v=p9uV3CeLaKY)

## Connect with Us

Built by [AI Coders Academy](http://aicoders.academy/) — Learn AI-assisted development and become a more productive developer.

- [AI Coders Academy](http://aicoders.academy/) — Courses and resources for AI-powered coding
- [YouTube Channel](https://www.youtube.com/@aicodersacademy) — Tutorials, demos, and best practices
- [Connect with Vini](https://www.linkedin.com/in/viniciuslanadepaula/) — Creator of @ai-coders/context


## Why PREVC?

LLMs produce better results when they follow a structured process instead of generating code blindly. PREVC ensures:

- **Specifications before code** — AI understands what to build before building it
- **Context awareness** — Each phase has the right documentation and agent
- **Human checkpoints** — Review and validate at each step, not just at the end
- **Reproducible quality** — Same process, consistent results across projects

## Usage

```bash
npx @ai-coders/context
```

That's it. The wizard detects what needs to be done.


PT-BR Tutorial
https://www.youtube.com/watch?v=5BPrfZAModk


## What it does

1. **Creates documentation** — Structured docs from your codebase (architecture, data flow, decisions)
2. **Generates agent playbooks** — 14 specialized AI agents (code-reviewer, bug-fixer, architect, etc.)
3. **Smart scaffold filtering** — Automatically detects project type and generates only relevant content
4. **Useful out-of-the-box** — Scaffolds include practical template content, not empty placeholders
5. **Manages workflows** — PREVC process with scale detection, gates, and execution history
6. **Provides skills** — On-demand expertise (commit messages, PR reviews, security audits)
7. **Syncs everywhere** — Export to Cursor, Claude, Copilot, Windsurf, Cline, Codex, Antigravity, Trae, and more
8. **Tracks execution** — Step-level tracking with git integration for workflow phases
9. **Keeps it updated** — Detects code changes and suggests documentation updates

## Quick Start

1. Install the MCP
2. Prompt to the agent:
```bash
init the context
```
3. This will setup the context and fill it according the the codebase
4. With the context ready prompt
```bash
plan [YOUR TASK HERE] using ai-context
```
5. After planned, prompt
```bash
start the workflow
```
6. That's it!

## PREVC Workflow System

A universal 5-phase process designed to improve LLM output quality through structured, spec-driven development:

| Phase | Name | Purpose |
|-------|------|---------|
| **P** | Planning | Define what to build. Gather requirements, write specs, identify scope. No code yet. |
| **R** | Review | Validate the approach. Architecture decisions, technical design, risk assessment. |
| **E** | Execution | Build it. Implementation follows the approved specs and design. |
| **V** | Validation | Verify it works. Tests, QA, code review against original specs. |
| **C** | Confirmation | Ship it. Documentation, deployment, stakeholder handoff. |

### The Problem with Autopilot AI

Most AI coding workflows look like this:
```
User: "Add authentication"
AI: *generates 500 lines of code*
User: "That's not what I wanted..."
```

PREVC fixes this:
```
P: What type of auth? OAuth, JWT, session? What providers?
R: Here's the architecture. Dependencies: X, Y. Risks: Z. Approve?
E: Implementing approved design...
V: All 15 tests pass. Security audit complete.
C: Deployed. Docs updated. Ready for review.
```

## Documentation

- [User Guide](./docs/GUIDE.md) — Complete usage guide


### Smart Project Detection

The system automatically detects your project type and generates only relevant scaffolds:

| Project Type | Detected By | Docs | Agents |
|--------------|-------------|------|--------|
| **CLI** | `bin` field, commander/yargs | Core docs | Core agents |
| **Web Frontend** | React, Vue, Angular, Svelte | + architecture, security | + frontend, devops |
| **Web Backend** | Express, NestJS, FastAPI | + architecture, data-flow, security | + backend, database, devops |
| **Full Stack** | Both frontend + backend | All docs | All agents |
| **Mobile** | React Native, Flutter | + architecture, security | + mobile, devops |
| **Library** | `main`/`exports` without `bin` | Core docs | Core agents |
| **Monorepo** | Lerna, Nx, Turborepo | All docs | All agents |

**Core scaffolds** (always included):
- Docs: project-overview, development-workflow, testing-strategy, tooling
- Agents: code-reviewer, bug-fixer, feature-developer, refactoring-specialist, test-writer, documentation-writer, performance-optimizer

### Scale-Adaptive Routing

The system automatically detects project scale and adjusts the workflow:

| Scale | Phases | Use Case |
|-------|--------|----------|
| QUICK | E → V | Bug fixes, small tweaks |
| SMALL | P → E → V | Simple features |
| MEDIUM | P → R → E → V | Regular features |
| LARGE | P → R → E → V → C | Complex systems, compliance |

## Requirements for the CLI

- Node.js 20+
- API key from a supported provider (for AI features)

**If you are using throught MCP you don't need to setup an API key from a supported provider, your AI agent will use it's own LLM.**


## Supported Providers

| Provider | Environment Variable |
|----------|---------------------|
| OpenRouter | `OPENROUTER_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google | `GOOGLE_API_KEY` |

## MCP Server Setup

This package includes an MCP (Model Context Protocol) server that provides AI coding assistants with powerful tools to analyze and document your codebase.

### Quick Installation (v0.7.0+)

Use the new MCP Install command to automatically configure the MCP server:

```bash
npx @ai-coders/context mcp:install
```

This interactive command:
- Detects installed AI tools on your system
- Configures ai-context MCP server in each tool
- Supports global (home directory) and local (project directory) installation
- Merges with existing MCP configurations without overwriting
- Includes dry-run mode to preview changes
- Works with Claude Code, Cursor, Windsurf, Cline, Continue.dev, and more

### Streamable HTTP Mode (Codex IDE / Remote Clients)

For clients that connect over HTTP instead of spawning stdio, start the MCP server in Streamable HTTP mode:

```bash
npx @ai-coders/context mcp:http --host 127.0.0.1 --port 3000 --path /mcp
```

For remote/load-balanced deployments (for example MCP-Use), use stateless mode:

```bash
node dist/index.js mcp:http --host 0.0.0.0 --port 3000 --path /mcp --stateless --json-response
```

Local development shortcut:

```bash
npm run mcp:http -- --host 127.0.0.1 --port 3000 --path /mcp
```

Endpoint:
- `http://127.0.0.1:3000/mcp`
- Methods supported by the MCP Streamable HTTP transport: `POST`, `GET`, `DELETE`
- `--stateless` disables server-side session stickiness requirements for multi-instance environments

### Claude Code Project Bootstrap (opt-in)

Enable Claude Code integration per repository:

```bash
npx @ai-coders/context claude:bootstrap
```

Local development shortcut:

```bash
npm run claude:bootstrap
```

What it adds (safe merge, idempotent):
- `.mcp.json` with `mcpServers.ai-context` (preserves existing servers/keys)
- `.claude/settings.json` with conservative permissions + `PreToolUse` and `Stop` hooks
- `.claude/agents/*.md` exported from `.context/agents/*.md` (updates only managed files)

How to revert:
- Remove `.claude/` and `.mcp.json`

### Manual Configuration

Alternatively, manually configure for your preferred tool.

### Antigravity

#### 1. Access Raw Config

The visual interface only shows official partners, but the manual editing mode allows any local or remote executable.

1. Open the **Agent** panel (usually in the sidebar or `Ctrl+L`).
2. Click the options menu (three dots `...`) or the settings icon.
3. Select **Manage MCP Servers**.
4. At the top of this screen, look for a discreet button or link named **"View raw config"** or **"Edit JSON"**.

> **Note:** If you cannot find the button in the UI, you can navigate directly through the file explorer and look for `.idx/mcp.json` or `mcp_config.json` in your workspace root.

#### 2. Add Custom Server

You will see a JSON file. You must add a new entry inside the `"mcpServers"` object.

Here is the template to add a server (example using `npx` for a Node.js server or a local executable):

```json
{
  "mcpServers": {
    "ai-context": {
      "command": "npx",
      "args": ["@ai-coders/context", "mcp"]
    }
  }
}
```

#### 3. Restart the Connection

After saving the `mcp.json` file:

1. Return to the **"Manage MCP Servers"** panel.
2. Click the **Refresh** button or restart the Antigravity environment (*Reload Window*).
3. The new server should appear in the list with a status indicator (usually a green light if connected successfully).

### Claude Code (CLI)

Add the MCP server using the Claude CLI:

```bash
claude mcp add ai-context -- npx @ai-coders/context mcp
```

Or configure manually in `~/.claude.json`:

```json
{
  "mcpServers": {
    "ai-context": {
      "command": "npx",
      "args": ["@ai-coders/context", "mcp"]
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "ai-context": {
      "command": "npx",
      "args": ["@ai-coders/context", "mcp"]
    }
  }
}
```

### Cursor AI

Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "ai-context": {
      "command": "npx",
      "args": ["@ai-coders/context", "mcp"]
    }
  }
}
```

### Windsurf

Add to your Windsurf MCP config (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "ai-context": {
      "command": "npx",
      "args": ["@ai-coders/context", "mcp"]
    }
  }
}
```

### Zed Editor

Add to your Zed settings (`~/.config/zed/settings.json`):

```json
{
  "context_servers": {
    "ai-context": {
      "command": {
        "path": "npx",
        "args": ["@ai-coders/context", "mcp"]
      }
    }
  }
}
```

### Cline (VS Code Extension)

Configure in Cline settings (VS Code → Settings → Cline → MCP Servers):

```json
{
  "mcpServers": {
    "ai-context": {
      "command": "npx",
      "args": ["@ai-coders/context", "mcp"]
    }
  }
}
```

### Codex CLI

Add to your Codex CLI config (`~/.codex/config.toml`):

```toml
[mcp_servers.ai-context]
command = "npx"
args = ["--yes", "@ai-coders/context@latest", "mcp"]
```

### Google Antigravity

Add to your Antigravity MCP config (`~/.gemini/mcp_config.json`):

```json
{
  "mcpServers": {
    "ai-context": {
      "command": "npx",
      "args": ["@ai-coders/context", "mcp"]
    }
  }
}
```

### Trae AI

Add to your Trae AI MCP config (Settings > MCP Servers):

```json
{
  "mcpServers": {
    "ai-context": {
      "command": "npx",
      "args": ["@ai-coders/context", "mcp"]
    }
  }
}
```

### Local Development

For local development, point directly to the built distribution:

```json
{
  "mcpServers": {
    "ai-context-dev": {
      "command": "node",
      "args": ["/path/to/ai-coders-context/dist/index.js", "mcp"]
    }
  }
}
```

### Available MCP Tools

Once configured, your AI assistant will have access to 9 gateway tools with action-based dispatching:

#### Gateway Tools (Primary Interface)

| Gateway | Description | Actions |
|---------|-------------|---------|
| **explore** | File and code exploration | `read`, `list`, `analyze`, `search`, `getStructure` |
| **context** | Context scaffolding and semantic context | `check`, `init`, `fill`, `fillSingle`, `listToFill`, `getMap`, `buildSemantic`, `scaffoldPlan` |
| **plan** | Plan management and execution tracking | `link`, `getLinked`, `getDetails`, `getForPhase`, `updatePhase`, `recordDecision`, `updateStep`, `getStatus`, `syncMarkdown`, `commitPhase` |
| **agent** | Agent orchestration and discovery | `discover`, `getInfo`, `orchestrate`, `getSequence`, `getDocs`, `getPhaseDocs`, `listTypes` |
| **skill** | Skill management for on-demand expertise | `list`, `getContent`, `getForPhase`, `scaffold`, `export`, `fill` |
| **sync** | Import/export synchronization with AI tools | `exportRules`, `exportDocs`, `exportAgents`, `exportContext`, `exportSkills`, `reverseSync`, `importDocs`, `importAgents`, `importSkills` |

#### Dedicated Workflow Tools

| Tool | Description |
|------|-------------|
| **workflow-init** | Initialize a PREVC workflow with scale detection, gates, and autonomous mode |
| **workflow-status** | Get current workflow status, phases, and execution history |
| **workflow-advance** | Advance to the next PREVC phase with gate checking |
| **workflow-manage** | Manage handoffs, collaboration, documents, gates, and approvals |

#### Key Features in v0.7.0

- **Gateway Pattern**: Simplified, action-based tools reduce cognitive load
- **Plan Execution Tracking**: Step-level tracking with `updateStep`, `getStatus`, `syncMarkdown` actions
- **Git Integration**: `commitPhase` action for creating commits on phase completion
- **Q&A & Pattern Detection**: Automatic Q&A generation and functional pattern analysis
- **Execution History**: Comprehensive logging of all workflow actions to `.context/workflow/actions.jsonl`
- **Workflow Gates**: Phase transition gates based on project scale with approval requirements
- **Export/Import Tools**: Granular control over docs, agents, and skills sync with merge strategies

### Skills (On-Demand Expertise)

Skills are task-specific procedures that AI agents activate when needed:

| Skill | Description | Phases |
|-------|-------------|--------|
| `commit-message` | Generate conventional commits | E, C |
| `pr-review` | Review PRs against standards | R, V |
| `code-review` | Code quality review | R, V |
| `test-generation` | Generate test cases | E, V |
| `documentation` | Generate/update docs | P, C |
| `refactoring` | Safe refactoring steps | E |
| `bug-investigation` | Bug investigation flow | E, V |
| `feature-breakdown` | Break features into tasks | P |
| `api-design` | Design RESTful APIs | P, R |
| `security-audit` | Security review checklist | R, V |

```bash
npx @ai-coders/context skill init           # Initialize skills
npx @ai-coders/context skill fill           # Fill skills with AI (project-specific content)
npx @ai-coders/context skill list           # List available skills
npx @ai-coders/context skill export         # Export to AI tools
npx @ai-coders/context skill create my-skill # Create custom skill
```

### Agent Types

The orchestration system maps tasks to specialized agents:

| Agent | Focus |
|-------|-------|
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


## License

MIT © Vinícius Lana
