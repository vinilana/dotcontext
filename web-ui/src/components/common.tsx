import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function LoadingNote({ label = 'Loading…' }: { label?: string }) {
  return <p className="muted">{label}</p>;
}

export function ErrorNote({ message }: { message: string }) {
  return <p className="error-note">{message}</p>;
}

export function EmptyNote({ label = 'Nothing here yet.' }: { label?: string }) {
  return <p className="muted">{label}</p>;
}

export function StatusPill({ status }: { status: string }) {
  return <span className={`pill pill--${status.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>{status}</span>;
}

export interface ListEntry {
  key: string;
  title: string;
  subtitle?: string;
  badge?: string;
}

export function ListPanel({
  title,
  entries,
  selectedKey,
  onSelect,
  loading,
  error,
}: {
  title: string;
  entries: ListEntry[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <div className="list-panel">
      <h2 className="panel-heading">{title}</h2>
      {loading && <LoadingNote />}
      {error && <ErrorNote message={error} />}
      {!loading && !error && entries.length === 0 && <EmptyNote />}
      <ul className="entry-list">
        {entries.map((entry) => (
          <li key={entry.key}>
            <button
              type="button"
              className={`entry-button${entry.key === selectedKey ? ' entry-button--active' : ''}`}
              onClick={() => onSelect(entry.key)}
            >
              <span className="entry-title">{entry.title}</span>
              {entry.subtitle && <span className="entry-subtitle">{entry.subtitle}</span>}
              {entry.badge && <span className="entry-badge">{entry.badge}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DetailPanel({ children }: { children: ReactNode }) {
  return <div className="detail-panel">{children}</div>;
}

export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-content">
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  );
}

export function TwoPaneView({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  return (
    <div className="two-pane">
      {list}
      {detail}
    </div>
  );
}
