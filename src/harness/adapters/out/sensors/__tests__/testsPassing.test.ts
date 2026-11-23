import * as fs from 'fs-extra';
import { promises as nativeFs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  executeTestsPassing,
  readJestResultFile,
  runShell,
} from '../testsPassing';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)]!;
}

async function measureRetainedHeapGrowth(operation: () => Promise<void>, iterations = 3): Promise<number> {
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    global.gc?.();
    const before = process.memoryUsage().heapUsed;
    await operation();
    global.gc?.();
    samples.push(process.memoryUsage().heapUsed - before);
  }
  return median(samples);
}

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

  function processExists(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
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

  it('spools complete structured output for custom Jest commands larger than the tail', async () => {
    const json = JSON.stringify({
      irrelevant: 'x'.repeat(30 * 1024),
      numPassedTests: 7,
      numFailedTests: 0,
      numTotalTestSuites: 3,
      testResults: [],
    });
    const result = await executeTestsPassing(tempDir, {
      sessionId: 's',
      context: {
        kind: 'jest',
        testCommand: nodeScript(`process.stdout.write(${JSON.stringify(json)})`),
        tailBytes: 8 * 1024,
      },
    });

    expect(result.status).toBe('passed');
    expect(result.output).toEqual(expect.objectContaining({
      numPassedTests: 7,
      numTotalTestSuites: 3,
    }));
    expect(result.details).toEqual(expect.objectContaining({ outputTruncated: true }));
  });

  it('uses a temporary output file for the default Jest command', async () => {
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      scripts: { test: 'node fake-jest.js' },
    });
    await fs.writeFile(
      path.join(tempDir, 'fake-jest.js'),
      [
        "const fs = require('fs');",
        "const outputFlag = process.argv.indexOf('--outputFile');",
        "const resultPath = process.argv[outputFlag + 1];",
        'fs.writeFileSync(resultPath, JSON.stringify({',
        '  numPassedTests: 3, numFailedTests: 0, numTotalTestSuites: 1, testResults: []',
        '}));',
        "process.stdout.write('bounded console output');",
      ].join('\n')
    );

    const result = await executeTestsPassing(tempDir, { sessionId: 's' });

    expect(result.status).toBe('passed');
    expect(result.output).toEqual(expect.objectContaining({ numPassedTests: 3 }));
    expect(result.details).toEqual(expect.objectContaining({ command: 'npm' }));
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

  it('bounds both console streams while retaining counters', async () => {
    const result = await runShell(
      nodeScript('process.stdout.write("a".repeat(1000)); process.stderr.write("b".repeat(800))'),
      tempDir,
      5_000,
      { tailBytes: 32 }
    );

    expect(Buffer.byteLength(result.stdoutTail)).toBe(32);
    expect(Buffer.byteLength(result.stderrTail)).toBe(32);
    expect(result.stdoutBytes).toBe(1000);
    expect(result.stderrBytes).toBe(800);
    expect(result.outputTruncated).toBe(true);
  });

  it('clamps an enormous caller-controlled context tail to the safe default', async () => {
    const result = await executeTestsPassing(tempDir, {
      sessionId: 's',
      context: {
        kind: 'exit-code',
        testCommand: nodeScript('process.stdout.write("x".repeat(12 * 1024))'),
        tailBytes: Number.MAX_SAFE_INTEGER,
      },
    });

    expect(result.status).toBe('passed');
    expect(result.details).toEqual(expect.objectContaining({
      stdoutBytes: 12 * 1024,
      stdoutDroppedBytes: 4 * 1024,
      outputTruncated: true,
    }));
  });

  it('fails with a stable reason when output exceeds the hard limit', async () => {
    const result = await executeTestsPassing(tempDir, {
      sessionId: 's',
      context: {
        kind: 'exit-code',
        testCommand: nodeScript(
          'const c="x".repeat(4096); for(let i=0;i<10000;i++) process.stdout.write(c)'
        ),
        tailBytes: 128,
        hardOutputLimitBytes: 32 * 1024,
      },
    });

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('outputLimitExceeded');
    expect(result.details).toEqual(expect.objectContaining({
      outputLimitExceeded: true,
      terminationReason: 'outputLimit',
      outputTruncated: true,
    }));
  });

  it('terminates descendants that inherit pipes when the hard limit is exceeded', async () => {
    const pidPath = path.join(tempDir, 'sensor-grandchild.pid');
    const script = [
      "const {spawn}=require('child_process');",
      "const fs=require('fs');",
      "const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});",
      `fs.writeFileSync(${JSON.stringify(pidPath)},String(child.pid));`,
      "const c='x'.repeat(4096); while(true) process.stdout.write(c);",
    ].join('');

    const startedAt = Date.now();
    const result = await runShell(nodeScript(script), tempDir, 10_000, {
      tailBytes: 128,
      hardCombinedOutputBytes: 32 * 1024,
    });
    const grandchildPid = Number(await fs.readFile(pidPath, 'utf8'));

    expect(result.outputLimitExceeded).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(3_000);
    expect(processExists(grandchildPid)).toBe(false);
  });

  it('reports timeout and spawn error termination paths', async () => {
    const timedOut = await executeTestsPassing(tempDir, {
      sessionId: 's',
      context: {
        kind: 'exit-code',
        testCommand: nodeScript('setTimeout(() => {}, 5000)'),
        timeoutMs: 50,
      },
    });
    expect(timedOut.summary).toMatch(/timed out/);
    expect(timedOut.details).toEqual(expect.objectContaining({ terminationReason: 'timeout' }));

    const spawnError = await executeTestsPassing(tempDir, {
      sessionId: 's',
      context: { kind: 'exit-code', testCommand: ['definitely-not-a-real-command-dotcontext'] },
    });
    expect(spawnError.summary).toMatch(/spawn error/);
    expect(spawnError.details).toEqual(expect.objectContaining({ terminationReason: 'spawnError' }));
  });

  it('rejects oversized and malformed Jest result files before parsing', async () => {
    const oversized = path.join(tempDir, 'oversized.json');
    const handle = await nativeFs.open(oversized, 'w');
    await handle.truncate(32 * 1024 * 1024 + 1);
    await handle.close();
    await expect(readJestResultFile(oversized)).resolves.toEqual({ status: 'resultFileTooLarge' });

    const malformed = path.join(tempDir, 'malformed.json');
    await fs.writeFile(malformed, '{not-json');
    await expect(readJestResultFile(malformed)).resolves.toEqual({ status: 'malformed' });
  });

  it('projects a near-limit Jest file without materializing irrelevant fields', async () => {
    const nearLimit = path.join(tempDir, 'near-limit.json');
    const handle = await nativeFs.open(nearLimit, 'w');
    await handle.write('{"numPassedTests":11,"numFailedTests":0,"numTotalTestSuites":4,"irrelevant":"');
    const chunk = 'z'.repeat(64 * 1024);
    for (let index = 0; index < 496; index += 1) await handle.write(chunk);
    await handle.write('","testResults":[]}');
    await handle.close();

    const projected = await readJestResultFile(nearLimit);

    expect(projected).toEqual({
      status: 'ok',
      value: {
        numPassedTests: 11,
        numFailedTests: 0,
        numTotalTestSuites: 4,
        failures: [],
      },
    });

    const heapGrowth = await measureRetainedHeapGrowth(
      async () => { await readJestResultFile(nearLimit); },
      3,
    );
    // The file is ~31 MiB; projection should stay far below a full string plus
    // parsed object. Measure post-GC retained heap (median of several passes) so
    // Node/GC timing noise does not look like a multi-megabyte leak.
    expect(heapGrowth).toBeLessThan(16 * 1024 * 1024);
  }, 30_000);
});
