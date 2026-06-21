# @dotcontext/integrations

Host hook integrations for dotcontext.

This package exposes adapters and event mappers for supported AI coding hosts:

- Claude Code hooks
- Codex CLI hooks
- Pi extension (`pi-dev`)

Integrations call the harness runtime only and never import CLI or MCP surfaces.

## Usage

```typescript
import { createPiDevHookAdapter, mapPiEvent } from '@dotcontext/integrations/pi-dev';
```

See `@dotcontext/pi` for the Pi npm extension package.
