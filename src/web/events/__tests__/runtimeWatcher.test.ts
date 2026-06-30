import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { createRuntimeWatcher, type RuntimeWatcher, type RuntimeChangeEvent } from '../runtimeWatcher';

describe('RuntimeWatcher', () => {
  let tempDir: string;
  let watcher: RuntimeWatcher;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-watcher-'));
    await fs.ensureDir(path.join(tempDir, '.context', 'runtime'));
  });

  afterEach(async () => {
    await watcher?.close();
    await fs.remove(tempDir);
  });

  it('emits a debounced runtime-change event with repo-relative POSIX paths', async () => {
    watcher = createRuntimeWatcher({ repoPath: tempDir, debounceMs: 50 });
    await watcher.ready();

    const eventPromise = new Promise<RuntimeChangeEvent>((resolve) => {
      watcher.once('runtime-change', resolve);
    });

    await fs.writeFile(
      path.join(tempDir, '.context', 'runtime', 'sessions.json'),
      JSON.stringify({ sessions: [] })
    );

    const event = await eventPromise;

    expect(event.paths).toEqual(['.context/runtime/sessions.json']);
  });

  it('coalesces multiple rapid writes into a single batched event', async () => {
    watcher = createRuntimeWatcher({ repoPath: tempDir, debounceMs: 80 });
    await watcher.ready();

    const events: RuntimeChangeEvent[] = [];
    watcher.on('runtime-change', (event: RuntimeChangeEvent) => events.push(event));

    await fs.writeFile(path.join(tempDir, '.context', 'runtime', 'a.json'), '{}');
    await fs.writeFile(path.join(tempDir, '.context', 'runtime', 'b.json'), '{}');

    // Wait comfortably past the debounce window so both writes land in one batch.
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(events).toHaveLength(1);
    expect(events[0].paths.sort()).toEqual(['.context/runtime/a.json', '.context/runtime/b.json']);
  });

  it('stops emitting events after close()', async () => {
    watcher = createRuntimeWatcher({ repoPath: tempDir, debounceMs: 30 });
    await watcher.ready();

    const onChange = jest.fn();
    watcher.on('runtime-change', onChange);

    await watcher.close();
    await fs.writeFile(path.join(tempDir, '.context', 'runtime', 'after-close.json'), '{}');
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(onChange).not.toHaveBeenCalled();
  });
});
