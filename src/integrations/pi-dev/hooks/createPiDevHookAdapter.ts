import {
  HostHarnessHookAdapter,
  type HarnessHookResponse,
  type HostHookAdapterOptions,
  type HostHookMapper,
} from '../../shared';

import { mapPiEvent, type PiDevHookEvent } from './mapPiEvent';

export type { PiDevHookEvent } from './mapPiEvent';
export type PiDevHookResponse = HarnessHookResponse;
export interface PiDevHookAdapterOptions<TEnvelope = PiDevHookEvent>
  extends HostHookAdapterOptions<TEnvelope> {}

export class PiDevHarnessHookAdapter<TEnvelope = PiDevHookEvent>
  extends HostHarnessHookAdapter<TEnvelope> {
  constructor(options: PiDevHookAdapterOptions<TEnvelope> = {}) {
    super('pi-dev', {
      ...options,
      mapEvent:
        options.mapEvent
        ?? (mapPiEvent as HostHookMapper<TEnvelope>),
    });
  }
}

export function createPiDevHookAdapter<TEnvelope = PiDevHookEvent>(
  options: PiDevHookAdapterOptions<TEnvelope> = {}
): PiDevHarnessHookAdapter<TEnvelope> {
  return new PiDevHarnessHookAdapter<TEnvelope>(options);
}
