/**
 * YAML Front Matter utilities for status detection
 *
 * Allows instant detection of unfilled files by reading only the first line.
 * Supports both v1 (simple) and v2 (scaffold) frontmatter formats.
 */

import { load as loadYaml } from 'js-yaml';
import { PrevcPhase } from '../workflow/types';
import type { ScaffoldFrontmatter, ScaffoldFileType, ScaffoldStatus } from '../types/scaffoldFrontmatter';
import type { RequiredArtifactInput, RequiredArtifactSpec } from '../services/harness/taskContractsService';

/**
 * Legacy v1 frontmatter (simple status tracking)
 */
export interface FrontMatter {
  status?: 'unfilled' | 'filled';
  generated?: string;
  [key: string]: string | undefined;
}

/**
 * Parsed v2 scaffold frontmatter
 */
export interface ParsedScaffoldFrontmatter {
  type: ScaffoldFileType;
  name: string;
  description: string;
  generated: string;
  status: ScaffoldStatus;
  scaffoldVersion: '2.0.0';
  // Type-specific fields
  category?: string;
  agentType?: string;
  skillSlug?: string;
  planSlug?: string;
  phases?: string[];
  mode?: boolean;
  disableModelInvocation?: boolean;
  summary?: string;
  agents?: Array<{ type: string; role: string }>;
  docs?: string[];
  planPhases?: ParsedPlanPhaseFrontmatter[];
}

export interface ParsedPlanStepFrontmatter {
  order: number;
  description: string;
  assignee?: string;
  deliverables?: string[];
}

export interface ParsedPlanPhaseFrontmatter {
  id: string;
  name: string;
  prevc: PrevcPhase;
  summary?: string;
  deliverables?: string[];
  steps?: ParsedPlanStepFrontmatter[];
  requiredSensors?: string[];
  requiredArtifacts?: RequiredArtifactInput[];
}

/**
 * Check if frontmatter is v2 scaffold format
 */
export function isScaffoldFrontmatter(fm: FrontMatter | ParsedScaffoldFrontmatter): fm is ParsedScaffoldFrontmatter {
  return 'scaffoldVersion' in fm && fm.scaffoldVersion === '2.0.0';
}

const FRONT_MATTER_DELIMITER = '---';

function loadYamlFrontMatter(content: string): Record<string, unknown> | null {
  try {
    const parsed = loadYaml(content);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (typeof value === 'string') {
    return [value];
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? item : null))
    .filter((item): item is string => item !== null);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeArtifactSpec(value: unknown): RequiredArtifactInput | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  const kind = typeof obj.kind === 'string' ? obj.kind : null;
  switch (kind) {
    case 'name':
      return typeof obj.name === 'string' && obj.name.length > 0
        ? ({ kind: 'name', name: obj.name } as RequiredArtifactSpec)
        : null;
    case 'path':
      return typeof obj.path === 'string' && obj.path.length > 0
        ? ({ kind: 'path', path: obj.path } as RequiredArtifactSpec)
        : null;
    case 'glob': {
      if (typeof obj.glob !== 'string' || obj.glob.length === 0) return null;
      const min = typeof obj.minMatches === 'number' && obj.minMatches > 0
        ? obj.minMatches
        : undefined;
      const spec: RequiredArtifactSpec = min !== undefined
        ? { kind: 'glob', glob: obj.glob, minMatches: min }
        : { kind: 'glob', glob: obj.glob };
      return spec;
    }
    case 'file-count': {
      if (typeof obj.glob !== 'string' || obj.glob.length === 0) return null;
      if (typeof obj.min !== 'number' || obj.min <= 0) return null;
      return { kind: 'file-count', glob: obj.glob, min: obj.min } as RequiredArtifactSpec;
    }
    default:
      return null;
  }
}

function normalizeArtifactSpecArray(value: unknown): RequiredArtifactInput[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const out: RequiredArtifactInput[] = [];
  for (const item of value) {
    const spec = normalizeArtifactSpec(item);
    if (spec !== null) out.push(spec);
  }
  return out.length > 0 ? out : undefined;
}

function normalizePlanSteps(value: unknown): ParsedPlanStepFrontmatter[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const steps: ParsedPlanStepFrontmatter[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const step = item as Record<string, unknown>;
    const order = typeof step.order === 'number'
      ? step.order
      : typeof step.order === 'string' && step.order.trim() !== '' && !Number.isNaN(Number(step.order))
        ? Number(step.order)
        : null;
    const description = typeof step.description === 'string' ? step.description : null;

    if (order === null || description === null) {
      continue;
    }

    const deliverables = normalizeStringArray(step.deliverables ?? step.outputs);

    steps.push({
      order,
      description,
      assignee: typeof step.assignee === 'string' ? step.assignee : undefined,
      deliverables,
    });
  }

  return steps.length > 0 ? steps : undefined;
}

