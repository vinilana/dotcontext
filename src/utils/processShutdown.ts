export interface ShutdownTarget {
  stop(): Promise<void>;
}

export interface ShutdownController {
  shutdown: (signal?: NodeJS.Signals) => Promise<void>;
  dispose: () => void;
}

export interface ShutdownControllerOptions {
  label?: string;
  onError?: (error: unknown) => void;
  exit?: (code: number) => never;
}

/**
 * Register idempotent shutdown handlers for SIGINT/SIGTERM.
 *
 * The returned controller removes the listeners if `dispose()` is called
 * before a signal arrives.
 */
export function registerProcessShutdown(
  target: ShutdownTarget,
  options: ShutdownControllerOptions = {}
): ShutdownController {
  let shuttingDown = false;
  const signalListeners = new Map<NodeJS.Signals, () => void>();
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

  const dispose = (): void => {
    for (const [signal, listener] of signalListeners.entries()) {
      process.off(signal, listener);
    }
    signalListeners.clear();
  };

  const shutdown = async (signal?: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    let exitCode = 0;

    try {
      await target.stop();
    } catch (error) {
      exitCode = 1;
      options.onError?.(error);
    } finally {
      dispose();
      options.exit?.(exitCode);
    }
  };

  for (const signal of signals) {
    const listener = () => {
      void shutdown(signal);
    };
    signalListeners.set(signal, listener);
    process.once(signal, listener);
  }

  return { shutdown, dispose };
}
