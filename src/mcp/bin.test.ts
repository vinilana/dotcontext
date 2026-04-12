const mockRun = jest.fn();
const mockResolveMcpInstallToolSelection = jest.fn();
const mockStartMCPServer = jest.fn();

jest.mock('../cli', () => ({
  MCPInstallService: jest.fn().mockImplementation(() => ({
    run: mockRun,
  })),
  resolveMcpInstallToolSelection: (...args: unknown[]) =>
    mockResolveMcpInstallToolSelection(...args),
}));

jest.mock('./index', () => ({
  startMCPServer: (...args: unknown[]) => mockStartMCPServer(...args),
}));

jest.mock('../utils/processShutdown', () => ({
  registerProcessShutdown: jest.fn(),
}));

import { parseMcpPackageArgs, runMcpPackage } from './bin';

describe('mcp package bin', () => {
  const originalIsTTY = process.stdin.isTTY;
  let stdoutWriteSpy: jest.SpyInstance;
  let stderrWriteSpy: jest.SpyInstance;

  beforeEach(() => {
    mockRun.mockReset();
    mockResolveMcpInstallToolSelection.mockReset();
    mockStartMCPServer.mockReset();
    mockRun.mockResolvedValue({
      filesCreated: 1,
      filesFailed: 0,
      filesSkipped: 0,
      directoriesCreated: 0,
      errors: [],
      warnings: [],
      installations: [
        {
          tool: 'codex',
          toolDisplayName: 'Codex CLI',
          configPath: '/tmp/.codex/config.toml',
          action: 'created',
          dryRun: false,
        },
      ],
    });
    mockResolveMcpInstallToolSelection.mockResolvedValue('codex');
    stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: originalIsTTY,
    });
  });

  it('parses install command arguments', () => {
    expect(
      parseMcpPackageArgs(['install', 'cursor', '--local', '--dry-run', '--verbose'])
    ).toEqual({
      command: 'install',
      tool: 'cursor',
      global: false,
      dryRun: true,
      verbose: true,
    });
  });

  it('defaults to serve mode when no subcommand is provided', () => {
    expect(parseMcpPackageArgs([])).toEqual({
      command: 'serve',
    });
  });

  it('parses serve options without requiring the serve keyword', () => {
    expect(parseMcpPackageArgs(['--repo-path', '/tmp/repo', '--verbose'])).toEqual({
      command: 'serve',
      repoPath: '/tmp/repo',
      verbose: true,
    });
  });

  it('uses interactive tool selection for install when no tool is provided in a TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: true,
    });

    await runMcpPackage(['install']);

    expect(mockResolveMcpInstallToolSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedTool: undefined,
        isInteractive: true,
      })
    );
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'codex',
        global: true,
      })
    );
  });

  it('falls back to non-interactive install selection outside a TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: false,
    });
    mockResolveMcpInstallToolSelection.mockResolvedValue('all');

    await runMcpPackage(['install', '--local']);

    expect(mockResolveMcpInstallToolSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedTool: undefined,
        isInteractive: false,
      })
    );
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'all',
        global: false,
      })
    );
  });
});
