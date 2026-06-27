import {
  extractHookReadinessSummary,
  formatHookReadinessAdditionalContext,
  type HarnessHookResponse,
} from '../../../harness';

import { extractHarnessSessionId } from '../../shared/extractHarnessSessionId';
import { formatNavigationExcerpt } from '../../shared/formatNavigationExcerpt';
import { isSessionEndReentry } from '../../shared/sessionEndReentry';

import type { PiDevHookEvent } from './mapPiEvent';

export { extractHarnessSessionId };

export interface PiHookOutput {
  source: 'pi-dev';
  additionalContext?: string;
  notify?: string;
  silent?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractResultData(response: Extract<HarnessHookResponse, { ok: true }>): unknown {
  if (response.result.kind === 'json') {
    return response.result.data;
  }
  return response.result;
}

function formatContextMessage(data: unknown): string {
  const readiness = extractHookReadinessSummary(data);
  if (readiness) {
    return formatHookReadinessAdditionalContext(readiness, { source: 'pi-dev' });
  }

  if (!isRecord(data) || !data.initialized) {
    return 'dotcontext: this repository does not have .context/ yet.\nNext step: configure MCP and ask the agent to run context init in this project.';
  }

  const enabled: string[] = [];
  for (const key of ['docs', 'agents', 'skills', 'plans', 'workflow', 'harness'] as const) {
    if (data[key]) {
      enabled.push(key);
    }
  }

  if (enabled.length === 0) {
    return 'dotcontext: .context/ present. Run context init to populate scaffolding.';
  }

  return `dotcontext: scaffold ready (${enabled.join(', ')}).`;
}

function formatWorkflowGuideNotify(data: unknown): string | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  const workflow = data.workflow;
  if (data.skipped === true || (isRecord(workflow) && workflow.active === false)) {
    return undefined;
  }

  if (typeof data.excerpt === 'string') {
    const excerpt = data.excerpt.trim();
    return excerpt.length > 0 ? excerpt : undefined;
  }

  return undefined;
}

export function mapPiResponse(
  event: PiDevHookEvent,
  response: HarnessHookResponse,
  options: { navigation?: HarnessHookResponse } = {}
): PiHookOutput {
  if (!response.ok) {
    return { source: 'pi-dev', silent: true };
  }

  if (event.type === 'session_start' && response.tool === 'context') {
    let additionalContext = formatContextMessage(extractResultData(response));
    const navigationData = options.navigation?.ok && options.navigation.result.kind === 'json'
      ? options.navigation.result.data
      : undefined;
    const navigationExcerpt = formatNavigationExcerpt(navigationData);
    if (navigationExcerpt) {
      additionalContext = `${additionalContext}\n\ndotcontext navigation:\n${navigationExcerpt}`;
    }

    return {
      source: 'pi-dev',
      additionalContext,
    };
  }

  if (event.type === 'session_start_navigation' || event.type === 'harness_create_session') {
    return { source: 'pi-dev', silent: true };
  }

  if (event.type === 'tool_execution_end') {
    return { source: 'pi-dev', silent: true };
  }

  if (event.type === 'agent_end' && isSessionEndReentry(event)) {
    return { source: 'pi-dev', silent: true };
  }

  if (event.type === 'agent_end' && response.tool === 'workflow-guide') {
    const notify = formatWorkflowGuideNotify(extractResultData(response));
    return notify
      ? { source: 'pi-dev', notify }
      : { source: 'pi-dev', silent: true };
  }

  return { source: 'pi-dev', silent: true };
}
