/**
 * Skills Routes — `GET /api/skills`, `GET /api/skills/:slug`
 *
 * Thin transport wrapper over `HarnessSkillActionService` (which wraps
 * `HarnessSkillsService`). Underlying results already use an ad hoc
 * `{ success, ... }` shape meant for MCP tool results; per the architecture
 * doc (section 4.2) those are passed through as-is inside the `data`
 * envelope rather than reshaped, since they never throw for a "not found"
 * skill (they return `{ success: false, error }` instead).
 */

import { HarnessSkillActionService } from '../../harness';
import { sendData, sendError, errorMessage } from '../response';
import type { RouteHandler } from '../router';

export const listSkills: RouteHandler = async (req, res, _params, ctx) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const includeContent = url.searchParams.get('content') === 'true';
    const service = new HarnessSkillActionService({ repoPath: ctx.repoPath });
    const result = await service.execute({ action: 'list', includeContent });
    sendData(res, 200, result);
  } catch (error) {
    sendError(res, 500, errorMessage(error));
  }
};

export const getSkill: RouteHandler = async (_req, res, params, ctx) => {
  try {
    const service = new HarnessSkillActionService({ repoPath: ctx.repoPath });
    const result = await service.execute({ action: 'getContent', skillSlug: params.slug });
    sendData(res, 200, result);
  } catch (error) {
    sendError(res, 500, errorMessage(error));
  }
};
