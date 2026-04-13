import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { HarnessRuntimeStateService } from './runtimeStateService';
import { HarnessSensorsService } from './sensorsService';
import { HarnessTaskContractsService } from './taskContractsService';

describe('HarnessTaskContractsService', () => {
  let tempDir: string;
  let stateService: HarnessRuntimeStateService;
  let sensorsService: HarnessSensorsService;
  let service: HarnessTaskContractsService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-contracts-'));
    stateService = new HarnessRuntimeStateService({ repoPath: tempDir });
    sensorsService = new HarnessSensorsService({ stateService });
    service = new HarnessTaskContractsService({ repoPath: tempDir, stateService });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('persists contracts and evaluates completion against sensors and artifacts', async () => {
    sensorsService.registerSensor({
      id: 'build',
      name: 'Build',
      severity: 'critical',
      execute: async () => ({
        status: 'passed',
        summary: 'Build succeeded',
        evidence: ['build log'],
      }),
    });

    const session = await stateService.createSession({ name: 'task-run' });
    await stateService.addArtifact(session.id, {
      name: 'plans/alpha.md',
      kind: 'file',
      path: 'plans/alpha.md',
    });
    await sensorsService.runSensor('build', { sessionId: session.id });

    const task = await service.createTaskContract({
      title: 'Implement alpha',
      sessionId: session.id,
      requiredSensors: ['build'],
      requiredArtifacts: ['plans/alpha.md'],
      expectedOutputs: ['src/alpha.ts'],
      acceptanceCriteria: ['build passes'],
    });

    const evaluation = await service.evaluateTaskCompletion(task.id, session.id);
    const tasks = await service.listTaskContracts();
    const handoff = await service.createHandoffContract({
      from: 'planner',
      to: 'executor',
      sessionId: session.id,
      taskId: task.id,
      artifacts: ['plans/alpha.md'],
      evidence: ['build log'],
    });

    expect(evaluation.canComplete).toBe(true);
    expect(evaluation.missingSensors).toHaveLength(0);
    expect(evaluation.missingArtifacts).toHaveLength(0);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Implement alpha');
    expect(handoff.from).toBe('planner');

    const contractPath = path.join(tempDir, '.context', 'harness', 'contracts', 'tasks', `${task.id}.json`);
    expect(await fs.pathExists(contractPath)).toBe(true);
  });

  describe('structured artifact specs', () => {
    it('glob spec with minMatches blocks when fewer artifacts match', async () => {
      const session = await stateService.createSession({ name: 'glob-min' });
      await stateService.addArtifact(session.id, {
        name: 'pt-BR.json', kind: 'file', path: 'locales/pt-BR.json',
      });
      await stateService.addArtifact(session.id, {
        name: 'en-US.json', kind: 'file', path: 'locales/en-US.json',
      });

      const task = await service.createTaskContract({
        title: 'i18n coverage',
        sessionId: session.id,
        requiredSensors: [],
        requiredArtifacts: [{ kind: 'glob', glob: 'locales/**/*.json', minMatches: 5 }],
      });

      const evaluation = await service.evaluateTaskCompletion(task.id, session.id);
      expect(evaluation.canComplete).toBe(false);
      expect(evaluation.missingArtifacts).toHaveLength(1);
      expect(evaluation.missingArtifacts[0]).toContain('locales/**/*.json');
      expect(evaluation.missingArtifacts[0]).toContain('min=5');
      expect(evaluation.missingArtifacts[0]).toContain('got 2');
    });

    it('glob spec with minMatches passes when enough artifacts match', async () => {
      const session = await stateService.createSession({ name: 'glob-ok' });
      for (const locale of ['pt', 'en', 'es', 'fr', 'de']) {
        await stateService.addArtifact(session.id, {
          name: `${locale}.json`, kind: 'file', path: `locales/${locale}.json`,
        });
      }

      const task = await service.createTaskContract({
        title: 'i18n coverage ok',
        sessionId: session.id,
        requiredArtifacts: [{ kind: 'glob', glob: 'locales/**/*.json', minMatches: 5 }],
      });

      const evaluation = await service.evaluateTaskCompletion(task.id, session.id);
      expect(evaluation.canComplete).toBe(true);
      expect(evaluation.matchedArtifacts).toHaveLength(5);
    });

    it('file-count spec mirrors glob with minMatches=min', async () => {
      const session = await stateService.createSession({ name: 'fc' });
      await stateService.addArtifact(session.id, {
        name: 'a.md', kind: 'file', path: 'docs/a.md',
      });

      const task = await service.createTaskContract({
        title: 'file-count fail',
        sessionId: session.id,
        requiredArtifacts: [{ kind: 'file-count', glob: 'docs/*.md', min: 3 }],
      });

      const evaluation = await service.evaluateTaskCompletion(task.id, session.id);
      expect(evaluation.canComplete).toBe(false);
      expect(evaluation.missingArtifacts[0]).toContain('file-count');
      expect(evaluation.missingArtifacts[0]).toContain('min=3');
      expect(evaluation.missingArtifacts[0]).toContain('got 1');
    });

    it('mixes string (legacy) and structured specs', async () => {
      const session = await stateService.createSession({ name: 'mix' });
      await stateService.addArtifact(session.id, {
        name: 'handoff', kind: 'text', path: 'handoff',
      });
      await stateService.addArtifact(session.id, {
        name: 'a.json', kind: 'file', path: 'locales/a.json',
      });

      const task = await service.createTaskContract({
        title: 'mix',
        sessionId: session.id,
        requiredArtifacts: [
          'handoff',
          { kind: 'glob', glob: 'locales/*.json' },
        ],
      });

      const evaluation = await service.evaluateTaskCompletion(task.id, session.id);
      expect(evaluation.canComplete).toBe(true);
      expect(evaluation.missingArtifacts).toHaveLength(0);
    });
  });
});

