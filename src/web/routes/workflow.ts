/**
 * Workflow Routes — `GET /api/workflow/status`, `.../guide`, `.../plans`,
 * `.../plans/:slug`, `.../harness`
 *
 * Thin transport wrapper over `WorkflowService`, `WorkflowGuideService`, and
 * `HarnessPlansService`. See
 * `.context/docs/web-interface-architecture.md` section 4.5.
 *
 * `getHarnessStatus` calls `WorkflowService.getHarnessStatus()` (no
 * argument), which already resolves the active workflow's name via
 * `getSummary()` and delegates to
 * `HarnessSessionFacade.getHarnessStatus(workflowName)` internally — the
 * same call chain the architecture doc describes, without this route having
 * to re-derive the workflow name itself.
 */

import { WorkflowService, WorkflowGuideService, HarnessPlansService } from '../../harness';
import { sendData, sendError, errorMessage } from '../response';
import type { RouteHandler } from '../router';

export const getStatus: RouteHandler = async (_req, res, _params, ctx) => {
  try {
    const service = new WorkflowService(ctx.repoPath);

    if (!(await service.hasWorkflow())) {
      sendData(res, 200, { status: null, summary: null });
      return;
    }

    const [status, summary] = await Promise.all([service.getStatus(), service.getSummary()]);
    sendData(res, 200, { status, summary });
  } catch (error) {
    sendError(res, 500, errorMessage(error));
  }
};

export const getGuide: RouteHandler = async (_req, res, _params, ctx) => {
  try {
    const service = new WorkflowGuideService({ repoPath: ctx.repoPath });
    const guide = await service.guide({ intent: 'session_start' });
    sendData(res, 200, guide);
  } catch (error) {
    sendError(res, 500, errorMessage(error));
  }
};

export const getPlans: RouteHandler = async (_req, res, _params, ctx) => {
  try {
    const service = new HarnessPlansService({ repoPath: ctx.repoPath });
    const plans = await service.getLinked();
    sendData(res, 200, plans);
  } catch (error) {
    sendError(res, 500, errorMessage(error));
  }
};

export const getPlanDetails: RouteHandler = async (_req, res, params, ctx) => {
  try {
    const service = new HarnessPlansService({ repoPath: ctx.repoPath });
    const details = await service.getDetails(params.slug);
    sendData(res, 200, details);
  } catch (error) {
    sendError(res, 500, errorMessage(error));
  }
};

export const getHarnessStatus: RouteHandler = async (_req, res, _params, ctx) => {
  try {
    const service = new WorkflowService(ctx.repoPath);
    const harnessStatus = await service.getHarnessStatus();
    sendData(res, 200, harnessStatus);
  } catch (error) {
    sendError(res, 500, errorMessage(error));
  }
};
