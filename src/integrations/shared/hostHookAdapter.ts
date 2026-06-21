import {
  createHarnessHookAdapter,
  type HarnessHookAdapterOptions,
  type HarnessHookEvent,
  type HarnessHookResponse,
  type HarnessHookSource,
} from '../../harness';

export type HostHookMapper<TEnvelope> = (
  event: TEnvelope
) => Omit<HarnessHookEvent, 'source'> & { source?: HarnessHookSource };

export type HostHookAdapterRuntime = Pick<
  ReturnType<typeof createHarnessHookAdapter>,
  'handle'
>;

export interface HostHookAdapterOptions<TEnvelope = unknown>
  extends Omit<HarnessHookAdapterOptions, 'source'> {
  mapEvent?: HostHookMapper<TEnvelope>;
}

function mapCanonicalEvent<TEnvelope>(
  event: TEnvelope
): Omit<HarnessHookEvent, 'source'> & { source?: HarnessHookSource } {
  return event as Omit<HarnessHookEvent, 'source'> & { source?: HarnessHookSource };
}

export class HostHarnessHookAdapter<TEnvelope = unknown> {
  private readonly adapter: HostHookAdapterRuntime;
  private readonly mapEvent: HostHookMapper<TEnvelope>;

  constructor(
    private readonly source: HarnessHookSource,
    options: HostHookAdapterOptions<TEnvelope>
  ) {
    const { mapEvent, ...adapterOptions } = options;
    this.mapEvent = mapEvent ?? mapCanonicalEvent;
    this.adapter = createHarnessHookAdapter({
      ...adapterOptions,
      source,
    });
  }

  async handle(event: TEnvelope): Promise<HarnessHookResponse> {
    const mappedEvent = this.mapEvent(event);
    return this.adapter.handle({
      ...mappedEvent,
      source: this.source,
    });
  }
}

export function createHostHarnessHookAdapter<TEnvelope = unknown>(
  source: HarnessHookSource,
  options: HostHookAdapterOptions<TEnvelope>
): HostHarnessHookAdapter<TEnvelope> {
  return new HostHarnessHookAdapter(source, options);
}
