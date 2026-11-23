import type { HarnessHookResponse } from '../../../harness';

import {
  isSessionEndReentry,
  mapHostHookResponseForSource,
  type HostHookOutput,
} from '../../shared';

import type { CodexHookInput } from './mapCodexEvent';

export type CodexHookOutput = Omit<HostHookOutput, 'source'>;

function mapCodexStopOutput(output: CodexHookOutput): CodexHookOutput {
  const { hookSpecificOutput, ...rest } = output;
  const additionalContext = hookSpecificOutput?.additionalContext;

  if (!additionalContext) {
    return output;
  }

  return {
    ...rest,
    continue: rest.continue ?? true,
    systemMessage: rest.systemMessage ?? additionalContext,
  };
}

export function mapCodexResponse(
  event: CodexHookInput,
  response: HarnessHookResponse
): CodexHookOutput {
  const hookEventName =
    typeof event.hook_event_name === 'string' ? event.hook_event_name : 'unknown';

  const output = mapHostHookResponseForSource('codex', hookEventName, response, {
    suppressAdditionalContext: isSessionEndReentry(event),
  }) as CodexHookOutput;

  if (hookEventName === 'Stop') {
    return mapCodexStopOutput(output);
  }

  return output;
}
