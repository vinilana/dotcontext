import { useEffect, useState } from 'react';
import { useDoc, useDocs } from '../hooks/useApi';
import { DetailPanel, EmptyNote, ErrorNote, ListPanel, LoadingNote, MarkdownContent, TwoPaneView } from '../components/common';

export function DocsView() {
  const { data: docs, loading, error } = useDocs();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (selected === null && docs && docs.length > 0) {
      setSelected(docs[0].name);
    }
  }, [docs, selected]);

  const { data: doc, loading: docLoading, error: docError } = useDoc(selected);

  return (
    <TwoPaneView
      list={
        <ListPanel
          title="Docs"
          loading={loading}
          error={error}
          selectedKey={selected}
          onSelect={setSelected}
          entries={(docs ?? []).map((d) => ({
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
              <h1>{(doc.frontMatter?.name as string) || doc.name}</h1>
              {typeof doc.frontMatter?.description === 'string' && (
                <p className="muted">{doc.frontMatter.description as string}</p>
              )}
              <MarkdownContent content={doc.content} />
            </>
          )}
        </DetailPanel>
      }
    />
  );
}
