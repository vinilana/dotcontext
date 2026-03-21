---
slug: error-handling
category: operations
status: filled
generatedAt: 2026-03-18T21:32:54.231Z
relevantFiles:
  - src/workflow/errors.ts
  - src/services/shared/types.ts
  - src/services/mcp/gateway/response.ts
  - src/services/mcp/mcpServer.ts
---

# How are errors handled?

## Overview

Error handling in this project follows three patterns depending on the context: workflow errors (custom error classes), operation result errors (structured result objects), and MCP tool errors (structured responses returned through the MCP server).

## 1. Workflow errors (`src/workflow/errors.ts`)

The PREVC workflow engine uses a class hierarchy for typed errors:

- **`WorkflowError`** -- Base error class for all workflow-related failures.
- **`WorkflowGateError`** -- Thrown when a workflow gate blocks a phase transition. Carries the `transition` (from/to phases), the `gate` type, and a human-readable `hint` for resolution.
- **`NoPlanToApproveError`** -- Thrown when attempting to approve a plan that has not been linked.
- **`NoWorkflowError`** -- Thrown when a workflow operation is attempted but no workflow exists.

All workflow errors extend the native `Error` class and set a descriptive `name` property for easy identification in catch blocks.

## 2. Operation result errors (`src/services/shared/types.ts`)

File-based operations (import, export, sync) use an `OperationResult` pattern instead of throwing:

```typescript
interface OperationResult {
  filesCreated: number;
  filesSkipped: number;
  filesFailed: number;
  errors: OperationError[];
}

interface OperationError {
  file: string;
  error: string;
}
```

The `addError()` helper increments `filesFailed` and appends an `OperationError` entry. Multiple results can be merged with `mergeResults()`. This pattern allows batch operations to continue processing after individual file failures and report all errors at the end.

## 3. MCP tool errors (`src/services/mcp/gateway/response.ts`)

MCP gateway handlers return structured error payloads through shared response helpers:

```typescript
interface MCPToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}
```

The error helper serializes responses like:

```json
{
  "success": false,
  "error": "Human-readable message"
}
```

`createErrorResponse()` sets `isError: true` and wraps the JSON payload in MCP-compatible text content. At the server boundary, `src/services/mcp/mcpServer.ts` validates tool input with Zod and catches handler failures before returning them to the client.

## 4. CLI-level error handling

At the CLI level (`src/index.ts`), errors from services are caught and displayed to the user through the `CLIInterface` (`ui`) which formats output with chalk colors. Unhandled promise rejections and uncaught exceptions will cause the process to exit with a non-zero code.

## General conventions

- **Do not throw for expected batch failures** -- Use `OperationResult` to accumulate errors when processing multiple files.
- **Throw custom error classes for workflow violations** -- Callers can use `instanceof` to handle specific workflow error types.
- **Return structured error responses in MCP mode** -- Gateway handlers should use the shared response helpers instead of leaking raw exceptions to the client.
- **Include actionable hints** -- `WorkflowGateError` includes a `hint` field to guide users toward resolution.
