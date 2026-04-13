/**
 * Acceptance Runner
 *
 * Executes a step's acceptance predicate and returns a structured result.
 * Shell safety: we always spawn with `shell: false` and require `command` to
 * be an argv array. No shell interpolation is performed.
 */

import { spawn } from 'child_process';
import type { StepAcceptanceRun, StepAcceptanceSpec } from './executionTypes';

export const ACCEPTANCE_TAIL_LIMIT_BYTES = 8 * 1024;
export const ACCEPTANCE_DEFAULT_TIMEOUT_MS = 60_000;

export class AcceptanceFailedError extends Error {
  readonly run: StepAcceptanceRun;
  readonly planSlug?: string;
  readonly phaseId?: string;
  readonly stepIndex?: number;

  constructor(
    message: string,
    run: StepAcceptanceRun,
    ctx?: { planSlug?: string; phaseId?: string; stepIndex?: number }
  ) {
    super(message);
    this.name = 'AcceptanceFailedError';
    this.run = run;
    this.planSlug = ctx?.planSlug;
    this.phaseId = ctx?.phaseId;
    this.stepIndex = ctx?.stepIndex;
  }
}

export interface AcceptanceContext {
  repoPath: string;
}

function tailBuffer(chunks: Buffer[], limit: number): string {
  const joined = Buffer.concat(chunks);
  if (joined.length <= limit) {
    return joined.toString('utf-8');
  }
  return joined.subarray(joined.length - limit).toString('utf-8');
}

export async function runAcceptance(
  spec: StepAcceptanceSpec,
  ctx: AcceptanceContext
): Promise<StepAcceptanceRun> {
  if (spec.kind !== 'shell') {
    throw new Error(`Unsupported acceptance kind: ${String(spec.kind)}`);
  }
  if (!Array.isArray(spec.command) || spec.command.length === 0) {
    throw new Error('acceptance.command must be a non-empty string[]');
  }

  const [executable, ...args] = spec.command;
  const timeoutMs = spec.timeoutMs ?? ACCEPTANCE_DEFAULT_TIMEOUT_MS;
  const cwd = spec.workingDir ?? ctx.repoPath;
  const startedAt = Date.now();

  return new Promise<StepAcceptanceRun>((resolve) => {
    let settled = false;
    let timedOut = false;

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
        ran_at: startedAt,
        passed: false,
        exitCode: null,
        tailStdout: '',
        tailStderr: `spawn error: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - startedAt,
        timedOut: false,
      });
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

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
      const tailStdout = tailBuffer(stdoutChunks, ACCEPTANCE_TAIL_LIMIT_BYTES);
      let tailStderr = tailBuffer(stderrChunks, ACCEPTANCE_TAIL_LIMIT_BYTES);
      if (spawnError) {
        tailStderr = `${tailStderr}${tailStderr ? '\n' : ''}spawn error: ${spawnError.message}`;
      }
      resolve({
        ran_at: startedAt,
        passed: !timedOut && !spawnError && exitCode === 0,
        exitCode,
        tailStdout,
        tailStderr,
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    };

    child.on('error', (err) => finish(null, err));
    child.on('close', (code) => finish(code));
  });
}
