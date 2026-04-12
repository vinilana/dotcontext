import { parseMcpPackageArgs } from './bin';

describe('mcp package bin', () => {
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
});
