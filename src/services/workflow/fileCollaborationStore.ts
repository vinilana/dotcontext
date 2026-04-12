import * as path from 'path';
import * as fs from 'fs-extra';

import type {
  CollaborationSessionRecord,
  CollaborationSessionStore,
} from '../../workflow/collaboration';

interface CollaborationStoreDocument {
  version: 1;
  sessions: CollaborationSessionRecord[];
}

export class FileCollaborationStore implements CollaborationSessionStore {
  private readonly filePath: string;

  constructor(contextPath: string) {
    this.filePath = path.join(contextPath, 'workflow', 'collaboration-sessions.json');
  }

  loadSessions(): CollaborationSessionRecord[] {
    if (!fs.pathExistsSync(this.filePath)) {
      return [];
    }

    const document = fs.readJsonSync(this.filePath) as Partial<CollaborationStoreDocument> | null;
    if (!document || !Array.isArray(document.sessions)) {
      return [];
    }

    return document.sessions.map((session) => ({
      ...session,
      participants: [...session.participants],
      contributions: session.contributions.map((contribution) => ({ ...contribution })),
    }));
  }

  saveSessions(sessions: CollaborationSessionRecord[]): void {
    fs.ensureDirSync(path.dirname(this.filePath));
    const document: CollaborationStoreDocument = {
      version: 1,
      sessions: sessions.map((session) => ({
        ...session,
        participants: [...session.participants],
        contributions: session.contributions.map((contribution) => ({ ...contribution })),
      })),
    };

    fs.writeJsonSync(this.filePath, document, { spaces: 2 });
  }
}
