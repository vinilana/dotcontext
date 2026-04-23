/**
 * Plan Gateway Handler
 *
 * Handles plan management and execution tracking operations.
 * Replaces: linkPlan, getLinkedPlans, getPlanDetails, getPlansForPhase,
 *           updatePlanPhase, recordDecision, updatePlanStep, getPlanExecutionStatus,
 *           syncPlanMarkdown
 */

import { HarnessPlansService } from '../../harness';
import { AcceptanceFailedError } from '../../../workflow';

import type { PlanParams } from './types';
import type { MCPToolResponse } from './response';
import { createJsonResponse, createErrorResponse } from './response';

export interface PlanOptions {
  repoPath: string;
}

/**
 * Handles plan gateway actions for plan management and execution tracking.
 */
export async function handlePlan(
  params: PlanParams,
  options: PlanOptions
): Promise<MCPToolResponse> {
  const repoPath = options.repoPath;
  const service = new HarnessPlansService({ repoPath });

  try {
    switch (params.action) {
      case 'link': {
        return createJsonResponse(await service.link(params.planSlug!));
      }

      case 'getLinked': {
        return createJsonResponse(await service.getLinked());
      }

      case 'getDetails': {
        return createJsonResponse(await service.getDetails(params.planSlug!));
      }

      case 'getForPhase': {
        return createJsonResponse(await service.getForPhase(params.phase!));
      }

      case 'updatePhase': {
        return createJsonResponse(await service.updatePhase(
          params.planSlug!,
          params.phaseId!,
          params.status!
        ));
      }

      case 'recordDecision': {
        return createJsonResponse(await service.recordDecision({
          planSlug: params.planSlug!,
          title: params.title!,
          description: params.description!,
          phase: params.phase,
          alternatives: params.alternatives,
        }));
      }

      case 'updateStep': {
        return createJsonResponse(await service.updateStep({
          planSlug: params.planSlug!,
          phaseId: params.phaseId!,
          stepIndex: params.stepIndex!,
          status: params.status!,
          output: params.output,
          notes: params.notes,
        }));
      }

      case 'getStatus': {
        return createJsonResponse(await service.getStatus(params.planSlug!));
      }

      case 'syncMarkdown': {
        return createJsonResponse(await service.syncMarkdown(params.planSlug!));
      }

      case 'commitPhase': {
        if (!params.planSlug || !params.phaseId) {
          return createJsonResponse({
            success: false,
            error: 'planSlug and phaseId are required for commitPhase action',
          });
        }

        return createJsonResponse(await service.commitPhase({
          planSlug: params.planSlug,
          phaseId: params.phaseId,
          coAuthor: params.coAuthor,
          stagePatterns: params.stagePatterns,
          dryRun: params.dryRun,
        }));
      }

      default:
        return createErrorResponse(`Unknown plan action: ${params.action}`);
    }
  } catch (error) {
    if (error instanceof AcceptanceFailedError) {
      return createJsonResponse({
        success: false,
        error: error.message,
        acceptance: {
          planSlug: error.planSlug,
          phaseId: error.phaseId,
          stepIndex: error.stepIndex,
          run: error.run,
        },
      });
    }
    return createErrorResponse(error);
  }
}
