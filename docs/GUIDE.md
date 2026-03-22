# AI Coders Context - User Guide

A comprehensive guide on how to use `@dotcontext/cli` for AI-assisted software development.

## Table of Contents

- [Overview](#overview)
- [When to Use](#when-to-use)
- [Getting Started](#getting-started)
- [Core Features](#core-features)
- [PREVC Workflow](#prevc-workflow)
- [Quick Sync](#quick-sync)
- [Skills System](#skills-system)
- [Agent Orchestration](#agent-orchestration)
- [MCP Integration](#mcp-integration)
- [Best Practices](#best-practices)

---

## Overview

`@dotcontext/cli` is a context engineering tool that helps AI coding assistants understand your codebase better. It creates structured documentation, generates agent playbooks, and provides a workflow system for organized development.

> Note: standalone CLI generation is no longer supported. Use MCP-enabled AI tools to create, fill, or refresh context, plans, agents, and skills.

### Key Capabilities

| Capability | Description |
|------------|-------------|
| **Context Generation** | Creates `.context/` folder with docs and agent playbooks |
| **PREVC Workflow** | 5-phase structured development workflow |
| **Agent Orchestration** | Maps tasks to specialized AI agents |
| **MCP Server** | Integrates with Claude, Cursor, Windsurf, Antigravity, Trae, and more |

---

## When to Use

### Use This Tool When...

| Scenario | Command |
|----------|---------|
| Starting a new project | `npx @dotcontext/cli mcp:install` then initialize through your AI tool |
| Onboarding AI to your codebase | Configure MCP and initialize context in your AI tool |
| Documentation is outdated | Refresh via MCP in your AI tool |
| Planning a new feature | Use MCP plan tools in your AI tool |
| Starting structured development | `npx @dotcontext/cli workflow init` |
| Need AI assistance in IDE | Configure MCP server |

### Decision Matrix

```
Need AI to understand my code?
├── Yes → Configure MCP and initialize through your AI tool
└── No  → Use workflow, sync, and import commands only

Starting new feature/project?
├── Simple task → Use QUICK scale
├── Regular feature → Use MEDIUM scale
└── Large project → Use LARGE scale

Using Claude/Cursor/Windsurf/Antigravity/Trae?
├── Yes → Configure MCP server
└── No  → Use CLI commands
```

---

## Getting Started

### Quick Start (Interactive)

```bash
npx @dotcontext/cli
```

This launches the interactive wizard that guides you through all options.

### Quick Start (Automation)

```bash
# 1. Connect your AI tool through MCP
npx @dotcontext/cli mcp:install

# 2. Ask your AI tool to initialize context

# 3. Start a workflow when needed (optional)
npx @dotcontext/cli workflow init "my-feature"
```

### Project Structure After Init

```
your-project/
├── .context/
│   ├── docs/
│   │   ├── README.md           # Documentation index
│   │   ├── architecture.md     # System architecture
│   │   ├── data-flow.md        # Data flow documentation
│   │   └── glossary.md         # Domain terms
│   ├── agents/
│   │   ├── README.md           # Agent playbooks index
│   │   ├── code-reviewer.md    # Code review guidelines
│   │   ├── feature-developer.md # Feature development guide
│   │   └── ...                 # Other agent playbooks
│   └── workflow/
│       └── status.yaml         # PREVC workflow status
└── ...
```

---

## Core Features

### 1. MCP-Based Context Initialization

Create the `.context/` structure through MCP-connected AI tools, not through standalone CLI commands.

Recommended flow:

```bash
npx @dotcontext/cli mcp:install
```

Then ask your AI tool to initialize, fill, or refresh the generated context.

### 2. Workflow and Utility CLI

The standalone CLI remains useful for:

- PREVC workflow tracking
- sync/export operations
- reverse sync and imports
- MCP setup and server startup

### 3. Plan Creation

Plan scaffolding is also MCP-based now. Use the MCP plan/context tools from your AI assistant when you need a new plan.

Creates `.context/plans/authentication-system.md` with:
- Objectives
- Tasks breakdown
- Dependencies
- Acceptance criteria

---

## PREVC Workflow

A structured 5-phase development workflow that scales with your project.

### The 5 Phases

| Phase | Name | Focus | Roles |
|-------|------|-------|-------|
| **P** | Planning | Requirements, specifications | Planner, Designer |
| **R** | Review | Architecture, technical decisions | Architect |
| **E** | Execution | Implementation, coding | Developer |
| **V** | Validation | Testing, QA, code review | QA, Reviewer |
| **C** | Confirmation | Documentation, deployment | Documentor |

### Scale-Adaptive Routing

The workflow adapts to your project size:

| Scale | Phases | When to Use |
|-------|--------|-------------|
| **QUICK** | E → V | Bug fixes, small tweaks |
| **SMALL** | P → E → V | Simple features, minor additions |
| **MEDIUM** | P → R → E → V | Regular features |
| **LARGE** | P → R → E → V → C | Full products, major features |

### Workflow Commands

```bash
# Initialize a new workflow
npx @dotcontext/cli workflow init "feature-name"

# Check current status
npx @dotcontext/cli workflow status

# Advance to next phase
npx @dotcontext/cli workflow advance

# Interactive workflow management
npx @dotcontext/cli workflow
```

### Workflow Status File

Located at `.context/workflow/status.yaml`:

```yaml
project:
  name: "feature-authentication"
  scale: MEDIUM
  started: "2026-01-11T10:00:00Z"
  current_phase: E

phases:
  P:
    status: completed
    outputs:
      - path: ".context/workflow/docs/prd.md"
  R:
    status: completed
  E:
    status: in_progress
    role: desenvolvedor
  V:
    status: pending
  C:
    status: skipped
```

### Phase Transitions

```
Planning (P)
    │
    ▼ outputs: PRD, Tech Spec
Review (R)
    │
    ▼ outputs: Architecture, ADRs
Execution (E)
    │
    ▼ outputs: Code, Unit Tests
Validation (V)
    │
    ▼ outputs: Test Report, Approval
Confirmation (C)
    │
    ▼ outputs: Documentation, Changelog
```

---

## Plan-Workflow Integration

Plans can be linked to the PREVC workflow for structured execution.

### Linking Plans to Workflow

```bash
# Create a plan through MCP in your AI tool

# Then start or continue workflow tracking from the CLI
npx @dotcontext/cli workflow init "authentication-system"
```

### Plan Frontmatter

Plans include PREVC phase mapping and agent lineup:

```yaml
---
title: Authentication System
status: unfilled
prevc_phases:
  - P  # Planning
  - R  # Review
  - E  # Execution
agents:
  - type: architect-specialist
    phase: R
  - type: feature-developer
    phase: E
  - type: security-auditor
    phase: V
docs:
  - architecture.md
  - security.md
---
```

### MCP Tools for Plans

| Tool | Description |
|------|-------------|
| `linkPlan` | Link a plan file to current workflow |
| `getLinkedPlans` | Get all linked plans |
| `getPlanDetails` | Get plan details with agent lineup |
| `getPlansForPhase` | Get plans for a PREVC phase |
| `updatePlanPhase` | Update plan phase status |
| `recordDecision` | Record a plan decision |

---

## Quick Sync

Quick Sync provides a unified way to export agents, skills, and documentation to all your AI tools at once.

### Why Quick Sync?

Different AI tools store context in different locations:

| Tool | Agents | Skills | Rules |
|------|--------|--------|-------|
| Claude | `.claude/agents/` | `.claude/skills/` | `CLAUDE.md` |
| Cursor | `.cursor/agents/` | - | `.cursorrules` |
| Windsurf | `.windsurf/agents/` | - | `.windsurf/rules/` |
| Cline | `.cline/agents/` | - | `.clinerules` |
| Antigravity | `.agent/agents/` | `.agent/workflows/` | `.agent/rules/` |
| Trae | `.trae/agents/` | - | `.trae/rules/` |
| Codex | - | `.codex/skills/` | - |
| Gemini | - | `.gemini/skills/` | - |
| Aider | - | - | `CONVENTIONS.md` |
| Universal | - | - | `AGENTS.md` |

Quick Sync handles all of this automatically.

### Quick Sync Commands

```bash
# Sync everything to all tools
npx @dotcontext/cli quick-sync

# Sync specific components
npx @dotcontext/cli quick-sync --components agents
npx @dotcontext/cli quick-sync --components skills
npx @dotcontext/cli quick-sync --components docs
npx @dotcontext/cli quick-sync --components agents,skills

# Sync to specific tools
npx @dotcontext/cli quick-sync --targets claude
npx @dotcontext/cli quick-sync --targets claude,cursor,github

# Combine options
npx @dotcontext/cli quick-sync --components agents --targets claude,github

# Preview changes without writing
npx @dotcontext/cli quick-sync --dry-run
```

### Interactive Mode

When running interactively, Quick Sync offers:

1. **Component Selection** - Multi-select which components to sync (agents, skills, docs)
2. **Agent Target Selection** - Choose where to sync agents (claude, cursor, github, windsurf, cline)
3. **Skill Target Selection** - Choose where to export skills (claude, gemini, codex)
4. **Doc Target Selection** - Choose rule export targets:
   - `.cursorrules` (Cursor AI)
   - `CLAUDE.md` (Claude Code)
   - `AGENTS.md` (Universal - supported by most AI tools)
   - `.windsurfrules` (Windsurf)
   - `.clinerules` (Cline)
   - `CONVENTIONS.md` (Aider)
5. **Preview** - See what will be synced before confirming

### Components

| Component | Source | Description |
|-----------|--------|-------------|
| `agents` | `.context/agents/` | Agent playbooks |
| `skills` | `.context/skills/` | Skill definitions |
| `docs` | `.context/docs/` | Documentation rules |

### Targets

| Target | Description |
|--------|-------------|
| `claude` | Claude Code and Claude Desktop |
| `cursor` | Cursor AI |
| `github` | GitHub Copilot |
| `windsurf` | Windsurf |
| `cline` | Cline VS Code extension |
| `antigravity` | Google Antigravity |
| `trae` | Trae AI |
| `codex` | OpenAI Codex CLI |
| `aider` | Aider |
| `agents` | Universal AGENTS.md (works with most AI tools) |
| `all` | All supported tools |

---

## Skills System

Skills are on-demand expertise modules that AI agents can activate when needed. Unlike agent playbooks (which define persistent behavior), skills are task-specific procedures.

### Built-in Skills

| Skill | Description | Phases |
|-------|-------------|--------|
| `commit-message` | Generate conventional commit messages | E, C |
| `pr-review` | Review PRs against coding standards | R, V |
| `code-review` | Code quality and best practices review | R, V |
| `test-generation` | Generate test cases and suites | E, V |
| `documentation` | Generate/update documentation | P, C |
| `refactoring` | Safe refactoring procedures | E |
| `bug-investigation` | Bug investigation workflow | E, V |
| `feature-breakdown` | Break features into tasks | P |
| `api-design` | Design RESTful APIs | P, R |
| `security-audit` | Security review checklist | R, V |

### Skill Commands

```bash
# List all available skills
npx @dotcontext/cli skill list

# Export skills to AI tools (.claude/skills/, .gemini/skills/, .codex/skills/)
npx @dotcontext/cli skill export
```

To scaffold, personalize, or refresh skills, use the MCP `scaffoldSkills` and `fillSkills` tools from your connected AI assistant. The standalone CLI only supports skill discovery/export utilities now.

### Skill Structure

Each skill is stored in `.context/skills/{skill-name}/SKILL.md`:

```markdown
---
name: commit-message
description: Generate conventional commit messages
phases: [E, C]
---

# Commit Message Skill

## When to Use
Use this skill when creating Git commits...

## Instructions
1. Analyze the staged changes
2. Follow conventional commit format
3. Reference project-specific patterns...

## Examples
Based on your project's patterns:
- `feat(auth): add OAuth2 login flow`
- `fix(api): resolve rate limiting issue`
```

### MCP Tools for Skills

| Tool | Description |
|------|-------------|
| `listSkills` | List all available skills |
| `getSkillContent` | Get full SKILL.md content |
| `getSkillsForPhase` | Get skills for a PREVC phase |
| `scaffoldSkills` | Create skill scaffolds |
| `fillSkills` | Fill skills with AI-generated content |
| `exportSkills` | Export to AI tool directories |

---

## Agent Orchestration

The orchestration system maps tasks to specialized AI agents.

### Available Agents

| Agent | Specialty | Best For |
|-------|-----------|----------|
| `architect-specialist` | System design | Architecture decisions |
| `feature-developer` | New features | Implementing functionality |
| `bug-fixer` | Bug resolution | Fixing issues |
| `test-writer` | Testing | Writing test suites |
| `code-reviewer` | Code quality | Review and feedback |
| `security-auditor` | Security | Vulnerability detection |
| `performance-optimizer` | Performance | Speed optimization |
| `documentation-writer` | Documentation | Technical writing |
| `backend-specialist` | Server-side | APIs, services |
| `frontend-specialist` | Client-side | UI/UX implementation |
| `database-specialist` | Data layer | Schema, queries |
| `devops-specialist` | Operations | CI/CD, deployment |
| `mobile-specialist` | Mobile apps | iOS/Android development |
| `refactoring-specialist` | Code quality | Restructuring code |

### Agent-to-Phase Mapping

| Phase | Primary Agents |
|-------|----------------|
| **P** | architect-specialist, documentation-writer |
| **R** | architect-specialist, code-reviewer, security-auditor |
| **E** | feature-developer, backend-specialist, frontend-specialist |
| **V** | test-writer, code-reviewer, security-auditor |
| **C** | documentation-writer, devops-specialist |

### Task-Based Selection

The orchestrator selects agents based on task keywords:

```
"fix authentication bug" → bug-fixer, security-auditor
"implement payment API" → feature-developer, backend-specialist
"optimize database queries" → performance-optimizer, database-specialist
"add unit tests" → test-writer
```

### Custom Agents

You can create custom agent playbooks in `.context/agents/`:

```
.context/agents/
├── README.md
├── code-reviewer.md      # Built-in
├── feature-developer.md  # Built-in
└── marketing-agent.md    # Custom
```

Custom agents are automatically discovered and can be referenced in plans:

```yaml
agents:
  - type: marketing-agent  # Custom agent
    phase: P
  - type: feature-developer  # Built-in agent
    phase: E
```

### Agent Discovery MCP Tools

| Tool | Description |
|------|-------------|
| `discoverAgents` | List all agents (built-in + custom) |
| `getAgentInfo` | Get agent metadata and content |

---

## MCP Integration

Connect with AI coding assistants via Model Context Protocol.

### Setup for Different Tools

#### Claude Code (CLI)

```bash
claude mcp add dotcontext -- npx @dotcontext/cli mcp
```

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dotcontext": {
      "command": "npx",
      "args": ["@dotcontext/cli", "mcp"]
    }
  }
}
```

#### Cursor AI

Create `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "dotcontext": {
      "command": "npx",
      "args": ["@dotcontext/cli", "mcp"]
    }
  }
}
```

#### Local Development

For developing/testing locally:

```json
{
  "mcpServers": {
    "dotcontext-dev": {
      "command": "node",
      "args": ["/path/to/dotcontext-cli/dist/index.js", "mcp"]
    }
  }
}
```

### Available MCP Tools

#### Context Tools

| Tool | Description |
|------|-------------|
| `buildSemanticContext` | Build optimized context for prompts |
| `initializeContext` | Create `.context` scaffolding |
| `fillScaffolding` | Generate documentation content |
| `getCodebaseMap` | Get structured codebase data (stack, symbols, architecture) |
| `analyzeSymbols` | Analyze code symbols |
| `searchCode` | Search patterns across files |
| `getFileStructure` | Get directory structure |

#### Workflow Tools

| Tool | Description |
|------|-------------|
| `workflowInit` | Initialize PREVC workflow |
| `workflowStatus` | Get current status |
| `workflowAdvance` | Move to next phase |
| `workflowHandoff` | Transfer between roles |
| `workflowCollaborate` | Multi-agent collaboration |
| `workflowCreateDoc` | Generate phase documents |

#### Orchestration Tools

| Tool | Description |
|------|-------------|
| `orchestrateAgents` | Select agents for task/phase/role |
| `getAgentSequence` | Get agent handoff order |
| `getAgentDocs` | Get docs for an agent |
| `getPhaseDocs` | Get docs for a phase |
| `listAgentTypes` | List all agent types |

---

## Best Practices

### 1. Start with Context

Always initialize context before asking AI for help:

```bash
npx @dotcontext/cli mcp:install
```

### 2. Choose the Right Scale

| Project Type | Scale | Example |
|--------------|-------|---------|
| Hotfix | QUICK | "Fix typo in login" |
| Small feature | SMALL | "Add password reset" |
| Regular feature | MEDIUM | "Implement user dashboard" |
| Major feature | LARGE | "Build payment system" |
| Compliance work | LARGE | "Add GDPR compliance" |

### 3. Keep Documentation Updated

Refresh documentation through your MCP-connected AI tool when the context becomes outdated.

### 4. Use Plans for Complex Work

Before starting complex features, use the MCP plan tools from your AI assistant.

### 5. Follow Phase Outputs

Each phase should produce specific outputs:

| Phase | Expected Outputs |
|-------|------------------|
| P | PRD, Tech Spec, Requirements |
| R | Architecture doc, ADRs |
| E | Code, Unit tests |
| V | Test report, Review approval |
| C | Documentation, Changelog |

### 6. Leverage Agent Specialization

Match tasks to appropriate agents:

- Architecture decisions → `architect-specialist`
- Bug fixes → `bug-fixer`
- New features → `feature-developer`
- Security concerns → `security-auditor`

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "CLI init/plan/fill command not found" | Context creation and generation moved to MCP-enabled AI tools. Run `npx @dotcontext/cli mcp:install` |
| "Context folder not found" | Initialize or import context through MCP or `reverse-sync` |
| "Workflow not initialized" | Run `npx @dotcontext/cli workflow init "name"` |
| MCP tools not appearing | Restart your IDE after configuring MCP |

### Getting Help

- [GitHub Issues](https://github.com/vinilana/ai-coders-context/issues)
- Run `npx @dotcontext/cli --help` for CLI options

---

## Quick Reference

```bash
# Interactive mode
npx @dotcontext/cli

# Install MCP for AI-assisted generation
npx @dotcontext/cli mcp:install

# Workflow management
npx @dotcontext/cli workflow init "name"
npx @dotcontext/cli workflow status
npx @dotcontext/cli workflow advance

# Skills management
npx @dotcontext/cli skill list
npx @dotcontext/cli skill export

# Import existing context from AI tools
npx @dotcontext/cli reverse-sync

# Start MCP server
npx @dotcontext/cli mcp
```
