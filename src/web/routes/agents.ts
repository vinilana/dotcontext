/**
 * Agents Routes — `GET /api/agents`, `GET /api/agents/:type`
 *
 * Thin transport wrapper over `HarnessAgentActionService`. See
 * `.context/docs/web-interface-architecture.md` section 4.3.
 */

import { HarnessAgentActionService, type HarnessAgentActionInput } from '../../harness';
import { sendData, sendError, errorMessage } from '../response';
import type { RouteHandler } from '../router';

export const listAgents: RouteHandler = async (_req, res, _params, ctx) => {
  try {
    const service = new HarnessAgentActionService({ repoPath: ctx.repoPath });
    const result = await service.execute({ action: 'discover' });
    sendData(res, 200, result);
  } catch (error) {
    sendError(res, 500, errorMessage(error));
  }
};

export const getAgent: RouteHandler = async (_req, res, params, ctx) => {
  try {
    const service = new HarnessAgentActionService({ repoPath: ctx.repoPath });
    const agent = params.type as HarnessAgentActionInput['agent'];
    const [info, docs] = await Promise.all([
      service.execute({ action: 'getInfo', agentType: params.type }),
      service.execute({ action: 'getDocs', agent }),
    ]);
    sendData(res, 200, { info, docs });
  } catch (error) {
    sendError(res, 404, errorMessage(error));
  }
};