function normalizePlanPhases(value: unknown): ParsedPlanPhaseFrontmatter[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const phases: ParsedPlanPhaseFrontmatter[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const phase = item as Record<string, unknown>;
    const id = typeof phase.id === 'string' ? phase.id : null;
    const name = typeof phase.name === 'string' ? phase.name : null;
    const prevc = typeof phase.prevc === 'string' ? phase.prevc : null;

    if (!id || !name || !prevc) {
      continue;
    }

    const steps = normalizePlanSteps(phase.steps);
    const deliverables = normalizeStringArray(phase.deliverables ?? phase.outputs);
    const requiredSensors = normalizeStringArray(
      phase.required_sensors ?? phase.requiredSensors
    );
    const requiredArtifacts = normalizeArtifactSpecArray(
      phase.required_artifacts ?? phase.requiredArtifacts
    );

    phases.push({
      id,
      name,
      prevc: prevc as PrevcPhase,
      summary: typeof phase.summary === 'string' ? phase.summary : undefined,
      deliverables,
      steps,
      requiredSensors,
      requiredArtifacts,
    });
  }

  return phases.length > 0 ? phases : undefined;
}

function normalizeParsedScaffoldFrontMatter(frontMatter: Record<string, unknown>): ParsedScaffoldFrontmatter | null {
  const type = frontMatter.type;
  const scaffoldVersion = frontMatter.scaffoldVersion;

  if (type !== 'doc' && type !== 'agent' && type !== 'skill' && type !== 'plan') {
    return null;
  }

  if (scaffoldVersion !== '2.0.0') {
    return null;
  }

  const normalized: ParsedScaffoldFrontmatter = {
    type,
    name: typeof frontMatter.name === 'string' ? frontMatter.name : '',
    description: typeof frontMatter.description === 'string' ? frontMatter.description : '',
    generated: typeof frontMatter.generated === 'string' ? frontMatter.generated : '',
    status: frontMatter.status === 'filled' ? 'filled' : 'unfilled',
    scaffoldVersion: '2.0.0',
  };

  if (typeof frontMatter.category === 'string') {
    normalized.category = frontMatter.category;
  }

  if (typeof frontMatter.agentType === 'string') {
    normalized.agentType = frontMatter.agentType;
  }

  const phases = normalizeStringArray(frontMatter.phases);
  if (phases) {
    normalized.phases = phases;
  }

  if (typeof frontMatter.mode === 'boolean') {
    normalized.mode = frontMatter.mode;
  }

  const disableModelInvocation = frontMatter.disableModelInvocation
    ?? frontMatter['disable-model-invocation']
    ?? frontMatter.disable_model_invocation;
  if (typeof disableModelInvocation === 'boolean') {
    normalized.disableModelInvocation = disableModelInvocation;
  }

  if (typeof frontMatter.skillSlug === 'string') {
    normalized.skillSlug = frontMatter.skillSlug;
  }

  if (typeof frontMatter.planSlug === 'string') {
    normalized.planSlug = frontMatter.planSlug;
  }

  if (typeof frontMatter.summary === 'string') {
    normalized.summary = frontMatter.summary;
  }

  if (Array.isArray(frontMatter.agents)) {
    normalized.agents = frontMatter.agents
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }

        const agent = item as Record<string, unknown>;
        if (typeof agent.type !== 'string') {
          return null;
        }

        return {
          type: agent.type,
          role: typeof agent.role === 'string' ? agent.role : '',
        };
      })
      .filter((item): item is { type: string; role: string } => item !== null);
  }

  const docs = normalizeStringArray(frontMatter.docs);
  if (docs) {
    normalized.docs = docs;
  }

  if (type === 'plan') {
    const planPhases = normalizePlanPhases(frontMatter.phases);
    if (planPhases) {
      normalized.planPhases = planPhases;
    }
  }

  if (!normalized.name || !normalized.description || !normalized.generated) {
    return null;
  }

  return normalized;
}

/**
 * Check if a file needs to be filled by reading only the frontmatter block.
 * Searches for 'status: unfilled' only within the YAML frontmatter (between --- delimiters),
 * not in the document body where example code might contain the same string.
 */
