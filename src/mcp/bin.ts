#!/usr/bin/env node

/**
 * Dedicated MCP adapter binary.
 *
 * This is the future package entrypoint for `@dotcontext/mcp`.
 */

import { startMCPServer } from './index';
import { registerProcessShutdown } from '../utils/processShutdown';

async function main(): Promise<void> {
  const server = await startMCPServer();

  registerProcessShutdown(server, {
    onError: (error) => {
      console.error(error instanceof Error ? error.message : String(error));
    },
    exit: (code) => process.exit(code),
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
