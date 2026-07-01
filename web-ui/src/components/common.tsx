import { type ReactNode, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { IconCheck, IconCopy, IconDownload, IconSearch, IconTool } from './icons';

// ---------------------------------------------------------------------------
// Status / empty / error notes
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tool / host identification
//
// `session.metadata.host` (set at hook-dispatch time, see
// `src/cli/services/hookDispatchService.ts`) records which coding tool ran
// the workflow: 'claude-code', 'codex', 'pi-dev', or 'generic'. This is the
// only host-identifying signal the harness captures today -- there is no
// per-model tracking (host hook payloads never include the LLM name).
// ---------------------------------------------------------------------------

const HOST_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  'pi-dev': 'Pi',
  generic: 'Generic hook',
};

export function ToolBadge({ host }: { host?: string | null }) {
  const key = host && HOST_LABELS[host] ? host : 'unknown';
  const label = host ? HOST_LABELS[host] ?? host : 'Unknown tool';
  return (
    <span className={`tool-badge tool-badge--${key}`} title="Tool/host that drove this workflow">
      <IconTool size={12} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Copy / download actions
// ---------------------------------------------------------------------------

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className={`btn btn--sm${copied ? ' btn--success' : ''}`} onClick={handleClick}>
      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

export function DownloadButton({
  content,
  filename,
  label = 'Download',
}: {
  content: string;
  filename: string;
  label?: string;
}) {
  function handleClick() {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className="btn btn--sm" onClick={handleClick}>
      <IconDownload size={14} />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <span className="search-input-wrap">
      <IconSearch size={14} />
      <input
        type="text"
        className="search-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page header
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-header-heading">
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List / detail panels
// ---------------------------------------------------------------------------

export interface ListEntry {
  key: string;
  title: string;
  subtitle?: string;
  badge?: string;
  meta?: ReactNode;
}

export function ListPanel({
  title,
  entries,
  selectedKey,
  onSelect,
  loading,
  error,
  search,
}: {
  title: string;
  entries: ListEntry[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  loading?: boolean;
  error?: string | null;
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
}) {
  return (
    <div className="list-panel">
      <h2 className="panel-heading">
        {title}
        <span className="panel-count">{entries.length}</span>
      </h2>
      {search && <SearchInput value={search.value} onChange={search.onChange} placeholder={search.placeholder} />}
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
              {entry.meta}
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
