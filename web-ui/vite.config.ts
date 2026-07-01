import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev-server port and proxy target for the `src/web` backend.
 *
 * NOTE for the backend implementer: the dotcontext web dashboard's default
 * API port is **4317**. `dotcontext web` (the `src/web` server, ADR-1/ADR-2
 * in `.context/docs/web-interface-architecture.md`) should default
 * `startWebServer({ port })` to 4317 so this dev proxy works out of the box.
 * Override with the `VITE_API_PROXY_TARGET` env var if the backend runs on a
 * different port locally.
 */
const DEFAULT_API_PROXY_TARGET = 'http://localhost:4317';
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? DEFAULT_API_PROXY_TARGET;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Vite dev server port for the SPA itself (separate from the API port
    // above). Override with `vite --port <n>` or `VITE_PORT` if 5173 is taken.
    port: Number(process.env.VITE_PORT) || 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        // `/api/events` is a long-lived SSE connection; keep it un-buffered.
        ws: false,
      },
    },
  },
  preview: {
    port: Number(process.env.VITE_PORT) || 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
