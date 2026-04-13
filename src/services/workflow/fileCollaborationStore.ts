import * as path from 'path';
import * as fs from 'fs-extra';

import type {
  CollaborationSessionRecord,
  CollaborationSessionStore,
} from '../../workflow/collaboration';

export const CURRENT_COLLABORATION_DOCUMENT_VERSION = 2;

const DEFAULT_MAX_CONCLUDED_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface CollaborationStoreDocumentV1 {
  version: 1;
  sessions: Array<Omit<CollaborationSessionRecord, 'startedAt' | 'contributions'> & {
    startedAt: string;
    contributions: Array<{
      role: CollaborationSessionRecord['contributions'][number]['role'];
      message: string;
      timestamp: string;
    }>;
  }>;
}

interface CollaborationStoreDocumentV2 {
  version: 2;
  sessions: CollaborationSessionRecord[];
}

type AnyCollaborationStoreDocument =
  | CollaborationStoreDocumentV1
  | CollaborationStoreDocumentV2;

export interface FileCollaborationStoreOptions {
  /** Max age (ms) for `concluded` sessions before garbage collection on save. */
  maxConcludedAgeMs?: number;
  /** Optional logger for non-fatal read errors. Defaults to `console.warn`. */
  logger?: { warn: (msg: string, err?: unknown) => void };
}

function cloneRecord(session: CollaborationSessionRecord): CollaborationSessionRecord {
  return {
    ...session,
    participants: [...session.participants],
    contributions: session.contributions.map((contribution) => ({ ...contribution })),
  };
}

function migrateV1ToV2(doc: CollaborationStoreDocumentV1): CollaborationStoreDocumentV2 {
  return {
    version: 2,
    sessions: doc.sessions.map((session) => ({
      ...session,
      startedAt: Date.parse(session.startedAt),
      contributions: session.contributions.map((contribution) => ({
        role: contribution.role,
        message: contribution.message,
        timestamp: Date.parse(contribution.timestamp),
      })),
    })),
  };
}

/**
 * Migrate a collaboration document to the current version. No-op when already current.
 */
export function migrateDocument(
  doc: AnyCollaborationStoreDocument
): CollaborationStoreDocumentV2 {
  let current: AnyCollaborationStoreDocument = doc;
  if (current.version === 1) {
    current = migrateV1ToV2(current);
  }
  if (current.version !== CURRENT_COLLABORATION_DOCUMENT_VERSION) {
    throw new Error(
      `Unsupported collaboration document version: ${(current as { version: unknown }).version}`
    );
  }
  return current;
}

export class FileCollaborationStore implements CollaborationSessionStore {
  private readonly filePath: string;
  private readonly tmpPath: string;
  private readonly maxConcludedAgeMs: number;
  private readonly logger: NonNullable<FileCollaborationStoreOptions['logger']>;

  constructor(contextPath: string, options: FileCollaborationStoreOptions = {}) {
    this.filePath = path.join(contextPath, 'workflow', 'collaboration-sessions.json');
    this.tmpPath = `${this.filePath}.tmp`;
    const envMax = process.env.DOTCONTEXT_COLLAB_MAX_CONCLUDED_AGE_MS;
    const parsed = envMax ? Number(envMax) : NaN;
    this.maxConcludedAgeMs =
      options.maxConcludedAgeMs ??
      (Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MAX_CONCLUDED_AGE_MS);
    this.logger = options.logger ?? {
      warn: (msg, err) => {
        // eslint-disable-next-line no-console
        console.warn(`[FileCollaborationStore] ${msg}`, err ?? '');
      },
    };
  }

  loadSessions(): CollaborationSessionRecord[] {
    try {
      if (!fs.pathExistsSync(this.filePath)) {
        return [];
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as AnyCollaborationStoreDocument | null;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !Array.isArray((parsed as { sessions?: unknown }).sessions)
      ) {
        this.logger.warn(`Invalid document shape at ${this.filePath}; returning empty list.`);
        return [];
      }
      const migrated = migrateDocument(parsed);
      return migrated.sessions.map(cloneRecord);
    } catch (err) {
      this.logger.warn(`Failed to read ${this.filePath}; returning empty list.`, err);
      return [];
    }
  }

  saveSessions(sessions: CollaborationSessionRecord[]): void {
    try {
      fs.ensureDirSync(path.dirname(this.filePath));
      const now = Date.now();
      const pruned = sessions.filter((session) => {
        if (session.status !== 'concluded') return true;
        return now - session.startedAt < this.maxConcludedAgeMs;
      });
      const document: CollaborationStoreDocumentV2 = {
        version: CURRENT_COLLABORATION_DOCUMENT_VERSION,
        sessions: pruned.map(cloneRecord),
      };

      const payload = JSON.stringify(document, null, 2);
      const fd = fs.openSync(this.tmpPath, 'w');
      try {
        fs.writeSync(fd, payload);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(this.tmpPath, this.filePath);
    } catch (err) {
      try {
        if (fs.pathExistsSync(this.tmpPath)) fs.removeSync(this.tmpPath);
      } catch {
        // ignore
      }
      throw new Error(
        `Failed to persist collaboration sessions to ${this.filePath}: ${(err as Error)?.message ?? String(err)}`
      );
    }
  }
}
