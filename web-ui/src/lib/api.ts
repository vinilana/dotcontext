/**
 * Thin fetch wrapper for the `/api/*` REST contract.
 *
 * All routes share one envelope: `{ data }` on success, `{ error: { message } }`
 * on failure (see `.context/docs/web-interface-architecture.md` section 4).
 * In dev, `vite.config.ts` proxies `/api/*` to the `src/web` server; in
 * production the same SPA is served by `src/web`'s static handler, so a
 * relative `/api` base works in both modes.
 */

export const API_BASE = '/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith('/api') ? path : `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body (e.g. empty response); fall through to status handling below.
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && body !== null && 'error' in body
        ? (body as { error?: { message?: string } }).error?.message
        : undefined;
    throw new ApiError(message || `Request failed: ${response.status} ${response.statusText}`, response.status);
  }

  if (body && typeof body === 'object' && body !== null && 'error' in body) {
    const message = (body as { error?: { message?: string } }).error?.message;
    throw new ApiError(message || 'Unknown API error', response.status);
  }

  if (body && typeof body === 'object' && body !== null && 'data' in body) {
    return (body as { data: T }).data;
  }

  // Defensive fallback: some handlers could theoretically return the payload
  // directly. Treat the whole body as the data in that case.
  return body as T;
}
