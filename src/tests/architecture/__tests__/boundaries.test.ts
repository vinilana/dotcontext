import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..', '..', '..');
const INTEGRATIONS_ROOT = path.join(SRC_ROOT, 'integrations');
const HARNESS_DOMAIN_ROOT = path.join(SRC_ROOT, 'harness', 'domain');
const HARNESS_APPLICATION_ROOT = path.join(SRC_ROOT, 'harness', 'application');
const HARNESS_ADAPTERS_ROOT = path.join(SRC_ROOT, 'harness', 'adapters');
const FORBIDDEN_INTEGRATION_ROOTS = [
  path.join(SRC_ROOT, 'cli'),
  path.join(SRC_ROOT, 'mcp'),
];
const HARNESS_ROOTS = [
  path.join(SRC_ROOT, 'harness'),
].filter((dir) => fs.existsSync(dir));
const REMOVED_ARCHITECTURE_ROOTS = [
  path.join(SRC_ROOT, 'services'),
  path.join(SRC_ROOT, 'workflow'),
  path.join(SRC_ROOT, 'generators'),
];

const IMPORT_SPECIFIER_PATTERN =
  /(?:from\s+['"]|import\s+['"]|import\s*\(\s*['"]|require\s*\(\s*['"])([^'"]+)['"]/g;

interface ImportReference {
  file: string;
  lineNumber: number;
  line: string;
  specifier: string;
  resolvedPath?: string;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return out;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.test.ts')
    ) {
      out.push(full);
    }
  }

  return out;
}

function walkAll(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return out;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkAll(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }

  return out;
}

function isInside(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function getImportReferences(file: string): ImportReference[] {
  const content = fs.readFileSync(file, 'utf8');
  const references: ImportReference[] = [];

  content.split('\n').forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line.startsWith('//') || line.startsWith('*')) {
      return;
    }

    let match: RegExpExecArray | null;
    IMPORT_SPECIFIER_PATTERN.lastIndex = 0;

    while ((match = IMPORT_SPECIFIER_PATTERN.exec(line)) !== null) {
      const specifier = match[1];
      references.push({
        file,
        lineNumber: index + 1,
        line,
        specifier,
        resolvedPath: specifier.startsWith('.')
          ? path.resolve(path.dirname(file), specifier)
          : undefined,
      });
    }
  });

  return references;
}

function formatViolations(violations: ImportReference[]): string {
  return violations
    .map((violation) => {
      const file = path.relative(SRC_ROOT, violation.file);
      return `${file}:${violation.lineNumber} ${violation.line}`;
    })
    .join('\n');
}

function isForbiddenIntegrationImport(reference: ImportReference): boolean {
  if (
    reference.specifier === '@dotcontext/cli' ||
    reference.specifier.startsWith('@dotcontext/cli/') ||
    reference.specifier === '@dotcontext/mcp' ||
    reference.specifier.startsWith('@dotcontext/mcp/')
  ) {
    return true;
  }

  return Boolean(reference.resolvedPath)
    && FORBIDDEN_INTEGRATION_ROOTS.some((root) =>
      isInside(reference.resolvedPath!, root)
    );
}

/**
 * Resolve an import reference to an on-disk path for boundary checks.
 *
 * Relative specifiers are already resolved by `getImportReferences`. Bare
 * specifiers are resolved against the `src` baseUrl (matching tsconfig), which
 * is how a domain file could otherwise reach `harness/application/...` without
 * a leading `./`.
 */
function resolveReferencePath(reference: ImportReference): string | undefined {
  if (reference.resolvedPath) {
    return reference.resolvedPath;
  }
  if (reference.specifier.startsWith('@') || !reference.specifier.includes('/')) {
    return undefined;
  }
  return path.resolve(SRC_ROOT, reference.specifier);
}


function isHarnessIntegrationImport(reference: ImportReference): boolean {
  if (
    reference.specifier === 'integrations' ||
    reference.specifier.startsWith('integrations/')
  ) {
    return true;
  }

  return Boolean(reference.resolvedPath)
    && isInside(reference.resolvedPath!, INTEGRATIONS_ROOT);
}

