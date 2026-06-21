import {
  HostHarnessHookAdapter,
  type HarnessHookResponse,
  type HostHookAdapterOptions,
  type HostHookMapper,
} from '../../shared';

import { mapCodexEvent, type CodexHookInput } from './mapCodexEvent';

export type CodexHookEvent = CodexHookInput;
export type CodexHookResponse = HarnessHookResponse;
export interface CodexHookAdapterOptions<TEnvelope = CodexHookEvent>
  extends HostHookAdapterOptions<TEnvelope> {}

export class CodexHarnessHookAdapter<TEnvelope = CodexHookEvent>
  extends HostHarnessHookAdapter<TEnvelope> {
  constructor(options: CodexHookAdapterOptions<TEnvelope> = {}) {
    super('codex', {
      ...options,
      mapEvent:
        options.mapEvent
        ?? (mapCodexEvent as HostHookMapper<TEnvelope>),
    });
  }
}

export function createCodexHookAdapter<TEnvelope = CodexHookEvent>(
  options: CodexHookAdapterOptions<TEnvelope> = {}
): CodexHarnessHookAdapter<TEnvelope> {
  return new CodexHarnessHookAdapter<TEnvelope>(options);
}
