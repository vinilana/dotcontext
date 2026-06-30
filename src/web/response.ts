/**
 * Web Response Helpers
 *
 * All `src/web` JSON routes share one envelope, per
 * `.context/docs/web-interface-architecture.md` section 4:
 *   - success (2xx): `{ "data": <payload> }`
 *   - failure (4xx/5xx): `{ "error": { "message": string } }`
 *
 * This is intentionally a different shape from the ad hoc `{ success, ... }`
 * objects returned by MCP-facing harness application services; routes pass
 * those through unwrapped inside `data` (see route modules), they are never
 * conflated with this HTTP-level envelope.
 */

import type { ServerResponse } from 'http';

/**
 * Extract a human-readable message from a thrown value, mirroring the
 * `src/mcp/gateway/response.ts#createErrorResponse` convention.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  if (!res.headersSent) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(json),
    });
  }
  res.end(json);
}

/**
 * Send a successful `{ data }` envelope.
 */
export function sendData(res: ServerResponse, status: number, data: unknown): void {
  writeJson(res, status, { data });
}

/**
 * Send a failure `{ error: { message } }` envelope.
 */
export function sendError(res: ServerResponse, status: number, message: string): void {
  writeJson(res, status, { error: { message } });
}
