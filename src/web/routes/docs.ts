/**
 * Docs Routes — `GET /api/docs`, `GET /api/docs/:name`
 *
 * Thin transport wrapper over `HarnessDocsService`
 * (`src/harness/application/docs`). See
 * `.context/docs/web-interface-architecture.md` section 4.1.
 */

import { HarnessDocsService } from '../../harness';
import { sendData, sendError, errorMessage } from '../response';
import type { RouteHandler } from '../router';

export const listDocs: RouteHandler = async (_req, res, _params, ctx) => {
  try {
    const service = new HarnessDocsService({ repoPath: ctx.repoPath });
    const docs = await service.list();
    sendData(res, 200, docs);
  } catch (error) {
    sendError(res, 500, errorMessage(error));
  }
};

export const getDoc: RouteHandler = async (_req, res, params, ctx) => {
  try {
    const service = new HarnessDocsService({ repoPath: ctx.repoPath });
    const doc = await service.getContent(params.name);
    sendData(res, 200, doc);
  } catch (error) {
    sendError(res, 404, errorMessage(error));
  }
};
