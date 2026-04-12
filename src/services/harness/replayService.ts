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

  async buildReplay(
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

    return replay;
  }

  async replaySession(
    sessionId: string,
    options: ReplaySessionOptions = {}
  ): Promise<HarnessReplayRecord> {
    const replay = await this.buildReplay(sessionId, options);
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
}
