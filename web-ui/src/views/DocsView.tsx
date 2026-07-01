import { useEffect, useMemo, useState } from 'react';
import { useDoc, useDocs } from '../hooks/useApi';
import {
  CopyButton,
  DetailPanel,
  DownloadButton,
  EmptyNote,
  ErrorNote,
  ListPanel,
  LoadingNote,
  MarkdownContent,
  PageHeader,
  StatusPill,
  TwoPaneView,
} from '../components/common';
import { withFrontMatter } from '../lib/markdown';

export function DocsView() {
  const { data: docs, loading, error } = useDocs();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (selected === null && docs && docs.length > 0) {
      setSelected(docs[0].name);
    }
  }, [docs, selected]);

  const { data: doc, loading: docLoading, error: docError } = useDoc(selected);

  const filtered = useMemo(() => {
    if (!docs) return [];
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) =>
        (d.title || d.name).toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        d.category?.toLowerCase().includes(q)
    );
  }, [docs, query]);

  const fileContent = doc ? withFrontMatter(doc.frontMatter, doc.content) : '';

  return (
    <TwoPaneView
      list={
        <ListPanel
          title="Docs"
          loading={loading}
          error={error}
          selectedKey={selected}
          onSelect={setSelected}
          search={{ value: query, onChange: setQuery, placeholder: 'Search docs…' }}
          entries={filtered.map((d) => ({
            key: d.name,
            title: d.title || d.name,
            subtitle: d.category,
            badge: d.status,
          }))}
        />
      }
      detail={
        <DetailPanel>
          {!selected && <EmptyNote label="Select a doc to view its content." />}
          {selected && docLoading && <LoadingNote />}
          {selected && docError && <ErrorNote message={docError} />}
          {selected && doc && (
            <>
              <PageHeader
                title={(doc.frontMatter?.name as string) || doc.name}
                subtitle={typeof doc.frontMatter?.description === 'string' ? doc.frontMatter.description : undefined}
                actions={
                  <>
                    <CopyButton text={fileContent} label="Copy" />
                    <DownloadButton content={fileContent} filename={`${doc.name}.md`} label="Download" />
                  </>
                }
              />
              <StatusPill status={doc.frontMatter?.status === 'unfilled' ? 'unfilled' : 'filled'} />
              <MarkdownContent content={doc.content} />
            </>
          )}
        </DetailPanel>
      }
    />
  );
}
