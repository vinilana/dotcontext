import {
  HarnessRuntimeStateService,
  type AddArtifactInput,
  type AppendTraceInput,
  type CheckpointInput,
  type CreateSessionInput,
  type HarnessSessionRecord,
} from './runtimeStateService';
import {
  HarnessSensorsService,
  type HarnessBackpressurePolicy,
  type HarnessBackpressureResult,
  type HarnessSensorDefinition,
  type HarnessSensorExecutionInput,
  type HarnessSensorRun,
} from './sensorsService';
import {
  HarnessTaskContractsService,
  type HarnessTaskCompletionResult,
  type HarnessTaskContract,
  type HarnessHandoffContract,
} from './taskContractsService';

export interface HarnessExecutionServiceOptions {
  repoPath: string;
}

export interface HarnessSessionQualitySnapshot {
  session: HarnessSessionRecord;
  sensorRuns: HarnessSensorRun[];
  backpressure: HarnessBackpressureResult;
  taskEvaluation: HarnessTaskCompletionResult | null;
}

export class HarnessExecutionService {
  readonly state: HarnessRuntimeStateService;
  readonly sensors: HarnessSensorsService;
  readonly contracts: HarnessTaskContractsService;

  constructor(private readonly options: HarnessExecutionServiceOptions) {
    this.state = new HarnessRuntimeStateService({ repoPath: options.repoPath });
    this.sensors = new HarnessSensorsService({ stateService: this.state });
    this.contracts = new HarnessTaskContractsService({
      repoPath: options.repoPath,
      stateService: this.state,
    });
  }

  createSession(input: CreateSessionInput) {
    return this.state.createSession(input);
  }

  listSessions() {
    return this.state.listSessions();
  }

  getSession(sessionId: string) {
    return this.state.getSession(sessionId);
  }

  appendTrace(sessionId: string, input: AppendTraceInput) {
    return this.state.appendTrace(sessionId, input);
  }

  listTraces(sessionId: string) {
    return this.state.listTraces(sessionId);
  }

  addArtifact(sessionId: string, input: AddArtifactInput) {
    return this.state.addArtifact(sessionId, input);
  }

  listArtifacts(sessionId: string) {
    return this.state.listArtifacts(sessionId);
  }

  checkpointSession(sessionId: string, input: CheckpointInput = {}) {
    return this.state.checkpointSession(sessionId, input);
  }

  resumeSession(sessionId: string) {
    return this.state.resumeSession(sessionId);
  }

  completeSession(sessionId: string, note?: string) {
    return this.state.completeSession(sessionId, note);
  }

  failSession(sessionId: string, message: string) {
    return this.state.failSession(sessionId, message);
  }

  async runSensor(
    definition: HarnessSensorDefinition,
    input: HarnessSensorExecutionInput
  ): Promise<HarnessSensorRun> {
    this.sensors.registerSensor(definition);
    return this.sensors.runSensor(definition.id, input);
  }

  getSessionSensorRuns(sessionId: string) {
    return this.sensors.getSessionSensorRuns(sessionId);
  }

  createTaskContract(input: Parameters<HarnessTaskContractsService['createTaskContract']>[0]) {
    return this.contracts.createTaskContract(input);
  }

  listTaskContracts() {
    return this.contracts.listTaskContracts();
  }

  evaluateTaskCompletion(taskId: string, sessionId?: string): Promise<HarnessTaskCompletionResult> {
    return this.contracts.evaluateTaskCompletion(taskId, sessionId);
  }

  createHandoffContract(input: Parameters<HarnessTaskContractsService['createHandoffContract']>[0]): Promise<HarnessHandoffContract> {
    return this.contracts.createHandoffContract(input);
  }

  listHandoffContracts() {
    return this.contracts.listHandoffContracts();
  }

  async getSessionQuality(
    sessionId: string,
    options: {
      taskId?: string;
      policy?: HarnessBackpressurePolicy;
    } = {}
  ): Promise<HarnessSessionQualitySnapshot> {
    const [session, sensorRuns, taskEvaluation] = await Promise.all([
      this.state.getSession(sessionId),
      this.sensors.getSessionSensorRuns(sessionId),
      options.taskId
        ? this.contracts.evaluateTaskCompletion(options.taskId, sessionId)
        : Promise.resolve(null),
    ]);

    const backpressure = this.sensors.evaluateBackpressure(sensorRuns, options.policy);
    return {
      session,
      sensorRuns,
      backpressure,
      taskEvaluation,
    };
  }
}

