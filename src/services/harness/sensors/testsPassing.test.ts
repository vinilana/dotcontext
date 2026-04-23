import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { executeTestsPassing } from './testsPassing';

describe('tests-passing sensor', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tests-passing-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  function nodeScript(body: string): string[] {
    return ['node', '-e', body];
  }

  it('passes when jest-style JSON shows zero failures and exit 0', async () => {
    const json = JSON.stringify({
      numPassedTests: 5,
      numFailedTests: 0,
      numTotalTestSuites: 2,
      testResults: [],
    });
    const result = await executeTestsPassing(tempDir, {
      sessionId: 's',
      context: { kind: 'jest', testCommand: nodeScript(`process.stdout.write(${JSON.stringify(json)})`) },
    });
    expect(result.status).toBe('passed');
    const out = result.output as { numPassedTests: number; numFailedTests: number };
    expect(out.numPassedTests).toBe(5);
    expect(out.numFailedTests).toBe(0);
  });

  it('fails when jest JSON reports failed tests and captures failure names', async () => {
    const json = JSON.stringify({
      numPassedTests: 1,
      numFailedTests: 2,
      numTotalTestSuites: 1,
      testResults: [
        {
          assertionResults: [
            { status: 'passed', fullName: 'a passes' },
            { status: 'failed', fullName: 'b fails', failureMessages: ['expected true'] },
            { status: 'failed', fullName: 'c fails', failureMessages: ['boom'] },
          ],
        },
      ],
    });
    // Exit 1 to simulate jest non-zero exit on failures.
    const result = await executeTestsPassing(tempDir, {
      sessionId: 's',
      context: {
        kind: 'jest',
        testCommand: nodeScript(`process.stdout.write(${JSON.stringify(json)}); process.exit(1)`),
      },
    });
    expect(result.status).toBe('failed');
    const out = result.output as { failures: Array<{ name: string }>; numFailedTests: number };
    expect(out.numFailedTests).toBe(2);
    expect(out.failures.map((f) => f.name)).toEqual(['b fails', 'c fails']);
  });

  it('fails clearly when jest output is malformed', async () => {
    const result = await executeTestsPassing(tempDir, {
      sessionId: 's',
      context: { kind: 'jest', testCommand: nodeScript(`process.stdout.write("not json at all")`) },
    });
    expect(result.status).toBe('failed');
    expect(result.summary).toMatch(/could not parse jest --json output/);
  });

  it('exit-code mode passes on exit 0 and fails otherwise', async () => {
    const ok = await executeTestsPassing(tempDir, {
      sessionId: 's',
      context: { kind: 'exit-code', testCommand: nodeScript('process.exit(0)') },
    });
    expect(ok.status).toBe('passed');

    const bad = await executeTestsPassing(tempDir, {
      sessionId: 's',
      context: { kind: 'exit-code', testCommand: nodeScript('process.exit(2)') },
    });
    expect(bad.status).toBe('failed');
    expect(bad.summary).toContain('exit 2');
  });
});
