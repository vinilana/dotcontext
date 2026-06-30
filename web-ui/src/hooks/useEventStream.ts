import { useSyncExternalStore } from 'react';
import type { RuntimeChangeEvent } from '../types/api';

/**
 * `GET /api/events` (SSE) client.
 *
 * Per the contract (`web-interface-architecture.md` section 4.6), the event
 * payload is intentionally coarse -- it only says *something* under
 * `.context/runtime` changed, never which resource. The contract is that any
 * event (including the initial `hello` and any reconnect) should cause the
 * active view to refetch its REST data; nothing here should be treated as
 * authoritative state.
 *
 * To honor that without opening one `EventSource` per consuming component,
 * a single connection is shared via a module-level store (ref-counted so it
 * opens lazily on first mount and closes when the last consumer unmounts).
 * Every consumer (the connection badge in the layout, and every view's data
 * hooks) reads the same `version` counter; bumping it is the refetch signal.
 */

export type EventStreamStatus = 'connecting' | 'open' | 'error' | 'closed';

export interface EventStreamState {
  status: EventStreamStatus;
  /** Increments on every `hello`, every `runtime-change`, and every reconnect. */
  version: number;
  lastEvent: RuntimeChangeEvent | null;
  lastEventAt: string | null;
}

const initialState: EventStreamState = {
  status: 'closed',
  version: 0,
  lastEvent: null,
  lastEventAt: null,
};

let state: EventStreamState = initialState;
let source: EventSource | null = null;
let refCount = 0;
const listeners = new Set<() => void>();

function setState(next: Partial<EventStreamState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function bump(partial: Partial<EventStreamState> = {}) {
  setState({ ...partial, version: state.version + 1 });
}

function ensureConnected() {
  if (source) return;
  setState({ status: 'connecting' });
  const es = new EventSource(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/events`);
  source = es;

  es.addEventListener('hello', () => {
    bump({ status: 'open', lastEventAt: new Date().toISOString() });
  });

  es.addEventListener('runtime-change', (event) => {
    let payload: RuntimeChangeEvent | null = null;
    try {
      payload = JSON.parse((event as MessageEvent).data) as RuntimeChangeEvent;
    } catch {
      payload = null;
    }
    bump({ status: 'open', lastEvent: payload, lastEventAt: new Date().toISOString() });
  });

  // Fallback for servers/proxies that deliver unnamed `message` events.
  es.onmessage = () => {
    bump({ status: 'open', lastEventAt: new Date().toISOString() });
  };

  es.onopen = () => {
    setState({ status: 'open' });
  };

  es.onerror = () => {
    // EventSource auto-reconnects; treat every error as a connectivity blip
    // and bump version once it reopens (see es.onopen / addEventListener
    // handlers above) so consumers refetch after a reconnect too.
    setState({ status: 'error' });
  };
}

function teardown() {
  if (source) {
    source.close();
    source = null;
  }
  state = initialState;
}

function subscribe(listener: () => void): () => void {
  refCount += 1;
  ensureConnected();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    refCount -= 1;
    if (refCount <= 0) {
      refCount = 0;
      teardown();
    }
  };
}

function getSnapshot(): EventStreamState {
  return state;
}

/**
 * Subscribes to the shared SSE connection. Returns the latest connection
 * status plus a monotonically increasing `version` -- pass `version` as a
 * dependency to any data-fetching effect to implement "refetch on any
 * event" (see `useApi.ts`).
 */
export function useEventStream(): EventStreamState {
  return useSyncExternalStore(subscribe, getSnapshot, () => initialState);
}
