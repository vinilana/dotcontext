import type { HarnessHookResponse } from '../../../harness';

import { mapHostHookResponse, type HostHookOutput } from '../../shared';

import type { CodexHookInput } from './mapCodexEvent';

export type CodexHookOutput = HostHookOutput;

export function mapCodexResponse(
  event: CodexHookInput,
  response: HarnessHookResponse
): CodexHookOutput {
  const hookEventName =
    typeof event.hook_event_name === 'string' ? event.hook_event_name : 'unknown';

  return mapHostHookResponse(hookEventName, response, { source: 'codex' });
}
