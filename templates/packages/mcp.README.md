# @dotcontext/mcp

Model Context Protocol adapter for dotcontext.

This package owns:

- the MCP server binary
- MCP tool registration
- request/response translation for the harness runtime

It exposes the harness over MCP and should remain thinner than the runtime it serves.
