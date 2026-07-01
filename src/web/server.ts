/**
 * Web Server
 *
 * Plain `node:http` server + the `src/web/router.ts` dispatcher (ADR-1, see
 * `.context/docs/web-interface-architecture.md` section 2). Two
 * responsibilities:
 *
 *   1. Serve the `/api/*` REST + SSE contract (section 4), delegating to the
 *      router.
 *   2. Serve the built `web-ui/dist` SPA as static assets, falling back to
 *      `index.html` for any non-`/api/*` path that doesn't match a static
 *      file (client-side routing).
 *
 * Binds `127.0.0.1` by default; binding elsewhere requires an explicit
 * `host` and logs a warning (section 4.7 — "no auth, localhost-only" is the
 * accepted default security posture).
 */

import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs-extra';

import { PathValidator } from '../utils/pathSecurity';
import { createRuntimeWatcher, type RuntimeWatcher } from './events/runtimeWatcher';
import { createRouter, type RouteDispatcher } from './router';
import { sendError, errorMessage } from './response';

export const DEFAULT_WEB_HOST = '127.0.0.1';
export const DEFAULT_WEB_PORT = 4317;

/**
 * The built frontend (`web-ui/dist`) ships alongside this package, not
 * inside the *target* repository (`repoPath`). Resolved relative to this
 * module so it works the same way under `tsx`/`ts-jest` (running from
 * `src/web/server.ts`) and the compiled CLI (`dist/web/server.js`): both are
 * two directories below the repo/package root.
 */
export function resolveWebUiDistDir(): string {
  return path.resolve(__dirname, '..', '..', 'web-ui', 'dist');
}

export interface StartWebServerOptions {
  repoPath: string;
  port?: number;
  host?: string;
}

export interface WebServerHandle {
  server: http.Server;
  host: string;
  port: number;
  url: string;
  stop(): Promise<void>;
}

const STATIC_CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function serveStatic(res: http.ServerResponse, pathname: string, distDir: string): Promise<void> {
  if (!(await fs.pathExists(distDir))) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('dotcontext web UI is not built. Run "npm run build:web-ui" first.');
    return;
  }

  const validator = new PathValidator(distDir);
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');

  let filePath: string | null = validator.safeResolve(requested);
  let stat = filePath ? await fs.stat(filePath).catch(() => null) : null;

  if (!filePath || !stat || stat.isDirectory()) {
    // SPA fallback: any non-API path that isn't a real static file resolves
    // to index.html so client-side routing (react-router) can take over.
    filePath = path.join(distDir, 'index.html');
    stat = await fs.stat(filePath).catch(() => null);
  }

  if (!stat) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const contentType = STATIC_CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream';
  const content = await fs.readFile(filePath);
  res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': content.length });
  res.end(content);
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  routeRequest: RouteDispatcher,
  distDir: string
): Promise<void> {
  try {
    const parsed = new URL(req.url ?? '/', 'http://localhost');
    const pathname = parsed.pathname;

    if (pathname.startsWith('/api/')) {
      const matched = await routeRequest(req, res, pathname);
      if (!matched) {
        sendError(res, 404, `No API route for ${req.method ?? 'GET'} ${pathname}`);
      }
      return;
    }

    await serveStatic(res, pathname, distDir);
  } catch (error) {
    if (!res.headersSent) {
      sendError(res, 500, errorMessage(error));
    } else {
      res.end();
    }
  }
}

export async function startWebServer(options: StartWebServerOptions): Promise<WebServerHandle> {
  const repoPath = path.resolve(options.repoPath);
  const host = options.host ?? DEFAULT_WEB_HOST;
  const requestedPort = options.port ?? DEFAULT_WEB_PORT;
  const distDir = resolveWebUiDistDir();

  if (host !== DEFAULT_WEB_HOST) {
    // eslint-disable-next-line no-console
    console.warn(
      `[dotcontext web] Binding to ${host} instead of ${DEFAULT_WEB_HOST}. ` +
        'The web dashboard has no authentication; only do this on a trusted network.'
    );
  }

  let runtimeWatcher: RuntimeWatcher | undefined;

  try {
    runtimeWatcher = createRuntimeWatcher({ repoPath });
    const routeRequest = createRouter({ repoPath, runtimeWatcher });

    const server = http.createServer((req, res) => {
      void handleRequest(req, res, routeRequest, distDir);
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = (): void => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(requestedPort, host);
    });

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : requestedPort;

    return {
      server,
      host,
      port,
      url: `http://${host}:${port}`,
      async stop(): Promise<void> {
        await runtimeWatcher?.close();
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      },
    };
  } catch (error) {
    await runtimeWatcher?.close();
    throw error;
  }
}
