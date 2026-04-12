#!/usr/bin/env node

/**
 * Dedicated MCP package binary for `@dotcontext/mcp`.
 *
 * Default behavior starts the MCP server.
 * `install` configures supported AI tools to use this package as the MCP server.
 */

import { startMCPServer } from './index';
import { registerProcessShutdown } from '../utils/processShutdown';
import { MCPInstallService } from '../services/cli/mcpInstallService';
import { VERSION } from '../version';

type ParsedArgs = {
  command: 'serve' | 'install' | 'help';
  tool?: string;
  repoPath?: string;
  verbose?: boolean;
  dryRun?: boolean;
  global?: boolean;
};

const mockTranslate = (key: string) => key;

const consoleUI = {
  displayWelcome: () => {},
  displayError: (message: string, error?: Error) => {
    const details = error ? `\n${error.message}` : '';
    process.stderr.write(`${message}${details}\n`);
  },
  displaySuccess: (message: string) => {
    process.stdout.write(`${message}\n`);
  },
  displayInfo: (title: string, message: string) => {
    process.stdout.write(`${title}: ${message}\n`);
  },
  displayWarning: (message: string) => {
    process.stderr.write(`${message}\n`);
  },
  displayList: () => {},
  displayTable: () => {},
  displayJson: () => {},
  displayProjectConfiguration: () => {},
  displayFileTypeDistribution: () => {},
  displayGenerationSummary: () => {},
  startSpinner: () => {},
  updateSpinner: () => {},
  stopSpinner: () => {},
  displayAnalysisComplete: () => {},
  displayBox: () => {},
  displaySection: () => {},
  displayStep: () => {},
  displayDiff: () => {},
  displaySkillHeader: () => {},
  displaySkillDefinition: () => {},
  displaySkillExamples: () => {},
  displaySkillContent: () => {},
} as any;

export function parseMcpPackageArgs(argv: string[]): ParsedArgs {
  const args = [...argv];
  const first = args[0];

  if (!first || first === 'serve') {
    return parseServeArgs(first === 'serve' ? args.slice(1) : args);
  }

  if (first === 'install') {
    return parseInstallArgs(args.slice(1));
  }

  if (first === '--help' || first === '-h' || first === 'help') {
    return { command: 'help' };
  }

  if (first.startsWith('-')) {
    return parseServeArgs(args);
  }

  return { command: 'help' };
}

function parseServeArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = { command: 'serve' };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--repo-path' || arg === '-r') && args[i + 1]) {
      parsed.repoPath = args[++i];
      continue;
    }
    if (arg === '--verbose' || arg === '-v') {
      parsed.verbose = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      return { command: 'help' };
    }
  }

  return parsed;
}

function parseInstallArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: 'install',
    global: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!arg.startsWith('-') && !parsed.tool) {
      parsed.tool = arg;
      continue;
    }

    if (arg === '--local' || arg === '-l') {
      parsed.global = false;
      continue;
    }

    if (arg === '--global' || arg === '-g') {
      parsed.global = true;
      continue;
    }

    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }

    if (arg === '--verbose' || arg === '-v') {
      parsed.verbose = true;
      continue;
    }

    if ((arg === '--repo-path' || arg === '-r') && args[i + 1]) {
      parsed.repoPath = args[++i];
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      return { command: 'help' };
    }
  }

  return parsed;
}

function printHelp(): void {
  process.stdout.write(`@dotcontext/mcp

Usage:
  npx @dotcontext/mcp install [tool] [--local|--global] [--dry-run] [--verbose]
  npx -y @dotcontext/mcp@latest [serve] [--repo-path <path>] [--verbose]

Examples:
  npx @dotcontext/mcp install
  npx @dotcontext/mcp install codex
  npx @dotcontext/mcp install cursor --local
  npx -y @dotcontext/mcp@latest
`);
}

async function runInstallCommand(args: ParsedArgs): Promise<void> {
  const service = new MCPInstallService({
    ui: consoleUI,
    t: mockTranslate as any,
    version: VERSION,
  });

  const result = await service.run({
    tool: args.tool,
    global: args.global,
    dryRun: args.dryRun,
    verbose: args.verbose,
    repoPath: args.repoPath || process.cwd(),
  });

  if (args.tool && result.installations.length === 0) {
    process.exit(1);
  }

  if (result.installations.length === 0 && result.filesFailed > 0) {
    process.exit(1);
  }
}

async function runServeCommand(args: ParsedArgs): Promise<void> {
  const server = await startMCPServer({
    repoPath: args.repoPath,
    verbose: args.verbose,
  });

  registerProcessShutdown(server, {
    onError: (error) => {
      if (args.verbose) {
        process.stderr.write(`[mcp] Shutdown error: ${error}\n`);
      }
    },
    exit: (code) => process.exit(code),
  });
}

export async function runMcpPackage(argv: string[]): Promise<void> {
  const parsed = parseMcpPackageArgs(argv);

  if (parsed.command === 'help') {
    printHelp();
    return;
  }

  if (parsed.command === 'install') {
    await runInstallCommand(parsed);
    return;
  }

  await runServeCommand(parsed);
}

if (require.main === module) {
  void runMcpPackage(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
