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
  type HarnessHandoffContract,
} from './taskContractsService';
import {
  HarnessPolicyService,
  type HarnessPolicyDocument,
  type HarnessPolicyEvaluationInput,
  type HarnessPolicyDecision,
  type HarnessPolicyDefaultEffect,
  type CreateHarnessPolicyRuleInput,
  type HarnessPolicyRule,
  type HarnessPolicyTarget,
  type HarnessPolicyEffect,
} from './policyService';
import { HarnessReplayService, type HarnessReplayRecord } from './replayService';
import { HarnessDatasetService, type HarnessFailureDataset, type HarnessFailureCluster } from './datasetService';

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
  readonly policy: HarnessPolicyService;
  readonly replay: HarnessReplayService;
  readonly datasets: HarnessDatasetService;

  constructor(private readonly options: HarnessExecutionServiceOptions) {
    this.state = new HarnessRuntimeStateService({ repoPath: options.repoPath });
    this.sensors = new HarnessSensorsService({ stateService: this.state });
    this.contracts = new HarnessTaskContractsService({
      repoPath: options.repoPath,
      stateService: this.state,
    });
    this.policy = new HarnessPolicyService({ repoPath: options.repoPath });
    this.replay = new HarnessReplayService({
      repoPath: options.repoPath,
      dependencies: {
        stateService: this.state,
        sensorsService: this.sensors,
        contractsService: this.contracts,
      },
    });
    this.datasets = new HarnessDatasetService({
      repoPath: options.repoPath,
      dependencies: {
        stateService: this.state,
        replayService: this.replay,
        taskContractsService: this.contracts,
      },
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

  async addArtifact(sessionId: string, input: AddArtifactInput) {
    await this.policy.authorize({
      tool: 'harness',
      action: 'addArtifact',
      paths: input.path ? [input.path] : undefined,
      risk: 'medium',
      metadata: input.metadata,
    });
    return this.state.addArtifact(sessionId, input);
  }

  listArtifacts(sessionId: string) {
    return this.state.listArtifacts(sessionId);
  }

  async checkpointSession(sessionId: string, input: CheckpointInput = {}) {
    await this.policy.authorize({
      tool: 'harness',
      action: 'checkpoint',
      risk: input.pause ? 'high' : 'low',
      metadata: { note: input.note },
    });
    return this.state.checkpointSession(sessionId, input);
  }

  resumeSession(sessionId: string) {
    return this.state.resumeSession(sessionId);
  }

  async completeSession(sessionId: string, note?: string) {
    await this.policy.authorize({
      tool: 'harness',
      action: 'completeSession',
      risk: 'high',
      metadata: note ? { note } : undefined,
    });
    return this.state.completeSession(sessionId, note);
  }

  async failSession(sessionId: string, message: string) {
    await this.policy.authorize({
      tool: 'harness',
      action: 'failSession',
      risk: 'high',
      metadata: { message },
    });
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

  async createTaskContract(input: Parameters<HarnessTaskContractsService['createTaskContract']>[0]) {
    await this.policy.authorize({
      tool: 'harness',
      action: 'createTask',
      risk: 'medium',
      metadata: { title: input.title },
    });
    return this.contracts.createTaskContract(input);
  }

  listTaskContracts() {
    return this.contracts.listTaskContracts();
  }

  evaluateTaskCompletion(taskId: string, sessionId?: string): Promise<HarnessTaskCompletionResult> {
    return this.contracts.evaluateTaskCompletion(taskId, sessionId);
  }

  async createHandoffContract(input: Parameters<HarnessTaskContractsService['createHandoffContract']>[0]): Promise<HarnessHandoffContract> {
    await this.policy.authorize({
      tool: 'harness',
      action: 'createHandoff',
      risk: 'medium',
      metadata: { from: input.from, to: input.to },
    });
    return this.contracts.createHandoffContract(input);
  }

  listHandoffContracts() {
    return this.contracts.listHandoffContracts();
  }

  listPolicies(): Promise<HarnessPolicyRule[]> {
    return this.policy.listRules();
  }

  registerPolicy(input: {
    id?: string;
    effect: HarnessPolicyEffect;
    target?: HarnessPolicyTarget;
    pattern?: string;
    approvalRole?: string;
    reason?: string;
    description?: string;
    pathPattern?: string;
    scope?: string;
    metadata?: Record<string, unknown>;
  }) {
    const target = input.target
      ?? (input.pathPattern ? 'path' : input.scope === 'risk' ? 'risk' : 'action');
    const pattern = input.pattern ?? input.pathPattern ?? input.scope ?? input.description ?? input.reason ?? 'harness';
    return this.policy.registerRule({
      id: input.id ?? `policy-${Date.now()}`,
      effect: input.effect,
      target,
      pattern,
      approvalRole: input.approvalRole,
      reason: input.reason ?? input.description,
    } satisfies CreateHarnessPolicyRuleInput);
  }

  getPolicy(): Promise<HarnessPolicyDocument> {
    return this.policy.loadPolicy();
  }

  setPolicy(input: {
    defaultEffect?: HarnessPolicyDefaultEffect;
    rules?: HarnessPolicyRule[];
  }): Promise<HarnessPolicyDocument> {
    const policy: HarnessPolicyDocument = {
      version: 1,
      defaultEffect: input.defaultEffect ?? 'allow',
      rules: input.rules ?? [],
    };
    return this.policy.setPolicy(policy);
  }

  resetPolicy(): Promise<HarnessPolicyDocument> {
    return this.policy.setPolicy(this.policy.createBootstrapPolicy());
  }

  evaluatePolicy(input: HarnessPolicyEvaluationInput): Promise<HarnessPolicyDecision> {
    return this.policy.evaluate(input);
  }

  replaySession(sessionId: string): Promise<HarnessReplayRecord> {
    return this.replay.replaySession(sessionId);
  }

  listReplays(sessionId?: string): Promise<HarnessReplayRecord[]> {
    return this.replay.listReplays(sessionId ? { sessionId } : undefined);
  }

  exportFailureDataset(sessionIds?: string[]): Promise<HarnessFailureDataset> {
    return this.datasets.buildFailureDataset({
      sessionIds,
      includeSuccessfulSessions: true,
    });
  }

  listDatasets(): Promise<HarnessFailureDataset[]> {
    return this.datasets.listDatasets();
  }

  getDataset(datasetId: string): Promise<HarnessFailureDataset> {
    return this.datasets.getDataset(datasetId);
  }

  getFailureClusters(datasetId: string): Promise<HarnessFailureCluster[]> {
    return this.datasets.getFailureClusters(datasetId);
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
