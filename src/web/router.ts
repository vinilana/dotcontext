/**
 * Web Router
 *
 * A small static `(method, pathname)` route table, mirroring (in spirit, not
 * transport) the `src/mcp/gateway/*.ts` pattern of one handler module per
 * resource area. No framework: routes are matched by splitting the pattern
 * and the request pathname into segments and comparing them, extracting
 * `:param` segments as we go. See
 * `.context/docs/web-interface-architecture.md` section 2 (ADR-1).
 */

import type { IncomingMessage, ServerResponse } from 'http';

import type { RuntimeWatcher } from './events/runtimeWatcher';
import { sendError, errorMessage } from './response';

import * as docsRoutes from './routes/docs';
import * as skillsRoutes from './routes/skills';
import * as agentsRoutes from './routes/agents';
import * as sessionsRoutes from './routes/sessions';
import * as workflowRoutes from './routes/workflow';
import * as eventsRoutes from './routes/events';

export interface RouteContext {
  repoPath: string;
  runtimeWatcher: RuntimeWatcher;
}

export type RouteParams = Record<string, string>;

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: RouteParams,
  ctx: RouteContext
) => Promise<void> | void;

interface RouteDefinition {
  method: string;
  segments: string[];
  handler: RouteHandler;
}

function splitPath(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

function route(method: string, pattern: string, handler: RouteHandler): RouteDefinition {
  return { method, segments: splitPath(pattern), handler };
}

/**
 * GET-only in this phase (read-only dashboard) — see section 4.7.
 */
function buildRoutes(): RouteDefinition[] {
  return [
    route('GET', '/api/docs', docsRoutes.listDocs),
    route('GET', '/api/docs/:name', docsRoutes.getDoc),

    route('GET', '/api/skills', skillsRoutes.listSkills),
    route('GET', '/api/skills/:slug', skillsRoutes.getSkill),

    route('GET', '/api/agents', agentsRoutes.listAgents),
    route('GET', '/api/agents/:type', agentsRoutes.getAgent),

    route('GET', '/api/sessions', sessionsRoutes.listSessions),
    route('GET', '/api/sessions/:id', sessionsRoutes.getSession),
    route('GET', '/api/sessions/:id/traces', sessionsRoutes.listTraces),
    route('GET', '/api/sessions/:id/artifacts', sessionsRoutes.listArtifacts),
    route('GET', '/api/sessions/:id/checkpoints', sessionsRoutes.listCheckpoints),

    route('GET', '/api/workflow/status', workflowRoutes.getStatus),
    route('GET', '/api/workflow/guide', workflowRoutes.getGuide),
    route('GET', '/api/workflow/plans', workflowRoutes.getPlans),
    route('GET', '/api/workflow/plans/:slug', workflowRoutes.getPlanDetails),
    route('GET', '/api/workflow/harness', workflowRoutes.getHarnessStatus),

    route('GET', '/api/events', eventsRoutes.streamEvents),
  ];
}

export function matchRoute(
  routes: RouteDefinition[],
  method: string,
  pathname: string
): { handler: RouteHandler; params: RouteParams } | null {
  const requestSegments = splitPath(pathname);

  for (const candidate of routes) {
    if (candidate.method !== method) {
      continue;
    }
    if (candidate.segments.length !== requestSegments.length) {
      continue;
    }

    const params: RouteParams = {};
    let matched = true;

    for (let i = 0; i < candidate.segments.length; i++) {
      const routeSegment = candidate.segments[i];
      const requestSegment = requestSegments[i];

      if (routeSegment.startsWith(':')) {
        params[routeSegment.slice(1)] = decodeURIComponent(requestSegment);
      } else if (routeSegment !== requestSegment) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return { handler: candidate.handler, params };
    }
  }

  return null;
}

export type RouteDispatcher = (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
) => Promise<boolean>;

/**
 * Builds a dispatcher bound to a given `RouteContext`. Returns `true` if the
 * request matched an `/api/*` route (and was handled), `false` otherwise so
 * the caller (`server.ts`) can fall through to static asset serving.
 */
export function createRouter(ctx: RouteContext): RouteDispatcher {
  const routes = buildRoutes();

  return async function dispatch(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string
  ): Promise<boolean> {
    const method = (req.method || 'GET').toUpperCase();
    const match = matchRoute(routes, method, pathname);

    if (!match) {
      return false;
    }

    try {
      await match.handler(req, res, match.params, ctx);
    } catch (error) {
      if (!res.headersSent) {
        sendError(res, 500, errorMessage(error));
      } else {
        res.end();
      }
    }

    return true;
  };
}
