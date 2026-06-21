import type { HarnessHookResponse } from '../../harness';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractHarnessSessionId(response: HarnessHookResponse): string | undefined {
  if (!response.ok || response.result.kind !== 'json') {
    return undefined;
  }

  const data = response.result.data;
  if (!isRecord(data) || !isRecord(data.session) || typeof data.session.id !== 'string') {
    return undefined;
  }

  return data.session.id;
}
