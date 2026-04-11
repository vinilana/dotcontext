import * as fs from 'fs-extra';
import * as path from 'path';
import { randomUUID } from 'crypto';

import type {
  HarnessArtifactRecord,
  HarnessSessionCheckpoint,
  HarnessSessionRecord,
  HarnessTraceRecord,
  HarnessRuntimeStatePort,
} from './runtimeStateService';
import { HarnessRuntimeStateService as DefaultHarnessRuntimeStateService } from './runtimeStateService';
import { HarnessSensorsService, type HarnessSensorRun } from './sensorsService';
import {
  HarnessTaskContractsService,
  type HarnessHandoffContract,
  type HarnessTaskContract,
} from './taskContractsService';

export type HarnessReplayEventSource =
  | 'session'
  | 'trace'
  | 'artifact'
  | 'checkpoint'
  | 'sensor'
  | 'task'
  | 'handoff';

export interface HarnessReplayEvent {
  id: string;
  sessionId: string;
  createdAt: string;
  source: HarnessReplayEventSource;
  label: string;
  payload?: Record<string, unknown>;
}

export interface HarnessReplayRecord {
  id: string;
  sessionId: string;
  repoPath: string;
  createdAt: string;
  replayedAt: string;
  fidelity: 'complete' | 'partial';
  eventCount: number;
  summary: string;
  events: HarnessReplayEvent[];
  session: HarnessSessionRecord;
  artifacts: HarnessArtifactRecord[];
  checkpoints: HarnessSessionCheckpoint[];
  traces: HarnessTraceRecord[];
  sensorRuns: HarnessSensorRun[];
  tasks: HarnessTaskContract[];
  handoffs: HarnessHandoffContract[];
}

export interface HarnessReplayServiceOptions {
  repoPath: string;
  dependencies?: Partial<HarnessReplayDependencies>;
}

export interface ReplaySessionOptions {
  includePayloads?: boolean;
  maxEvents?: number;
}

export interface HarnessFailureRecord {
  id: string;
  sessionId: string;
  category: 'sensor' | 'contract' | 'handoff';
  signature: string;
  message: string;
  severity: 'warning' | 'error';
  sourceId: string;
  evidence: string[];
  details?: Record<string, unknown>;
}

export interface HarnessFailureCluster {
  signature: string;
  category: HarnessFailureRecord['category'];
  message: string;
  count: number;
  sessionIds: string[];
  recordIds: string[];
  example: HarnessFailureRecord;
}

export interface HarnessFailureDataset {
  id: string;
  createdAt: string;
  repoPath: string;
  sessionIds: string[];
  records: HarnessFailureRecord[];
  clusters: HarnessFailureCluster[];
}

export interface HarnessReplayDependencies {
  stateService: HarnessRuntimeStatePort;
  sensorsService: Pick<HarnessSensorsService, 'getSessionSensorRuns'>;
  contractsService: Pick<HarnessTaskContractsService, 'listTaskContracts' | 'listHandoffContracts'>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sortByCreatedAt<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export class HarnessReplayService {
  private readonly stateService: HarnessReplayDependencies['stateService'];
  private readonly sensorsService: HarnessReplayDependencies['sensorsService'];
  private readonly contractsService: HarnessReplayDependencies['contractsService'];

  constructor(private readonly options: HarnessReplayServiceOptions) {
    const stateService = options.dependencies?.stateService
      ?? new DefaultHarnessRuntimeStateService({ repoPath: options.repoPath });
    const sensorsService = options.dependencies?.sensorsService
      ?? new HarnessSensorsService({ stateService });
    const contractsService = options.dependencies?.contractsService
      ?? new HarnessTaskContractsService({
        repoPath: options.repoPath,
        stateService,
      });

    this.stateService = stateService;
    this.sensorsService = sensorsService;
    this.contractsService = contractsService;
  }

  private get repoPath(): string {
    return path.resolve(this.options.repoPath);
  }

  private get replaysPath(): string {
    return path.join(this.repoPath, '.context', 'harness', 'replays');
  }

  private replayFile(replayId: string): string {
    return path.join(this.replaysPath, `${replayId}.json`);
  }

  private async ensureLayout(): Promise<void> {
    await fs.ensureDir(this.replaysPath);
  }

  private async saveReplay(replay: HarnessReplayRecord): Promise<void> {
    await this.ensureLayout();
    await fs.writeJson(this.replayFile(replay.id), replay, { spaces: 2 });
  }

  private async readReplay(replayId: string): Promise<HarnessReplayRecord> {
    const filePath = this.replayFile(replayId);
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`Replay not found: ${replayId}`);
    }

