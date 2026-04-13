/**
 * Built-in `tests-passing` sensor.
 *
 * Two modes:
 *   - `kind: 'jest'` (default): runs `npm test -- --runInBand --json` (or a
 *     configured `testCommand` argv array) and parses the JSON result on
 *     stdout. Passes iff exit code 0 AND `numFailedTests === 0`.
 *   - `kind: 'exit-code'`: runs the configured `testCommand` argv array and
 *     passes iff the process exits with code 0. Use this for non-jest test
 *     runners.
 *
 * Shell safety: spawn(..., { shell: false }) with an explicit argv array.
 *
 * Boundary: this sensor lives under `src/services/harness/sensors` and may
 * not import from `workflow/*`.
 */

import { spawn } from 'child_process';
import type {
  HarnessSensorDefinition,
  HarnessSensorExecutionInput,
  HarnessSensorExecutionResult,
} from '../sensorsService';

export interface TestsPassingOptions {
  kind?: 'jest' | 'exit-code';
  testCommand?: string[];
  timeoutMs?: number;
}

export interface TestsPassingReport {
  numPassedTests: number;
  numFailedTests: number;
  numTotalTestSuites: number;
  failures: Array<{ name: string; message: string }>;
}

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_JEST_COMMAND: string[] = ['npm', 'test', '--', '--runInBand', '--json'];
const TAIL_LIMIT_BYTES = 8 * 1024;

function readOptions(input: HarnessSensorExecutionInput): Required<TestsPassingOptions> {
  const ctx = (input.context && typeof input.context === 'object' ? input.context : {}) as TestsPassingOptions;
  const meta = (input.metadata && typeof input.metadata === 'object'
    ? (input.metadata as Record<string, unknown>)
    : {}) as TestsPassingOptions;
  const kind = (ctx.kind ?? meta.kind ?? 'jest') as 'jest' | 'exit-code';
  const cmd = ctx.testCommand ?? meta.testCommand;
  return {
    kind,
    testCommand: Array.isArray(cmd) && cmd.length > 0 ? cmd : DEFAULT_JEST_COMMAND,
    timeoutMs: ctx.timeoutMs ?? meta.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError?: string;
}

function tail(s: string, limit: number): string {
  return s.length <= limit ? s : s.slice(s.length - limit);
}

export function runShell(
  argv: string[],
  cwd: string,
  timeoutMs: number
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const [executable, ...args] = argv;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executable, args, {
        cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });
    } catch (err) {
      resolve({
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        spawnError: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;
    let settled = false;

    child.stdout?.on('data', (c: Buffer) => stdoutChunks.push(c));
    child.stderr?.on('data', (c: Buffer) => stderrChunks.push(c));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const finish = (exitCode: number | null, spawnError?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        timedOut,
        spawnError: spawnError?.message,
      });
    };

    child.on('error', (err) => finish(null, err));
    child.on('close', (code) => finish(code));
  });
}

function extractJsonFromStdout(stdout: string): unknown | null {
  // Jest --json sometimes emits warnings on stdout before the JSON object.
  // Find the first `{` and try to parse from there.
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); } catch { /* fallthrough */ }
  }
  const idx = stdout.indexOf('{');
  if (idx === -1) return null;
  try {
    return JSON.parse(stdout.slice(idx));
  } catch {
    return null;
  }
}

export async function executeTestsPassing(
  repoPath: string,
  input: HarnessSensorExecutionInput
): Promise<HarnessSensorExecutionResult> {
  const opts = readOptions(input);

  const result = await runShell(opts.testCommand, repoPath, opts.timeoutMs);

  if (result.spawnError) {
    return {
      status: 'failed',
      summary: `tests-passing: spawn error: ${result.spawnError}`,
      evidence: [`command: ${opts.testCommand.join(' ')}`],
    };
  }

  if (result.timedOut) {
    return {
      status: 'failed',
      summary: `tests-passing: timed out after ${opts.timeoutMs}ms`,
      evidence: [`command: ${opts.testCommand.join(' ')}`, tail(result.stderr, TAIL_LIMIT_BYTES)],
    };
  }

  if (opts.kind === 'exit-code') {
    if (result.exitCode === 0) {
      return {
        status: 'passed',
        summary: 'tests-passing: exit 0',
        evidence: [`command: ${opts.testCommand.join(' ')}`],
      };
    }
    return {
      status: 'failed',
      summary: `tests-passing: exit ${result.exitCode}`,
      evidence: [`command: ${opts.testCommand.join(' ')}`, tail(result.stderr, TAIL_LIMIT_BYTES)],
    };
  }

  // jest mode
  const parsed = extractJsonFromStdout(result.stdout);
  if (!parsed || typeof parsed !== 'object') {
    return {
      status: 'failed',
      summary: 'tests-passing: could not parse jest --json output',
      evidence: [
        `command: ${opts.testCommand.join(' ')}`,
        `exitCode: ${result.exitCode}`,
        tail(result.stdout, TAIL_LIMIT_BYTES),
        tail(result.stderr, TAIL_LIMIT_BYTES),
      ].filter(Boolean),
    };
  }

  const j = parsed as Record<string, unknown>;
  const numPassedTests = typeof j.numPassedTests === 'number' ? j.numPassedTests : 0;
  const numFailedTests = typeof j.numFailedTests === 'number' ? j.numFailedTests : 0;
  const numTotalTestSuites = typeof j.numTotalTestSuites === 'number' ? j.numTotalTestSuites : 0;

  const failures: Array<{ name: string; message: string }> = [];
  const testResults = Array.isArray(j.testResults) ? j.testResults : [];
  for (const suite of testResults) {
    if (!suite || typeof suite !== 'object') continue;
    const s = suite as Record<string, unknown>;
    const assertionResults = Array.isArray(s.assertionResults) ? s.assertionResults : [];
    for (const a of assertionResults) {
      if (!a || typeof a !== 'object') continue;
      const ar = a as Record<string, unknown>;
      if (ar.status === 'failed') {
        const messages = Array.isArray(ar.failureMessages) ? ar.failureMessages : [];
        failures.push({
          name: typeof ar.fullName === 'string' ? ar.fullName : (typeof ar.title === 'string' ? ar.title : 'unknown'),
          message: messages.map((m) => String(m)).join('\n').slice(0, 2000),
        });
      }
    }
  }

  const report: TestsPassingReport = {
    numPassedTests,
    numFailedTests,
    numTotalTestSuites,
    failures,
  };

  const passed = result.exitCode === 0 && numFailedTests === 0;
  if (passed) {
    return {
      status: 'passed',
      summary: `tests-passing: ${numPassedTests} passed across ${numTotalTestSuites} suites`,
      evidence: [`command: ${opts.testCommand.join(' ')}`],
      output: report,
    };
  }

  return {
    status: 'failed',
    summary: `tests-passing: ${numFailedTests} failed (exit ${result.exitCode})`,
    evidence: failures.slice(0, 10).map((f) => `${f.name}: ${f.message.split('\n')[0]}`),
    output: report,
  };
}

export function createTestsPassingSensor(repoPath: string): HarnessSensorDefinition {
  return {
    id: 'tests-passing',
    name: 'Tests Passing',
    description: 'Runs the project test suite and verifies zero failures.',
    severity: 'critical',
    blocking: true,
    execute: (input) => executeTestsPassing(repoPath, input),
  };
}
