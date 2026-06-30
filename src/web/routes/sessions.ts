/**
 * Sessions Routes — `GET /api/sessions`, `GET /api/sessions/:id`,
 * `.../traces`, `.../artifacts`, `.../checkpoints`
 *
 * Thin transport wrapper over `HarnessRuntimeStateService`. See
 * `.context/docs/web-interface-architecture.md` section 4.4. Read-only in
 * this phase — no create/checkpoint/append routes are exposed over HTTP.
 */

import { HarnessRuntimeStateService } from '../../harness';
import { sendData, sendError, errorMessage } from '../response';
import type { RouteContext, RouteHandler } from '../router';

function runtimeStateService(ctx: RouteContext): HarnessRuntimeStateService {
  return new HarnessRuntimeStateService({ repoPath: ctx.repoPath });
}

export const listSessions: RouteHandler = async (_req, res, _params, ctx) => {
  try {
    const sessions = await runtimeStateService(ctx).listSessions();
    sendData(res, 200, sessions);
  } catch (error) {
    sendError(res, 500, errorMessage(error));
  }
};

export const getSession: RouteHandler = async (_req, res, params, ctx) => {
  try {
    const session = await runtimeStateService(ctx).getSession(params.id);
    sendData(res, 200, session);
  } catch (error) {
    sendError(res, 404, errorMessage(error));
  }
};

export const listTraces: RouteHandler = async (_req, res, params, ctx) => {
  try {
    const traces = await runtimeStateService(ctx).listTraces(params.id);
    sendData(res, 200, traces);
  } catch (error) {
    sendError(res, 404, errorMessage(error));
  }
};

export const listArtifacts: RouteHandler = async (_req, res, params, ctx) => {
  try {
    const artifacts = await runtimeStateService(ctx).listArtifacts(params.id);
    sendData(res, 200, artifacts);
  } catch (error) {
    sendError(res, 404, errorMessage(error));
  }
};

export const listCheckpoints: RouteHandler = async (_req, res, params, ctx) => {
  try {
    const checkpoints = await runtimeStateService(ctx).listCheckpoints(params.id);
    sendData(res, 200, checkpoints);
  } catch (error) {
    sendError(res, 404, errorMessage(error));
  }
};
