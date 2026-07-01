/**
 * Events Route — `GET /api/events` (SSE)
 *
 * See `.context/docs/web-interface-architecture.md` section 4.6. Emits a
 * `hello` event with the server timestamp on connect, then a
 * `runtime-change` event (`{ paths: string[] }`) per debounced batch from
 * the shared `RuntimeWatcher` (one watcher instance per `src/web` process,
 * shared across every connected client — see `server.ts`).
 *
 * The payload is intentionally coarse: it tells the client *something*
 * under `.context/runtime` changed, never which resource. Clients must
 * treat any event (and reconnect) as "refetch the active view's REST data".
 */

import type { ServerResponse } from 'http';

import type { RouteHandler } from '../router';
import type { RuntimeChangeEvent } from '../events/runtimeWatcher';

function writeEvent(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export const streamEvents: RouteHandler = (req, res, _params, ctx) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  // Flush headers / open the stream immediately.
  res.write('\n');

  writeEvent(res, 'hello', { serverTime: new Date().toISOString() });

  const onRuntimeChange = (change: RuntimeChangeEvent): void => {
    writeEvent(res, 'runtime-change', change);
  };

  ctx.runtimeWatcher.on('runtime-change', onRuntimeChange);

  const cleanup = (): void => {
    ctx.runtimeWatcher.off('runtime-change', onRuntimeChange);
  };

  req.on('close', cleanup);
  res.on('close', cleanup);
};
