#!/usr/bin/env node

/**
 * Dedicated MCP adapter binary.
 *
 * This is the future package entrypoint for `@dotcontext/mcp`.
 */

import { startMCPServer } from './index';

async function main(): Promise<void> {
  const server = await startMCPServer();

  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
