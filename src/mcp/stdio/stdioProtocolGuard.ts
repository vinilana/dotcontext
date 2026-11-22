import * as util from 'util';

const originalConsole = {
  log: console.log,
  info: console.info,
  debug: console.debug,
};

let installed = false;

function writeConsoleLineToStderr(...args: unknown[]): void {
  process.stderr.write(`${util.format(...args)}\n`);
}

/**
 * Redirect casual console logging away from stdout while MCP stdio transport runs.
 * JSON-RPC framing must be the only payload on stdout.
 */
export function installMcpStdioProtocolGuard(): void {
  if (installed) {
    return;
  }

  installed = true;
  console.log = writeConsoleLineToStderr as typeof console.log;
  console.info = writeConsoleLineToStderr as typeof console.info;
  console.debug = writeConsoleLineToStderr as typeof console.debug;
}

/** Restores original console sinks; for unit tests only. */
export function resetMcpStdioProtocolGuardForTests(): void {
  if (!installed) {
    return;
  }

  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
  installed = false;
}