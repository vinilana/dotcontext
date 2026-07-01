# @dotcontext/cli

Operator-facing package for dotcontext.

This package owns:

- the `dotcontext` binary
- local operator workflows
- MCP installation into supported tools
- sync, reverse-sync, import/export, and workflow UX
- the bundled local web dashboard (`dotcontext web`)

It depends on the harness and MCP boundaries but is the user-facing entrypoint.

## Web dashboard

```bash
dotcontext web
dotcontext web --no-open
```

The package includes the built React assets under `web-ui/dist`; users do not need the source `web-ui/` workspace to run the dashboard.
