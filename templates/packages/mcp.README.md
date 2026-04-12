# @dotcontext/mcp

Model Context Protocol adapter for dotcontext.

This package owns:

- the MCP server binary
- the MCP installer command surface
- MCP tool registration
- request/response translation for the harness runtime

It exposes the harness over MCP and should remain thinner than the runtime it serves.

## Usage

```bash
# Install MCP configuration into supported AI tools
npx @dotcontext/mcp install

# Start the MCP server directly
npx -y @dotcontext/mcp@latest
```
