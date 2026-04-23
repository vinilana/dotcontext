import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { HarnessRuntimeStateService } from '../runtimeStateService';
import { HarnessSensorsService } from '../sensorsService';
import { createI18nCoverageSensor, executeI18nCoverage } from './i18nCoverage';

describe('i18n-coverage sensor', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-coverage-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  async function writeLocale(name: string, doc: unknown): Promise<void> {
    const dir = path.join(tempDir, 'locales');
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, `${name}.json`), doc);
  }

  it('passes when every non-base locale matches the base keyset', async () => {
    await writeLocale('en', { hello: 'Hello', bye: 'Bye' });
    await writeLocale('pt', { hello: 'Olá', bye: 'Tchau' });

    const result = await executeI18nCoverage(tempDir, { sessionId: 'x' });
    expect(result.status).toBe('passed');
    const out = result.output as { coverage: Record<string, number> };
    expect(out.coverage.pt).toBe(1);
  });

  it('fails when a locale is missing keys and reports them', async () => {
    await writeLocale('en', { a: '1', b: '2', c: '3' });
    await writeLocale('pt', { a: 'um', b: 'dois', c: 'tres' });
    await writeLocale('es', { a: 'uno' });

    const result = await executeI18nCoverage(tempDir, { sessionId: 'x' });
    expect(result.status).toBe('failed');
    expect(result.summary).toContain('es');
    const out = result.output as { missingKeys: Record<string, string[]>; coverage: Record<string, number> };
    expect(out.missingKeys.es.sort()).toEqual(['b', 'c']);
    expect(out.missingKeys.pt).toEqual([]);
    expect(out.coverage.es).toBeCloseTo(1 / 3);
  });

  it('fails clearly when localesDir is absent', async () => {
    const result = await executeI18nCoverage(tempDir, { sessionId: 'x' });
    expect(result.status).toBe('failed');
    expect(result.summary).toMatch(/locales directory not found/);
  });

  it('fails with file name when JSON is malformed', async () => {
    const dir = path.join(tempDir, 'locales');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'en.json'), '{ not: valid');

    const result = await executeI18nCoverage(tempDir, { sessionId: 'x' });
    expect(result.status).toBe('failed');
    expect(result.summary).toContain('en.json');
  });

  it('supports nested keys via format=json-nested', async () => {
    await writeLocale('en', { greetings: { hi: 'Hi', bye: 'Bye' } });
    await writeLocale('pt', { greetings: { hi: 'Oi' } });

    const result = await executeI18nCoverage(tempDir, {
      sessionId: 'x',
      context: { format: 'json-nested' },
    });
    expect(result.status).toBe('failed');
    const out = result.output as { missingKeys: Record<string, string[]> };
    expect(out.missingKeys.pt).toEqual(['greetings.bye']);
  });

  it('integrates with HarnessSensorsService and persists a sensor.run trace', async () => {
    await writeLocale('en', { a: '1' });
    await writeLocale('pt', { a: '1' });

    const stateService = new HarnessRuntimeStateService({ repoPath: tempDir });
    const sensors = new HarnessSensorsService({ stateService });
    sensors.registerSensor(createI18nCoverageSensor(tempDir));
    const session = await stateService.createSession({ name: 'i18n-run' });

    const run = await sensors.runSensor('i18n-coverage', { sessionId: session.id });
    expect(run.status).toBe('passed');
    const runs = await sensors.getSessionSensorRuns(session.id);
    expect(runs.find((r) => r.sensorId === 'i18n-coverage')?.status).toBe('passed');
  });
});
