import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import {
  detectFeatures,
  mergeSuggestionsIntoPhases,
  suggestPhaseRequirements,
} from './scaffoldSuggestions';

describe('scaffoldSuggestions', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scaffold-suggest-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  async function writePackageJson(scripts?: Record<string, string>, extras: Record<string, unknown> = {}) {
    await fs.writeJson(path.join(tempDir, 'package.json'), { name: 'x', version: '0.0.0', scripts, ...extras });
  }

  it('returns an empty object for an empty repo', async () => {
    expect(await suggestPhaseRequirements(tempDir)).toEqual({});
  });

  it('detects locales/*.json and suggests i18n-coverage in E', async () => {
    await fs.ensureDir(path.join(tempDir, 'locales'));
    await fs.writeJson(path.join(tempDir, 'locales', 'en.json'), { hello: 'Hello' });

    const features = await detectFeatures(tempDir);
    expect(features.hasI18n).toBe(true);

    const out = await suggestPhaseRequirements(tempDir);
    expect(out.E?.requiredSensors).toContain('i18n-coverage');
    expect(out.V).toBeUndefined();
  });

  it('detects i18n/*.json under i18n directory too', async () => {
    await fs.ensureDir(path.join(tempDir, 'i18n'));
    await fs.writeJson(path.join(tempDir, 'i18n', 'en.json'), { hi: 'hi' });
    const out = await suggestPhaseRequirements(tempDir);
    expect(out.E?.requiredSensors).toContain('i18n-coverage');
  });

  it('detects package.json test script and suggests tests-passing in V', async () => {
    await writePackageJson({ test: 'jest' });
    const out = await suggestPhaseRequirements(tempDir);
    expect(out.V?.requiredSensors).toContain('tests-passing');
  });

  it('ignores the npm-init placeholder test script', async () => {
    await writePackageJson({ test: 'echo "Error: no test specified" && exit 1' });
    const out = await suggestPhaseRequirements(tempDir);
    expect(out.V?.requiredSensors ?? []).not.toContain('tests-passing');
  });

  it('detects tsconfig.json and suggests typecheck-clean in V', async () => {
    await fs.writeJson(path.join(tempDir, 'tsconfig.json'), { compilerOptions: {} });
    const out = await suggestPhaseRequirements(tempDir);
    expect(out.V?.requiredSensors).toContain('typecheck-clean');
  });

  it('detects .eslintrc and suggests lint in V', async () => {
    await fs.writeFile(path.join(tempDir, '.eslintrc.json'), '{}');
    const out = await suggestPhaseRequirements(tempDir);
    expect(out.V?.requiredSensors).toContain('lint');
  });

  it('combines all detected features in deterministic order', async () => {
    await fs.ensureDir(path.join(tempDir, 'locales'));
    await fs.writeJson(path.join(tempDir, 'locales', 'en.json'), {});
    await writePackageJson({ test: 'jest' });
    await fs.writeJson(path.join(tempDir, 'tsconfig.json'), {});
    await fs.writeFile(path.join(tempDir, '.eslintrc.cjs'), '');

    const out = await suggestPhaseRequirements(tempDir);
    expect(out.E?.requiredSensors).toEqual(['i18n-coverage']);
    expect(out.V?.requiredSensors).toEqual(['tests-passing', 'typecheck-clean', 'lint']);
  });

  describe('mergeSuggestionsIntoPhases', () => {
    it('only fills required_sensors when the phase has none', async () => {
      const phases: Array<{ id: string; name: string; prevc: 'P' | 'E' | 'V'; required_sensors?: string[] }> = [
        { id: 'p1', name: 'P', prevc: 'P' },
        { id: 'p2', name: 'E', prevc: 'E', required_sensors: ['custom'] },
        { id: 'p3', name: 'V', prevc: 'V' },
      ];
      const merged = mergeSuggestionsIntoPhases(phases, {
        E: { requiredSensors: ['i18n-coverage'], requiredArtifacts: [] },
        V: { requiredSensors: ['tests-passing'], requiredArtifacts: [] },
      });
      expect(merged[0].required_sensors).toBeUndefined();
      expect(merged[1].required_sensors).toEqual(['custom']);
      expect(merged[2].required_sensors).toEqual(['tests-passing']);
    });

    it('does not touch phases with no matching suggestion', async () => {
      const phases: Array<{ id: string; name: string; prevc: 'E'; required_sensors?: string[] }> = [
        { id: 'p1', name: 'E', prevc: 'E' },
      ];
      const merged = mergeSuggestionsIntoPhases(phases, {});
      expect(merged[0].required_sensors).toBeUndefined();
    });
  });
});
