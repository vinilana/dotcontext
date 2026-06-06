// The MCP install service is an operator-facing concern and lives on the CLI
// surface (`src/cli/services/mcpInstallService`). The harness intentionally
// does not re-export it — harness must not depend on cli. Only the shared
// tool registry, which both surfaces build on, is exposed here.
export * from '../../../../shared/registry/toolRegistry';
