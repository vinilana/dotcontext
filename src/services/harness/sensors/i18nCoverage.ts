/**
 * Built-in `i18n-coverage` sensor.
 *
 * Compares translation keys between a base locale file and every other
 * locale file in `localesDir`. Reports per-locale coverage percentage and
 * the list of missing keys. Passes only when every non-base locale has
 * zero missing keys.
 *
 * Boundary: this sensor lives under `src/services/harness/sensors` and may
 * not import from `workflow/*`. Registration happens in
 * `HarnessSessionFacade.registerDefaultSensors`.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import type {
  HarnessSensorDefinition,
  HarnessSensorExecutionInput,
  HarnessSensorExecutionResult,
} from '../sensorsService';

export interface I18nCoverageOptions {
  baseLocale?: string;
  localesDir?: string;
  format?: 'json' | 'json-nested';
}

export interface I18nCoverageReport {
  coverage: Record<string, number>;
  missingKeys: Record<string, string[]>;
}

const DEFAULTS: Required<I18nCoverageOptions> = {
  baseLocale: 'en',
  localesDir: 'locales',
  format: 'json',
};

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  const out: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenKeys(v, next));
    } else {
      out.push(next);
    }
  }
  return out;
}

function topLevelKeys(value: unknown): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as Record<string, unknown>);
}

function readOptions(input: HarnessSensorExecutionInput): Required<I18nCoverageOptions> {
  const ctx = (input.context && typeof input.context === 'object' ? input.context : {}) as I18nCoverageOptions;
  const meta = (input.metadata && typeof input.metadata === 'object'
    ? (input.metadata as Record<string, unknown>)
    : {}) as I18nCoverageOptions;
  return {
    baseLocale: ctx.baseLocale ?? meta.baseLocale ?? DEFAULTS.baseLocale,
    localesDir: ctx.localesDir ?? meta.localesDir ?? DEFAULTS.localesDir,
    format: (ctx.format ?? meta.format ?? DEFAULTS.format) as 'json' | 'json-nested',
  };
}

export async function executeI18nCoverage(
  repoPath: string,
  input: HarnessSensorExecutionInput
): Promise<HarnessSensorExecutionResult> {
  const opts = readOptions(input);
  const root = path.resolve(repoPath);
  const dir = path.resolve(root, opts.localesDir);
  if (!dir.startsWith(root)) {
    return {
      status: 'failed',
      summary: 'i18n-coverage: localesDir escapes repoPath',
      evidence: [`localesDir resolved outside repoPath: ${dir}`],
    };
  }

  if (!(await fs.pathExists(dir))) {
    return {
      status: 'failed',
      summary: `i18n-coverage: locales directory not found: ${opts.localesDir}`,
      evidence: [`Expected directory at ${dir}`],
    };
  }

  let entries: string[];
  try {
    entries = (await fs.readdir(dir)).filter((name) => name.endsWith('.json'));
  } catch (err: any) {
    return {
      status: 'failed',
      summary: 'i18n-coverage: failed to read locales directory',
      evidence: [`readdir(${dir}): ${err?.message ?? String(err)}`],
    };
  }

  if (entries.length === 0) {
    return {
      status: 'failed',
      summary: 'i18n-coverage: no locale files found',
      evidence: [`No *.json files in ${dir}`],
    };
  }

  const locales: Record<string, unknown> = {};
  for (const file of entries) {
    const localeId = path.basename(file, '.json');
    const filePath = path.join(dir, file);
    try {
      locales[localeId] = await fs.readJson(filePath);
    } catch (err: any) {
      return {
        status: 'failed',
        summary: `i18n-coverage: malformed JSON in ${file}`,
        evidence: [`${filePath}: ${err?.message ?? String(err)}`],
      };
    }
  }

  if (!(opts.baseLocale in locales)) {
    return {
      status: 'failed',
      summary: `i18n-coverage: baseLocale '${opts.baseLocale}' not present in ${opts.localesDir}`,
      evidence: [`Available locales: ${Object.keys(locales).join(', ')}`],
    };
  }

  const extract = opts.format === 'json-nested' ? flattenKeys : topLevelKeys;
  const baseKeys = extract(locales[opts.baseLocale]);
  const baseSet = new Set(baseKeys);

  const report: I18nCoverageReport = { coverage: {}, missingKeys: {} };
  for (const [locale, doc] of Object.entries(locales)) {
    const keys = new Set(extract(doc));
    const missing = baseKeys.filter((k) => !keys.has(k));
    report.missingKeys[locale] = missing;
    report.coverage[locale] = baseSet.size === 0 ? 1 : (baseSet.size - missing.length) / baseSet.size;
  }

  const failingLocales = Object.entries(report.missingKeys)
    .filter(([locale, missing]) => locale !== opts.baseLocale && missing.length > 0)
    .map(([locale, missing]) => `${locale} (missing ${missing.length})`);

  if (failingLocales.length > 0) {
    return {
      status: 'failed',
      summary: `i18n-coverage: incomplete locales: ${failingLocales.join(', ')}`,
      evidence: failingLocales,
      output: report,
    };
  }

  return {
    status: 'passed',
    summary: `i18n-coverage: ${Object.keys(report.coverage).length} locales at 100%`,
    evidence: [`baseLocale=${opts.baseLocale}`, `localesDir=${opts.localesDir}`, `format=${opts.format}`],
    output: report,
  };
}

export function createI18nCoverageSensor(repoPath: string): HarnessSensorDefinition {
  return {
    id: 'i18n-coverage',
    name: 'i18n Coverage',
    description: 'Checks every locale file has the same keys as the base locale.',
    severity: 'critical',
    blocking: true,
    execute: (input) => executeI18nCoverage(repoPath, input),
  };
}
