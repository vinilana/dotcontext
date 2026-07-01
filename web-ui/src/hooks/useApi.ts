import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiFetch } from '../lib/api';
import { useEventStream } from './useEventStream';
import type {
  AgentDetailResult,
  AgentsDiscoverResult,
  DocContent,
  DocSummary,
  HarnessArtifactRecord,
  HarnessSessionCheckpoint,
  HarnessSessionRecord,
  HarnessTraceRecord,
  SkillContentResult,
  SkillsListResult,
  WorkflowGuideResult,
  WorkflowHarnessStatus,
  WorkflowPlanDetailsResult,
  WorkflowPlansResult,
  WorkflowStatusResult,
} from '../types/api';

export interface ApiResourceState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** True once the very first request for the current `path` has settled. */
  loaded: boolean;
  refetch: () => void;
}

/**
 * Generic GET resource hook.
 *
 * Refetches whenever `path` changes, and whenever the shared SSE stream
 * (`useEventStream`) reports a new event/reconnect -- per the section 4.6
 * contract, the SSE payload itself is never trusted, only used as a "go
 * refetch REST data" signal. Pass `path: null` to skip fetching (e.g. no
 * selection yet).
 */
export function useApiResource<T>(path: string | null): ApiResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [loaded, setLoaded] = useState(false);
  const { version } = useEventStream();
  const requestId = useRef(0);

  const load = useCallback(() => {
    if (path === null) {
      setData(null);
      setError(null);
      setLoading(false);
      setLoaded(false);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    apiFetch<T>(path)
      .then((result) => {
        if (id !== requestId.current) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        setError(err instanceof ApiError ? err.message : 'Failed to load data');
      })
      .finally(() => {
        if (id !== requestId.current) return;
        setLoading(false);
        setLoaded(true);
      });
  }, [path]);

  // Refetch on path change and on every SSE event/reconnect (`version`);
  // `load` already closes over `path`, so it is the only callback dependency.
  useEffect(() => {
    load();
  }, [load, version]);

  return { data, error, loading, loaded, refetch: load };
}

// ---------------------------------------------------------------------------
// 4.1 Docs
// ---------------------------------------------------------------------------

export function useDocs() {
  return useApiResource<DocSummary[]>('/docs');
}

export function useDoc(name: string | null) {
  return useApiResource<DocContent>(name ? `/docs/${encodeURIComponent(name)}` : null);
}

// ---------------------------------------------------------------------------
// 4.2 Skills
// ---------------------------------------------------------------------------

export function useSkills() {
  return useApiResource<SkillsListResult>('/skills');
}

export function useSkill(slug: string | null) {
  return useApiResource<SkillContentResult>(slug ? `/skills/${encodeURIComponent(slug)}` : null);
}

// ---------------------------------------------------------------------------
// 4.3 Agents
// ---------------------------------------------------------------------------

export function useAgents() {
  return useApiResource<AgentsDiscoverResult>('/agents');
}

export function useAgent(agentType: string | null) {
  return useApiResource<AgentDetailResult>(agentType ? `/agents/${encodeURIComponent(agentType)}` : null);
}

// ---------------------------------------------------------------------------
// 4.4 Sessions
// ---------------------------------------------------------------------------

export function useSessions() {
  return useApiResource<HarnessSessionRecord[]>('/sessions');
}

export function useSession(sessionId: string | null) {
  return useApiResource<HarnessSessionRecord>(sessionId ? `/sessions/${encodeURIComponent(sessionId)}` : null);
}

export function useSessionTraces(sessionId: string | null) {
  return useApiResource<HarnessTraceRecord[]>(sessionId ? `/sessions/${encodeURIComponent(sessionId)}/traces` : null);
}

export function useSessionArtifacts(sessionId: string | null) {
  return useApiResource<HarnessArtifactRecord[]>(
    sessionId ? `/sessions/${encodeURIComponent(sessionId)}/artifacts` : null
  );
}

export function useSessionCheckpoints(sessionId: string | null) {
  return useApiResource<HarnessSessionCheckpoint[]>(
    sessionId ? `/sessions/${encodeURIComponent(sessionId)}/checkpoints` : null
  );
}

// ---------------------------------------------------------------------------
// 4.5 Workflow
// ---------------------------------------------------------------------------

export function useWorkflowStatus() {
  return useApiResource<WorkflowStatusResult>('/workflow/status');
}

export function useWorkflowGuide() {
  return useApiResource<WorkflowGuideResult>('/workflow/guide');
}

export function useWorkflowPlans() {
  return useApiResource<WorkflowPlansResult>('/workflow/plans');
}

export function useWorkflowPlanDetails(slug: string | null) {
  return useApiResource<WorkflowPlanDetailsResult>(slug ? `/workflow/plans/${encodeURIComponent(slug)}` : null);
}

export function useWorkflowHarness() {
  return useApiResource<WorkflowHarnessStatus>('/workflow/harness');
}
