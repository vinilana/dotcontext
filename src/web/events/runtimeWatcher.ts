/**
 * Runtime Watcher
 *
 * Watches `.context/runtime/**` (sessions, workflows, contracts, evaluations)
 * for changes and emits a single debounced `runtime-change` event per batch
 * of writes, per `.context/docs/web-interface-architecture.md` section 4.6.
 *
 * Chokidar already debounces *per-file* stability via `awaitWriteFinish`, but
 * a session checkpoint can touch several files (session.json, traces.jsonl,
 * artifact files) in quick succession; this module additionally coalesces
 * everything chokidar reports inside one `debounceMs` window into a single
 * `{ paths: string[] }` event so SSE clients see one event per logical
 * batch of runtime writes, not one per touched file.
 *
 * One instance is created per `src/web` server process (see `server.ts`) and
 * shared across every connected SSE client (`routes/events.ts`).
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import { watch, type FSWatcher } from 'chokidar';

export interface RuntimeChangeEvent {
  /** Repo-relative paths (POSIX separators) that changed in this batch. */
  paths: string[];
}

export interface RuntimeWatcherOptions {
  repoPath: string;
  /** Debounce window for batching/coalescing changes. Defaults to ~300ms. */
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 300;
const RUNTIME_RELATIVE_DIR = path.join('.context', 'runtime');

/**
 * Emits `runtime-change` ({ paths: string[] }) and `error` events.
 */
export class RuntimeWatcher extends EventEmitter {
  private readonly watcher: FSWatcher;
  private readonly repoPath: string;
  private readonly debounceMs: number;
  private readonly pendingPaths = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(options: RuntimeWatcherOptions) {
    super();
    this.repoPath = path.resolve(options.repoPath);
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;

    const watchDir = path.join(this.repoPath, RUNTIME_RELATIVE_DIR);
    this.watcher = watch(watchDir, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: this.debounceMs,
        pollInterval: Math.max(20, Math.floor(this.debounceMs / 6)),
      },
    });

    this.watcher.on('all', (_event, changedPath) => this.queueChange(changedPath));
    this.watcher.on('error', (error) => this.emit('error', error));
  }

  private toRepoRelative(changedPath: string): string {
    const relative = path.relative(this.repoPath, changedPath);
    return relative.split(path.sep).join('/');
  }

  private queueChange(changedPath: string): void {
    if (this.closed) {
      return;
    }

    this.pendingPaths.add(this.toRepoRelative(changedPath));

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => this.flush(), this.debounceMs);
  }

  private flush(): void {
    this.flushTimer = null;
    if (this.pendingPaths.size === 0) {
      return;
    }

    const paths = Array.from(this.pendingPaths).sort();
    this.pendingPaths.clear();
    const event: RuntimeChangeEvent = { paths };
    this.emit('runtime-change', event);
  }

  /** Resolves once the initial filesystem scan has completed. */
  async ready(): Promise<void> {
    await new Promise<void>((resolve) => this.watcher.once('ready', resolve));
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.watcher.close();
  }
}

export function createRuntimeWatcher(options: RuntimeWatcherOptions): RuntimeWatcher {
  return new RuntimeWatcher(options);
}
