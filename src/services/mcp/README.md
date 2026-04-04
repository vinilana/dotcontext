# MCP Tools Reference

## Simplified Tool Structure

The MCP tools follow a simple, explicit pattern:

1. **Scaffolding**: `context({ action: "init" })`
2. **Content**: `context({ action: "fillSingle", filePath })`
3. **Workflow**: `workflow-init({ name: "feature-name" })`

## Available Tools (9 total)

### Gateway Tools (5)

| Tool | Description |
|------|-------------|
| `explore` | File and code exploration (read, list, analyze, search, getStructure) |
| `context` | Context scaffolding and semantic context (check, init, fill, fillSingle, listToFill, getMap, buildSemantic, scaffoldPlan) |
| `sync` | Import/export synchronization with AI tools |
| `plan` | Plan management and execution tracking |
| `agent` | Agent orchestration and discovery |
| `skill` | Skill management for on-demand expertise |

### Dedicated Workflow Tools (4)

| Tool | Description |
|------|-------------|
| `workflow-init` | Initialize a PREVC workflow (creates `.context/workflow/`) |
| `workflow-status` | Get current workflow status |
| `workflow-advance` | Advance to next phase |
| `workflow-manage` | Manage handoffs, collaboration, documents, gates |

## Tool Decision Tree

### Step 1: Create Scaffolding

```
Does .context/ folder exist?
├─ No → Use context({ action: "init" })
│   ├─ Creates .context/docs/ templates
│   ├─ Creates .context/agents/ playbooks
│   ├─ Creates .context/skills/ definitions
│   └─ Returns list of files needing content
└─ Yes → Skip to Step 2
```

### Step 2: Fill Content (Optional but Recommended)

```
Do the template files have content?
├─ No → Fill in order docs -> skills -> agents:
│   └─ Use context({ action: "fillSingle", filePath: "path" })
│       ├─ Returns semantic context from codebase
│       ├─ Returns scaffold structure with guidance
│       └─ AI generates content based on context
└─ Yes → Skip to Step 3
```

### Step 3: Initialize Workflow

```
Do you need structured development?
├─ Yes → Use workflow-init({ name: "feature-name" })
│   ├─ Creates .context/workflow/ folder
│   ├─ Initializes phase tracking
│   └─ Configures gates based on scale
└─ No → Start coding directly
```

## Tool Relationships

```
Simplified Flow:
  context({ action: "init" })
    └─ Returns: pendingFiles[]
       └─ For each file in order docs -> skills -> agents:
          └─ context({ action: "fillSingle", filePath })
             └─ Write enhanced content
                └─ workflow-init({ name: "feature" })
                   └─ Start development
```

## Key Points

- **No all-in-one tool**: Each step is explicit
- **Composable**: Mix and match based on needs
- **workflow-init creates folder**: No manual folder creation needed
- **Skip workflow for trivial changes**: Typos, simple edits don't need workflow
- **context init does NOT create workflow folder**: Use workflow-init for that

## What Each Tool Creates

| Tool | Creates |
|------|---------|
| `context({ action: "init" })` | `.context/docs/`, `.context/agents/`, `.context/skills/` |
| `workflow-init({ name })` | `.context/workflow/` |

## Removed Tools

The following tools have been removed in favor of the simplified pattern:

- `project-setup` - Use `context({ action: "init" })` + `workflow-init` instead
- `project-report` - Use `context({ action: "getMap" })` for codebase info

## Migration Guide

If you were using `project-setup`, here's how to migrate:

**Before (all-in-one):**
```
project-setup({ featureName: "my-feature", template: "feature" })
```

**After (explicit steps):**
```
1. context({ action: "init" })              // Create scaffolding
2. context({ action: "fillSingle", ... })   // Fill each file
3. workflow-init({ name: "my-feature" })    // Start workflow
```

This gives you more control and makes each step's purpose clear.