    return fs.readJson(filePath) as Promise<HarnessReplayRecord>;
  }

  async replaySession(
    sessionId: string,
    options: ReplaySessionOptions = {}
  ): Promise<HarnessReplayRecord> {
    const session = await this.stateService.getSession(sessionId);
    const [traces, artifacts, checkpoints, sensorRuns, tasks, handoffs] = await Promise.all([
      this.stateService.listTraces(sessionId),
      this.stateService.listArtifacts(sessionId),
      this.stateService.listCheckpoints(sessionId),
      this.sensorsService.getSessionSensorRuns(sessionId),
      this.contractsService.listTaskContracts(),
      this.contractsService.listHandoffContracts(),
    ]);

    const sessionTasks = tasks.filter((task) => task.sessionId === sessionId);
    const sessionHandoffs = handoffs.filter((handoff) => handoff.sessionId === sessionId);

    const events: HarnessReplayEvent[] = [
      {
        id: randomUUID(),
        sessionId,
        createdAt: session.createdAt,
        source: 'session',
        label: `session:${session.name}`,
        payload: options.includePayloads === false
          ? undefined
          : {
              id: session.id,
              status: session.status,
              metadata: session.metadata ?? null,
            },
      },
      ...traces.map((trace) => ({
        id: randomUUID(),
        sessionId,
        createdAt: trace.createdAt,
        source: 'trace' as const,
        label: trace.event,
        payload: options.includePayloads === false
          ? undefined
          : {
              level: trace.level,
              message: trace.message,
              data: trace.data ?? null,
            },
      })),
      ...artifacts.map((artifact) => ({
        id: randomUUID(),
        sessionId,
        createdAt: artifact.createdAt,
        source: 'artifact' as const,
        label: artifact.name,
        payload: options.includePayloads === false
          ? undefined
          : {
              kind: artifact.kind,
              path: artifact.path ?? null,
              metadata: artifact.metadata ?? null,
            },
      })),
      ...checkpoints.map((checkpoint) => ({
        id: randomUUID(),
        sessionId,
        createdAt: checkpoint.createdAt,
        source: 'checkpoint' as const,
        label: checkpoint.note || checkpoint.id,
        payload: options.includePayloads === false
          ? undefined
          : {
              artifactIds: checkpoint.artifactIds,
              data: checkpoint.data ?? null,
            },
      })),
      ...sensorRuns.map((run) => ({
        id: randomUUID(),
        sessionId,
        createdAt: run.createdAt,
        source: 'sensor' as const,
        label: run.sensorId,
        payload: options.includePayloads === false
          ? undefined
          : {
              status: run.status,
              summary: run.summary,
              severity: run.severity,
              blocking: run.blocking,
            },
      })),
      ...sessionTasks.map((task) => ({
        id: randomUUID(),
        sessionId,
        createdAt: task.createdAt,
        source: 'task' as const,
        label: task.title,
        payload: options.includePayloads === false
          ? undefined
          : {
              status: task.status,
              requiredSensors: task.requiredSensors,
              requiredArtifacts: task.requiredArtifacts,
              acceptanceCriteria: task.acceptanceCriteria,
            },
      })),
      ...sessionHandoffs.map((handoff) => ({
        id: randomUUID(),
        sessionId,
        createdAt: handoff.createdAt,
        source: 'handoff' as const,
        label: `${handoff.from} -> ${handoff.to}`,
        payload: options.includePayloads === false
          ? undefined
          : {
              artifacts: handoff.artifacts,
              evidence: handoff.evidence,
            },
      })),
    ];

    const orderedEvents = sortByCreatedAt(events).slice(0, options.maxEvents ?? Number.MAX_SAFE_INTEGER);
    const replay: HarnessReplayRecord = {
      id: randomUUID(),
      sessionId,
      repoPath: this.repoPath,
      createdAt: nowIso(),
      replayedAt: nowIso(),
      fidelity: orderedEvents.length >= events.length ? 'complete' : 'partial',
      eventCount: orderedEvents.length,
      summary: `Replayed ${orderedEvents.length} events for session ${session.name}`,
      events: orderedEvents,
      session,
      artifacts,
      checkpoints,
      traces,
      sensorRuns,
      tasks: sessionTasks,
      handoffs: sessionHandoffs,
    };

    await this.saveReplay(replay);
    return replay;
  }

  async listReplays(filter?: { sessionId?: string }): Promise<HarnessReplayRecord[]> {
    await this.ensureLayout();
    const entries = await fs.readdir(this.replaysPath);
    const replays = await Promise.all(
      entries
        .filter((entry) => entry.endsWith('.json'))
        .map(async (entry) => fs.readJson(path.join(this.replaysPath, entry)) as Promise<HarnessReplayRecord>)
    );

    const filtered = filter?.sessionId
      ? replays.filter((replay) => replay.sessionId === filter.sessionId)
      : replays;

    return filtered.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getReplay(replayId: string): Promise<HarnessReplayRecord> {
    return this.readReplay(replayId);
  }

  async exportFailureDataset(sessionIds?: string[]): Promise<HarnessFailureDataset> {
    const sessions = sessionIds && sessionIds.length > 0
      ? await Promise.all(sessionIds.map((id) => this.stateService.getSession(id)))
      : await this.stateService.listSessions();

    const records: HarnessFailureRecord[] = [];
    for (const session of sessions) {
      const replay = await this.replaySession(session.id, { includePayloads: true });
      const failureEvents = replay.events.filter(
        (event) => event.source === 'sensor' || event.source === 'task' || event.source === 'handoff'
      );

      for (const event of failureEvents) {
        const payload = event.payload as Record<string, unknown> | undefined;

        if (event.source === 'sensor' && payload && (payload.status === 'failed' || payload.blocking === true)) {
          records.push({
            id: event.id,
            sessionId: session.id,
            category: 'sensor',
            signature: `${event.label}:${String(payload.status ?? 'unknown')}`,
            message: event.label,
            severity: payload.blocking === true ? 'error' : 'warning',
            sourceId: event.id,
            evidence: Array.isArray(payload.evidence) ? payload.evidence.map(String) : [],
            details: payload,
          });
          continue;
        }

        if (event.source === 'task' && payload?.status && payload.status !== 'completed') {
          records.push({
            id: event.id,
            sessionId: session.id,
            category: 'contract',
            signature: `task:${event.label}:${String(payload.status)}`,
            message: event.label,
            severity: 'warning',
            sourceId: event.id,
            evidence: [],
            details: payload,
          });
          continue;
        }

        if (event.source === 'handoff') {
          records.push({
            id: event.id,
            sessionId: session.id,
            category: 'handoff',
            signature: `handoff:${event.label}`,
            message: event.label,
            severity: 'warning',
            sourceId: event.id,
            evidence: [],
            details: payload,
          });
        }
      }
    }

    const clustersMap = new Map<string, HarnessFailureCluster>();
    for (const record of records) {
      const existing = clustersMap.get(record.signature);
      if (!existing) {
        clustersMap.set(record.signature, {
          signature: record.signature,
          category: record.category,
          message: record.message,
          count: 1,
          sessionIds: [record.sessionId],
          recordIds: [record.id],
          example: record,
        });
        continue;
      }

      existing.count += 1;
      existing.sessionIds.push(record.sessionId);
      existing.recordIds.push(record.id);
    }

    const dataset: HarnessFailureDataset = {
      id: randomUUID(),
      createdAt: nowIso(),
      repoPath: this.repoPath,
      sessionIds: sessions.map((session) => session.id),
      records,
      clusters: Array.from(clustersMap.values()),
    };

    await this.ensureLayout();
    await fs.writeJson(path.join(this.replaysPath, `dataset-${dataset.id}.json`), dataset, { spaces: 2 });
    return dataset;
  }
}
