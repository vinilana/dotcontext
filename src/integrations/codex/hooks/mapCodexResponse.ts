import type { HarnessHookResponse } from '../../../harness';

import {
  isSessionEndReentry,
  mapHostHookResponseForSource,
  type HostHookOutput,
} from '../../shared';

import type { CodexHookInput } from './mapCodexEvent';

export type CodexHookOutput = Omit<HostHookOutput, 'source'>;

export function mapCodexResponse(
  event: CodexHookInput,
  response: HarnessHookResponse
): CodexHookOutput {
  const hookEventName =
    typeof event.hook_event_name === 'string' ? event.hook_event_name : 'unknown';

  return mapHostHookResponseForSource('codex', hookEventName, response, {
    suppressAdditionalContext: isSessionEndReentry(event),
  }) as CodexHookOutput;
}