export async function needsFill(filePath: string): Promise<boolean> {
  try {
    const { readFile } = await import('fs-extra');
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    if (lines[0]?.trim() !== FRONT_MATTER_DELIMITER) {
      return false;
    }

    for (let i = 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === FRONT_MATTER_DELIMITER) {
        break; // End of frontmatter
      }
      if (trimmed.includes('status: unfilled')) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Parse YAML front matter from content string
 */
export function parseFrontMatter(content: string): { frontMatter: FrontMatter | null; body: string } {
  const lines = content.split('\n');

  if (lines[0]?.trim() !== FRONT_MATTER_DELIMITER) {
    return { frontMatter: null, body: content };
  }

  const endIndex = lines.findIndex((line, i) => i > 0 && line.trim() === FRONT_MATTER_DELIMITER);

  if (endIndex === -1) {
    return { frontMatter: null, body: content };
  }

  const frontMatterLines = lines.slice(1, endIndex);
  const frontMatter: FrontMatter = {};

  for (const line of frontMatterLines) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      frontMatter[match[1]] = match[2].trim();
    }
  }

  const body = lines.slice(endIndex + 1).join('\n').replace(/^\n+/, '');

  return { frontMatter, body };
}

/**
 * Add front matter to content
 */
export function addFrontMatter(content: string, frontMatter: FrontMatter): string {
  const lines = [FRONT_MATTER_DELIMITER];

  for (const [key, value] of Object.entries(frontMatter)) {
    if (value !== undefined) {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push(FRONT_MATTER_DELIMITER);
  lines.push('');

  return lines.join('\n') + content;
}

/**
 * Remove front matter from content (used after filling)
 */
export function removeFrontMatter(content: string): string {
  const { body } = parseFrontMatter(content);
  return body;
}

/**
 * Check if content has front matter
 */
export function hasFrontMatter(content: string): boolean {
  return content.trimStart().startsWith(FRONT_MATTER_DELIMITER);
}

/**
 * Create standard unfilled front matter
 */
export function createUnfilledFrontMatter(): FrontMatter {
  return {
    status: 'unfilled',
    generated: new Date().toISOString().split('T')[0]
  };
}

/**
 * Get all unfilled files in a directory
 */
export async function getUnfilledFiles(contextDir: string): Promise<string[]> {
  const { glob } = await import('glob');
  const files = await glob(`${contextDir}/**/*.md`);

  const results = await Promise.all(
    files.map(async (file) => ({
      file,
      unfilled: await needsFill(file)
    }))
  );

  return results.filter(r => r.unfilled).map(r => r.file);
}

/**
 * Count filled vs unfilled files
 */
export async function getFilledStats(contextDir: string): Promise<{
  total: number;
  filled: number;
  unfilled: number;
  files: { path: string; filled: boolean }[];
}> {
  const { glob } = await import('glob');
  const files = await glob(`${contextDir}/**/*.md`);

  const results = await Promise.all(
    files.map(async (file) => ({
      path: file,
      filled: !(await needsFill(file))
    }))
  );

  return {
    total: results.length,
    filled: results.filter(r => r.filled).length,
    unfilled: results.filter(r => !r.filled).length,
    files: results
  };
}

/**
 * Parse scaffold frontmatter with support for arrays and nested objects
 */
export function parseScaffoldFrontMatter(content: string): {
  frontMatter: ParsedScaffoldFrontmatter | null;
  body: string;
} {
  const lines = content.split('\n');

  if (lines[0]?.trim() !== FRONT_MATTER_DELIMITER) {
    return { frontMatter: null, body: content };
  }

  const endIndex = lines.findIndex((line, i) => i > 0 && line.trim() === FRONT_MATTER_DELIMITER);

  if (endIndex === -1) {
    return { frontMatter: null, body: content };
  }

  const frontMatterLines = lines.slice(1, endIndex);
  const frontMatterContent = frontMatterLines.join('\n');
  const frontMatter = loadYamlFrontMatter(frontMatterContent);

  const body = lines.slice(endIndex + 1).join('\n').replace(/^\n+/, '');

  if (!frontMatter) {
    return { frontMatter: null, body: content };
  }

  const normalized = normalizeParsedScaffoldFrontMatter(frontMatter);

  return {
    frontMatter: normalized,
    body,
  };
}

/**
 * Get the document name from frontmatter (works for both v1 and v2)
 */
export function getDocumentName(content: string): string | null {
  // Try v2 first
  const { frontMatter: scaffoldFm } = parseScaffoldFrontMatter(content);
  if (scaffoldFm && scaffoldFm.name) {
    return scaffoldFm.name;
  }

  // Fall back to v1
  const { frontMatter } = parseFrontMatter(content);
  if (frontMatter && frontMatter.name) {
    return frontMatter.name;
  }

  return null;
}

/**
 * Check if content is v2 scaffold format
 */
export function isScaffoldContent(content: string): boolean {
  const { frontMatter } = parseScaffoldFrontMatter(content);
  return frontMatter !== null;
}
