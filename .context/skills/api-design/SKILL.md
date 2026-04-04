---
type: skill
name: MCP Tool Design
description: Design MCP tools and gateway interfaces for the dotcontext server
skillSlug: api-design
phases: [P, R]
generated: 2026-03-18
status: filled
scaffoldVersion: "2.0.0"
---

# MCP Tool Design

Guidance for designing and extending MCP (Model Context Protocol) tools exposed by `AIContextMCPServer` in `src/services/mcp/mcpServer.ts`.

## When to Use

- Adding a new MCP tool or gateway action to the server
- Refactoring the existing 9-tool surface (5 consolidated gateways + 4 dedicated workflow tools)
- Changing Zod input schemas for existing tools
- Adding new resource templates (e.g., `context://`, `file://`, `workflow://`)
- Designing a new gateway handler in `src/services/mcp/gateway/`

## Architecture Overview

The MCP server follows a **consolidated gateway** pattern to minimize cognitive load for AI agents:

```
AIContextMCPServer (mcpServer.ts)
  registerGatewayTools()
    -> explore     (read, list, analyze, search, getStructure)
    -> context     (check, init, fill, fillSingle, listToFill, getMap, buildSemantic, scaffoldPlan)
    -> sync        (exportRules, exportDocs, exportAgents, exportContext, exportSkills, reverseSync, importDocs, importAgents, importSkills)
    -> plan        (link, getLinked, getDetails, getForPhase, updatePhase, recordDecision, updateStep, getStatus, syncMarkdown, commitPhase)
    -> agent       (discover, getInfo, orchestrate, getSequence, getDocs, getPhaseDocs, listTypes)
    -> skill       (list, getContent, getForPhase, scaffold, export, fill)
    -> workflow-init / workflow-status / workflow-advance / workflow-manage
```

Each gateway dispatches to a handler in `src/services/mcp/gateway/<name>.ts`. The handler receives typed params and an options object with `repoPath`.

## Instructions

### 1. Decide: New Gateway vs. New Action

- **New action on existing gateway**: Preferred. Add an action variant to the existing `z.enum([...])` and extend the handler switch.
- **New dedicated tool**: Only when the domain is distinct enough to warrant its own tool (like `workflow-*` was split out for clarity).
- **Rule of thumb**: Keep the total tool count under 12 to avoid overwhelming AI agent tool selection.

### 2. Define the Input Schema with Zod

All MCP tool inputs use Zod v4 schemas (imported from `zod`). Follow the existing pattern:

```typescript
inputSchema: {
  action: z.enum(['existingAction', 'newAction'])
    .describe('Action to perform'),
  newParam: z.string().optional()
    .describe('(newAction) What this param does'),
}
```

Key conventions:
- Every parameter gets a `.describe()` with the action prefix in parentheses: `(actionName)`
- Use `z.enum()` for constrained values, `z.array(z.string())` for lists
- Mark all action-specific params as `.optional()` since different actions use different params
- Import shared enums from `../../workflow` (e.g., `PREVC_ROLES`, `AGENT_TYPES`)

### 3. Create the Gateway Handler

Add a new file in `src/services/mcp/gateway/` or extend an existing one:

```typescript
// src/services/mcp/gateway/myGateway.ts
import { createJsonResponse, createErrorResponse, type MCPToolResponse } from './response';

export type MyAction = 'doThing' | 'doOther';

export interface MyParams {
  action: MyAction;
  repoPath?: string;
  // action-specific params
}

export interface MyOptions {
  repoPath: string;
}

export async function handleMy(params: MyParams, options: MyOptions): Promise<MCPToolResponse> {
  switch (params.action) {
    case 'doThing':
      return createJsonResponse({ success: true, message: 'Done' });
    default:
      return createErrorResponse(`Unknown action: ${params.action}`);
  }
}
```

### 4. Response Format

Use the three helpers from `src/services/mcp/gateway/response.ts`:
- `createJsonResponse(data)` -- structured JSON for programmatic consumption
- `createErrorResponse(message)` -- sets `isError: true`
- `createTextResponse(text)` -- plain text for human-readable output

All responses conform to `MCPToolResponse` with `content: [{ type: 'text', text }]`.

### 5. Wire It Up in mcpServer.ts

Register the tool in `registerGatewayTools()` using the `wrap()` helper for automatic action logging:

```typescript
this.server.registerTool('my-tool', {
  description: `Description with action list...`,
  inputSchema: { /* Zod schemas */ }
}, wrap('my-tool', async (params): Promise<MCPToolResponse> => {
  return handleMy(params as MyParams, { repoPath: this.getRepoPath() });
}));
```

### 6. Re-export from gatewayTools.ts

Add your handler, types, and params to the re-export barrel in `src/services/mcp/gatewayTools.ts` and `src/services/mcp/gateway/index.ts`.

### 7. Test

Write tests in `src/services/mcp/` following the pattern in `mcpServer.test.ts`. Since MCP tools require stdio transport, test the handler functions directly:

```typescript
import { handleMy } from './gateway/myGateway';

it('should handle doThing action', async () => {
  const result = await handleMy(
    { action: 'doThing' },
    { repoPath: tempDir }
  );
  const payload = JSON.parse(result.content[0].text);
  expect(payload.success).toBe(true);
});
```

## Design Checklist

- [ ] Action names are verbs or verb phrases (e.g., `getStatus`, `buildSemantic`, `exportRules`)
- [ ] All params have `.describe()` annotations with action prefix
- [ ] Handler returns `MCPToolResponse` via response helpers
- [ ] `repoPath` resolution uses `this.getRepoPath(params.repoPath)` for caching
- [ ] Tool description includes a complete action list for AI discoverability
- [ ] New types are exported through the gateway barrel file
- [ ] Action logging works via the `wrap()` helper
- [ ] Total tool count stays manageable (currently 9)

## Common Pitfalls

- **Do not** use `process.cwd()` directly in handlers; always use the `repoPath` from options
- **Do not** add required params that are only needed for one action; use `.optional()` and validate inside the handler
- **Do not** return raw errors; wrap them with `createErrorResponse()` for consistent error shape
- **Do not** log to stdout in MCP mode; use `process.stderr.write()` to avoid corrupting the MCP protocol
