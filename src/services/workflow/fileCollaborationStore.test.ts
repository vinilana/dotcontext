import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { CollaborationManager } from '../../workflow/collaboration';
import {
  CURRENT_COLLABORATION_DOCUMENT_VERSION,
  FileCollaborationStore,
  migrateDocument,
} from './fileCollaborationStore';

describe('FileCollaborationStore', () => {
  let tempDir: string;
  let contextPath: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-collaboration-store-'));
    contextPath = path.join(tempDir, '.context');
    filePath = path.join(contextPath, 'workflow', 'collaboration-sessions.json');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('keeps collaboration sessions durable across fresh manager instances', async () => {
    const firstManager = new CollaborationManager(new FileCollaborationStore(contextPath));
    const session = await firstManager.startSession('Architecture review', ['architect', 'developer']);

    firstManager.contribute(
      session.getId(),
      'architect',
      'I recommend extracting collaboration persistence into a file-backed store.'
    );

    const secondManager = new CollaborationManager(new FileCollaborationStore(contextPath));
    secondManager.contribute(
      session.getId(),
      'developer',
      'We should keep the session durable across MCP calls.'
    );

    const synthesis = await secondManager.endSession(session.getId());
    const persisted = await fs.readJson(filePath);

    expect(synthesis).not.toBeNull();
    expect(synthesis?.participants).toEqual(['architect', 'developer']);
    expect(synthesis?.contributions).toHaveLength(2);
    expect(persisted.version).toBe(CURRENT_COLLABORATION_DOCUMENT_VERSION);
    expect(persisted.sessions).toHaveLength(1);
    expect(persisted.sessions[0].id).toBe(session.getId());
    expect(persisted.sessions[0].status).toBe('concluded');
    expect(typeof persisted.sessions[0].startedAt).toBe('number');
  });

  it('writes atomically (no lingering tmp file after rename)', () => {
    const store = new FileCollaborationStore(contextPath);
    store.saveSessions([
      {
        id: 'a',
        topic: 't',
        participants: ['architect'],
        contributions: [],
        status: 'active',
        startedAt: Date.now(),
      },
    ]);

    expect(fs.pathExistsSync(`${filePath}.tmp`)).toBe(false);
    const persisted = fs.readJsonSync(filePath);
    expect(persisted.version).toBe(CURRENT_COLLABORATION_DOCUMENT_VERSION);
  });

  it('returns [] on corrupted JSON and logs a warning', () => {
    fs.ensureDirSync(path.dirname(filePath));
    fs.writeFileSync(filePath, '{not valid json');
    const warn = jest.fn();
    const store = new FileCollaborationStore(contextPath, { logger: { warn } });
    expect(store.loadSessions()).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('returns [] on invalid document shape', () => {
    fs.ensureDirSync(path.dirname(filePath));
    fs.writeJsonSync(filePath, { version: 2, sessions: 'not-an-array' });
    const warn = jest.fn();
    const store = new FileCollaborationStore(contextPath, { logger: { warn } });
    expect(store.loadSessions()).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('throws with context on write failure', () => {
    // Force a write failure by making the destination file path a directory,
    // which causes rename(tmp -> dir) to fail on all POSIX platforms.
    fs.ensureDirSync(filePath);
    const store = new FileCollaborationStore(contextPath);
    expect(() =>
      store.saveSessions([
        {
          id: 'a',
          topic: 't',
          participants: ['architect'],
          contributions: [],
          status: 'active',
          startedAt: Date.now(),
        },
      ])
    ).toThrow(/Failed to persist collaboration sessions/);
  });

  it('handles concurrent writes without corrupting the final document', async () => {
    const store = new FileCollaborationStore(contextPath);
    const baseTs = Date.now();
    const writes = Array.from({ length: 10 }, (_, i) =>
      Promise.resolve().then(() =>
        store.saveSessions([
          {
            id: `s-${i}`,
            topic: `topic-${i}`,
            participants: ['architect'],
            contributions: [],
            status: 'active',
            startedAt: baseTs + i,
          },
        ])
      )
    );
    await Promise.all(writes);

    const persisted = fs.readJsonSync(filePath);
    expect(persisted.version).toBe(CURRENT_COLLABORATION_DOCUMENT_VERSION);
    expect(Array.isArray(persisted.sessions)).toBe(true);
    expect(persisted.sessions).toHaveLength(1);
    expect(persisted.sessions[0].id).toMatch(/^s-\d$/);
  });

  it('garbage-collects concluded sessions older than maxConcludedAgeMs', () => {
    const store = new FileCollaborationStore(contextPath, { maxConcludedAgeMs: 1000 });
    const now = Date.now();
    store.saveSessions([
      {
        id: 'old',
        topic: 'expired',
        participants: ['architect'],
        contributions: [],
        status: 'concluded',
        startedAt: now - 10_000,
      },
      {
        id: 'recent',
        topic: 'fresh',
        participants: ['architect'],
        contributions: [],
        status: 'concluded',
        startedAt: now,
      },
      {
        id: 'active-old',
        topic: 'still running',
        participants: ['architect'],
        contributions: [],
        status: 'active',
        startedAt: now - 10_000,
      },
    ]);

    const persisted = fs.readJsonSync(filePath);
    const ids = persisted.sessions.map((s: { id: string }) => s.id).sort();
    expect(ids).toEqual(['active-old', 'recent']);
  });

  it('migrates v1 (ISO-string timestamps) to v2 (ms epoch)', () => {
    const startedIso = '2024-01-01T00:00:00.000Z';
    const v1 = {
      version: 1 as const,
      sessions: [
        {
          id: 'legacy',
          topic: 'legacy',
          participants: ['architect' as const],
          contributions: [
            { role: 'architect' as const, message: 'hi', timestamp: startedIso },
          ],
          status: 'active' as const,
          startedAt: startedIso,
        },
      ],
    };
    const migrated = migrateDocument(v1);
    expect(migrated.version).toBe(CURRENT_COLLABORATION_DOCUMENT_VERSION);
    expect(migrated.sessions[0].startedAt).toBe(Date.parse(startedIso));
    expect(migrated.sessions[0].contributions[0].timestamp).toBe(Date.parse(startedIso));
  });

  it('preserves timestamp exact value on rehydration', async () => {
    const manager = new CollaborationManager(new FileCollaborationStore(contextPath));
    const session = await manager.startSession('ts-preservation', ['architect']);
    manager.contribute(session.getId(), 'architect', 'hello');
    const originalStarted = session.getStatus().started.getTime();
    const originalContribTs = session.getContributions()[0].timestamp.getTime();

    const reloaded = new CollaborationManager(new FileCollaborationStore(contextPath));
    const restored = reloaded.getSession(session.getId());
    expect(restored?.getStatus().started.getTime()).toBe(originalStarted);
    expect(restored?.getContributions()[0].timestamp.getTime()).toBe(originalContribTs);
  });

  it('reads v1 legacy file via loadSessions and migrates on next save', () => {
    fs.ensureDirSync(path.dirname(filePath));
    const iso = '2024-06-15T12:00:00.000Z';
    fs.writeJsonSync(filePath, {
      version: 1,
      sessions: [
        {
          id: 'legacy-1',
          topic: 'legacy',
          participants: ['architect'],
          contributions: [
            { role: 'architect', message: 'hi', timestamp: iso },
          ],
          status: 'active',
          startedAt: iso,
        },
      ],
    });

    const store = new FileCollaborationStore(contextPath);
    const sessions = store.loadSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].startedAt).toBe(Date.parse(iso));

    store.saveSessions(sessions);
    const persisted = fs.readJsonSync(filePath);
    expect(persisted.version).toBe(CURRENT_COLLABORATION_DOCUMENT_VERSION);
  });
});
