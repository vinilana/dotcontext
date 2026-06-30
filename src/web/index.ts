/**
 * Web boundary exports.
 *
 * `src/web` is a fifth boundary alongside `cli`, `harness`, `mcp`, and
 * `integrations` (see `.context/docs/web-interface-architecture.md` section
 * 1): it depends only on `src/harness` application services, exactly like
 * `src/mcp`, and never imports from `src/cli` or `src/mcp`.
 */

export {
  startWebServer,
  resolveWebUiDistDir,
  DEFAULT_WEB_HOST,
  DEFAULT_WEB_PORT,
  type StartWebServerOptions,
  type WebServerHandle,
} from './server';
