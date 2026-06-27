import type { HarnessHookResponse } from '../../../harness';

import {
  isSessionEndReentry,
  mapHostHookResponseForSource,
  type HostHookOutput,
} from '../../shared';

import type { ClaudeCodeHookInput } from './mapClaudeCodeEvent';

export type ClaudeCodeHookOutput = HostHookOutput;

export function mapClaudeCodeResponse(
  event: ClaudeCodeHookInput,
  response: HarnessHookResponse
): ClaudeCodeHookOutput {
  const hookEventName =
    typeof event.hook_event_name === 'string' ? event.hook_event_name : 'unknown';

  return mapHostHookResponseForSource('claude-code', hookEventName, response, {
    suppressAdditionalContext: isSessionEndReentry(event),
  });
}
