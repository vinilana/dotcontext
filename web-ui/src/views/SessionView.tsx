import { useEffect, useMemo, useState } from 'react';
import {
  useSession,
  useSessionArtifacts,
  useSessionCheckpoints,
  useSessionTraces,
  useSessions,
} from '../hooks/useApi';
import {
  DetailPanel,
  EmptyNote,
  ErrorNote,
  ListPanel,
  LoadingNote,
  PageHeader,
  StatusPill,
  ToolBadge,
  TwoPaneView,
} from '../components/common';

function formatTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function hostOf(metadata?: Record<string, unknown>): string | undefined {
  const host = metadata?.host;
  return typeof host === 'string' ? host : undefined;
}

export function SessionView() {
  const { data: sessions, loading, error } = useSessions();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (selected === null && sessions && sessions.length > 0) {
      setSelected(sessions[0].id);
    }
  }, [sessions, selected]);

  const { data: session, loading: sessionLoading, error: sessionError } = useSession(selected);
  const { data: traces, loading: tracesLoading, error: tracesError } = useSessionTraces(selected);
  const { data: artifacts, loading: artifactsLoading, error: artifactsError } = useSessionArtifacts(selected);
  const { data: checkpoints, loading: checkpointsLoading, error: checkpointsError } = useSessionCheckpoints(selected);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !sessions) return sessions ?? [];
    return sessions.filter((s) => (s.name || s.id).toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
  }, [sessions, query]);

  return (
    <TwoPaneView
      list={
        <ListPanel
          title="Sessions"
          loading={loading}
          error={error}
          selectedKey={selected}
          onSelect={setSelected}
          search={{ value: query, onChange: setQuery, placeholder: 'Search sessions…' }}
          entries={filtered.map((s) => ({
            key: s.id,
            title: s.name || s.id,
            subtitle: formatTime(s.updatedAt),
            badge: s.status,
            meta: <ToolBadge host={hostOf(s.metadata)} />,
          }))}
        />
      }
      detail={
        <DetailPanel>
          {!selected && <EmptyNote label="Select a session to inspect its traces, artifacts, and checkpoints." />}
          {selected && sessionLoading && <LoadingNote />}
          {selected && sessionError && <ErrorNote message={sessionError} />}
          {selected && session && (
            <>
              <PageHeader
                title={
                  <>
                    {session.name} <StatusPill status={session.status} />
                  </>
                }
                actions={<ToolBadge host={hostOf(session.metadata)} />}
              />
              <dl className="kv-grid">
                <dt>Session ID</dt>
                <dd>{session.id}</dd>
                <dt>Started</dt>
                <dd>{formatTime(session.startedAt)}</dd>
                <dt>Updated</dt>
                <dd>{formatTime(session.updatedAt)}</dd>
                <dt>Traces / Artifacts / Checkpoints</dt>
                <dd>
                  {session.traceCount} / {session.artifactCount} / {session.checkpointCount}
                </dd>
              </dl>

              <section>
                <h2>Trace tail</h2>
                {tracesLoading && <LoadingNote />}
                {tracesError && <ErrorNote message={tracesError} />}
                {!tracesLoading && !tracesError && (!traces || traces.length === 0) && <EmptyNote label="No traces yet." />}
                <ul className="trace-list">
                  {(traces ?? [])
                    .slice()
                    .reverse()
                    .map((trace) => (
                      <li key={trace.id} className={`trace-item trace-item--${trace.level}`}>
                        <span className="trace-time">{formatTime(trace.createdAt)}</span>
                        <span className="trace-level">{trace.level}</span>
                        <span className="trace-event">{trace.event}</span>
                        <span className="trace-message">{trace.message}</span>
                      </li>
                    ))}
                </ul>
              </section>

              <section>
                <h2>Artifacts</h2>
                {artifactsLoading && <LoadingNote />}
                {artifactsError && <ErrorNote message={artifactsError} />}
                {!artifactsLoading && !artifactsError && (!artifacts || artifacts.length === 0) && (
                  <EmptyNote label="No artifacts recorded." />
                )}
                <ul className="plain-list">
                  {(artifacts ?? []).map((artifact) => (
                    <li key={artifact.id}>
                      <strong>{artifact.name}</strong> <span className="muted small">({artifact.kind})</span>
                      <div className="muted small">{formatTime(artifact.createdAt)}</div>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h2>Checkpoints</h2>
                {checkpointsLoading && <LoadingNote />}
                {checkpointsError && <ErrorNote message={checkpointsError} />}
                {!checkpointsLoading && !checkpointsError && (!checkpoints || checkpoints.length === 0) && (
                  <EmptyNote label="No checkpoints recorded." />
                )}
                <ul className="plain-list">
                  {(checkpoints ?? []).map((checkpoint) => (
                    <li key={checkpoint.id}>
                      <strong>{checkpoint.note || checkpoint.id}</strong>
                      <div className="muted small">{formatTime(checkpoint.createdAt)}</div>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </DetailPanel>
      }
    />
  );
}
