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

    describe('fromFilesystem', () => {
      it('counts filesystem matches in addition to recorded artifacts (glob)', async () => {
        const session = await stateService.createSession({ name: 'fs-glob' });
        const localesDir = path.join(tempDir, 'locales');
        await fs.ensureDir(localesDir);
        await fs.writeJson(path.join(localesDir, 'pt.json'), {});
        await fs.writeJson(path.join(localesDir, 'en.json'), {});
        await fs.writeJson(path.join(localesDir, 'es.json'), {});
        // recorded only one (and a different path) — fs scan must still satisfy.
        await stateService.addArtifact(session.id, {
          name: 'fr.json', kind: 'file', path: 'locales/fr.json',
        });

        const task = await service.createTaskContract({
          title: 'fs glob',
          sessionId: session.id,
          requiredArtifacts: [
            { kind: 'glob', glob: 'locales/*.json', minMatches: 4, fromFilesystem: true },
          ],
        });

        const evaluation = await service.evaluateTaskCompletion(task.id, session.id);
        expect(evaluation.canComplete).toBe(true);
      });

      it('blocks when neither recorded nor filesystem matches reach minMatches', async () => {
        const session = await stateService.createSession({ name: 'fs-empty' });
        // empty repo, no locales dir, no recorded artifacts.
        const task = await service.createTaskContract({
          title: 'fs empty',
          sessionId: session.id,
          requiredArtifacts: [
            { kind: 'glob', glob: 'locales/*.json', minMatches: 1, fromFilesystem: true },
          ],
        });

        const evaluation = await service.evaluateTaskCompletion(task.id, session.id);
        expect(evaluation.canComplete).toBe(false);
        expect(evaluation.missingArtifacts[0]).toContain('got 0');
      });

      it('mixes recorded + filesystem (file-count, deduplicated)', async () => {
        const session = await stateService.createSession({ name: 'fs-mix' });
        const docsDir = path.join(tempDir, 'docs');
        await fs.ensureDir(docsDir);
        await fs.writeFile(path.join(docsDir, 'a.md'), '# a');
        await fs.writeFile(path.join(docsDir, 'b.md'), '# b');
        // Same path also recorded → must NOT double-count.
        await stateService.addArtifact(session.id, {
          name: 'a.md', kind: 'file', path: 'docs/a.md',
        });

        const taskOk = await service.createTaskContract({
          title: 'fs mix ok',
          sessionId: session.id,
          requiredArtifacts: [
            { kind: 'file-count', glob: 'docs/*.md', min: 2, fromFilesystem: true },
          ],
        });
        expect((await service.evaluateTaskCompletion(taskOk.id, session.id)).canComplete).toBe(true);

        const taskFail = await service.createTaskContract({
          title: 'fs mix fail',
          sessionId: session.id,
          requiredArtifacts: [
            { kind: 'file-count', glob: 'docs/*.md', min: 5, fromFilesystem: true },
          ],
        });
        const ev = await service.evaluateTaskCompletion(taskFail.id, session.id);
        expect(ev.canComplete).toBe(false);
        expect(ev.missingArtifacts[0]).toContain('got 2');
      });

      it('does not scan filesystem when fromFilesystem is omitted (backwards compat)', async () => {
        const session = await stateService.createSession({ name: 'no-fs' });
        const localesDir = path.join(tempDir, 'locales');
        await fs.ensureDir(localesDir);
        await fs.writeJson(path.join(localesDir, 'pt.json'), {});

        const task = await service.createTaskContract({
          title: 'no fs',
          sessionId: session.id,
          requiredArtifacts: [{ kind: 'glob', glob: 'locales/*.json', minMatches: 1 }],
        });
        const ev = await service.evaluateTaskCompletion(task.id, session.id);
        expect(ev.canComplete).toBe(false);
        expect(ev.missingArtifacts[0]).toContain('got 0');
      });
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

