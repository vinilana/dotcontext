import {
  installMcpStdioProtocolGuard,
  resetMcpStdioProtocolGuardForTests,
} from '../stdioProtocolGuard';

describe('installMcpStdioProtocolGuard', () => {
  let stdoutWriteSpy: jest.SpyInstance;
  let stderrWriteSpy: jest.SpyInstance;

  beforeEach(() => {
    resetMcpStdioProtocolGuardForTests();
    stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    resetMcpStdioProtocolGuardForTests();
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
  });

  it('routes console.info away from stdout', () => {
    installMcpStdioProtocolGuard();

    console.info('[AutoCommit] Created commit abc123 for phase phase-1');

    const stdout = stdoutWriteSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
    const stderr = stderrWriteSpy.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(stdout).not.toContain('[AutoCommit]');
    expect(stderr).toContain('[AutoCommit] Created commit abc123 for phase phase-1');
  });

  it('is idempotent', () => {
    installMcpStdioProtocolGuard();
    installMcpStdioProtocolGuard();

    console.log('diagnostic');

    expect(stdoutWriteSpy).not.toHaveBeenCalled();
    expect(stderrWriteSpy.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('diagnostic');
  });
});