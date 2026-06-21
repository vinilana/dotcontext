import {
  HostHarnessHookAdapter,
  type HarnessHookResponse,
  type HostHookAdapterOptions,
  type HostHookMapper,
} from '../../shared';

import { mapClaudeCodeEvent, type ClaudeCodeHookInput } from './mapClaudeCodeEvent';

export type ClaudeCodeHookEvent = ClaudeCodeHookInput;
export type ClaudeCodeHookResponse = HarnessHookResponse;
export interface ClaudeCodeHookAdapterOptions<TEnvelope = ClaudeCodeHookEvent>
  extends HostHookAdapterOptions<TEnvelope> {}

export class ClaudeCodeHarnessHookAdapter<TEnvelope = ClaudeCodeHookEvent>
  extends HostHarnessHookAdapter<TEnvelope> {
  constructor(options: ClaudeCodeHookAdapterOptions<TEnvelope> = {}) {
    super('claude-code', {
      ...options,
      mapEvent:
        options.mapEvent
        ?? (mapClaudeCodeEvent as HostHookMapper<TEnvelope>),
    });
  }
}

export function createClaudeCodeHookAdapter<TEnvelope = ClaudeCodeHookEvent>(
  options: ClaudeCodeHookAdapterOptions<TEnvelope> = {}
): ClaudeCodeHarnessHookAdapter<TEnvelope> {
  return new ClaudeCodeHarnessHookAdapter<TEnvelope>(options);
}
