import { useEffect, useMemo, useState } from 'react';
import { useAgent, useAgents } from '../hooks/useApi';
import {
  CopyButton,
  DetailPanel,
  DownloadButton,
  EmptyNote,
  ErrorNote,
  ListPanel,
  LoadingNote,
  PageHeader,
  TwoPaneView,
} from '../components/common';

export function AgentsView() {
  const { data, loading, error } = useAgents();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const allTypes = useMemo<string[]>(() => {
    if (!data) return [];
    return [...data.agents.builtIn, ...data.agents.custom.map((a) => a.type)];
  }, [data]);

  useEffect(() => {
    if (selected === null && allTypes.length > 0) {
      setSelected(allTypes[0]);
    }
  }, [allTypes, selected]);

  const { data: agent, loading: agentLoading, error: agentError } = useAgent(selected);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allTypes;
    return allTypes.filter((type) => type.toLowerCase().includes(q));
  }, [allTypes, query]);

  const content = agent?.info?.content;

  return (
    <TwoPaneView
      list={
        <ListPanel
          title="Agents"
          loading={loading}
          error={error}
          selectedKey={selected}
          onSelect={setSelected}
          search={{ value: query, onChange: setQuery, placeholder: 'Search agents…' }}
          entries={filtered.map((type) => ({
            key: type,
            title: type,
            badge: data?.agents.builtIn.includes(type) ? 'built-in' : 'custom',
          }))}
        />
      }
      detail={
        <DetailPanel>
          {!selected && <EmptyNote label="Select an agent to view its profile." />}
          {selected && agentLoading && <LoadingNote />}
          {selected && agentError && <ErrorNote message={agentError} />}
          {selected && agent && (
            <>
              <PageHeader
                title={selected}
                subtitle={agent.docs?.description}
                actions={
                  content && (
                    <>
                      <CopyButton text={content} label="Copy" />
                      <DownloadButton content={content} filename={`${selected}.md`} label="Download" />
                    </>
                  )
                }
              />

              {agent.info?.agent && (
                <section>
                  <h2>Info</h2>
                  <pre className="json-block">{JSON.stringify(agent.info.agent, null, 2)}</pre>
                </section>
              )}

              <section>
                <h2>Documentation</h2>
                {(!agent.docs?.documentation || agent.docs.documentation.length === 0) && (
                  <EmptyNote label="No linked documentation." />
                )}
                <ul className="plain-list">
                  {agent.docs?.documentation?.map((doc) => (
                    <li key={doc.path}>
                      <strong>{doc.title}</strong>
                      {doc.description && <span className="muted"> — {doc.description}</span>}
                      <div className="muted small">{doc.path}</div>
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