describe('architecture boundaries', () => {
  it('keeps test files inside __tests__ folders', () => {
    const misplacedTests = walkAll(SRC_ROOT)
      .filter((file) => file.endsWith('.test.ts') || file.endsWith('.e2e.test.ts'))
      .filter((file) => !file.split(path.sep).includes('__tests__'));

    if (misplacedTests.length > 0) {
      throw new Error(
        `Test files must live in __tests__ folders:\n${misplacedTests
          .map((file) => path.relative(SRC_ROOT, file))
          .join('\n')}`
      );
    }

    expect(misplacedTests).toEqual([]);
  });

  it('keeps removed architecture roots out of the source tree', () => {
    const existingRoots = REMOVED_ARCHITECTURE_ROOTS.filter((root) =>
      fs.existsSync(root)
    );

    if (existingRoots.length > 0) {
      throw new Error(
        `Legacy architecture roots must not exist:\n${existingRoots
          .map((root) => path.relative(SRC_ROOT, root))
          .join('\n')}`
      );
    }

    expect(existingRoots).toEqual([]);
  });

  it('keeps host integrations independent from cli and mcp surfaces', () => {
    const files = walk(INTEGRATIONS_ROOT);
    expect(files.length).toBeGreaterThan(0);

    const violations = files
      .flatMap(getImportReferences)
      .filter(isForbiddenIntegrationImport);

    if (violations.length > 0) {
      throw new Error(
        `src/integrations must not import cli or mcp surfaces.\n\n${formatViolations(violations)}`
      );
    }

    expect(violations).toEqual([]);
  });

  it('keeps the harness runtime independent from cli and mcp surfaces', () => {
    // The asymmetric boundary `cli -> harness <- mcp` requires that harness
    // depend on neither adapter. cli/mcp are adapters over the harness; the
    // harness must stay reusable for future adapters (HTTP, workers, SDKs).
    const files = HARNESS_ROOTS.flatMap((root) => walk(root));
    expect(files.length).toBeGreaterThan(0);

    const violations = files
      .flatMap(getImportReferences)
      .filter(isForbiddenIntegrationImport);

    if (violations.length > 0) {
      throw new Error(
        'Harness must not import cli or mcp surfaces ' +
          '(cli -> harness <- mcp is one-directional).\n\n' +
          formatViolations(violations)
      );
    }

    expect(violations).toEqual([]);
  });

  it('prevents harness core modules from importing host integrations', () => {
    const files = HARNESS_ROOTS.flatMap((root) => walk(root));
    expect(files.length).toBeGreaterThan(0);

    const violations = files
      .flatMap(getImportReferences)
      .filter(isHarnessIntegrationImport);

    if (violations.length > 0) {
      throw new Error(
        `Harness modules must not import host integrations.\n\n${formatViolations(violations)}`
      );
    }

    expect(violations).toEqual([]);
  });

  it('domain layer does not add new imports of application/adapters (ratchet)', () => {
    // Pre-existing domain -> application/adapters imports inherited from the
    // hexagonal refactor (commits 338d7a7, c9b1386), mostly type-only. They are
    // frozen here so this test fails on any NEW violation while the known debt
    // is paid down separately. Do not extend this list — relocate shared types
    // into the domain instead.
    const KNOWN_DEBT = new Set([
      'harness/domain/policies/index.ts',
      'harness/domain/sensors/index.ts',
      'harness/domain/workflow/orchestrator.ts',
      'harness/domain/workflow/plans/planLinkerParser.ts',
      'harness/domain/workflow/plans/types.ts',
      'harness/domain/workflow/skills/skillTemplates.ts',
      'harness/domain/workflow/status/statusManager.ts',
    ]);

    const files = walk(HARNESS_DOMAIN_ROOT);
    expect(files.length).toBeGreaterThan(0);

    const violations = files.flatMap(getImportReferences).filter((reference) => {
      const resolved = resolveReferencePath(reference);
      if (!resolved) {
        return false;
      }
      if (
        !isInside(resolved, HARNESS_APPLICATION_ROOT) &&
        !isInside(resolved, HARNESS_ADAPTERS_ROOT)
      ) {
        return false;
      }
      const relative = path.relative(SRC_ROOT, reference.file).split(path.sep).join('/');
      return !KNOWN_DEBT.has(relative);
    });

    if (violations.length > 0) {
      throw new Error(
        'New src/harness/domain -> application/adapters import detected. Domain ' +
          'must own its types; relocate them instead of importing upward.\n\n' +
          formatViolations(violations)
      );
    }

    expect(violations).toEqual([]);
  });
});
