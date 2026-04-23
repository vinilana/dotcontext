/**
 * Architectural Boundary Test
 *
 * Enforces the `cli -> harness <- mcp` boundary declared in CLAUDE.md and
 * ARCHITECTURE.md. The MCP transport layer must not reach into workflow
 * submodules directly — it must consume the public barrel at
 * `src/workflow/index.ts` (or, better, a facade on `WorkflowService`).
 *
 * If this test fails, the offending file is importing a workflow
 * submodule directly. Either:
 *   - Add the needed symbol to `src/workflow/index.ts`, or
 *   - Expose a facade method on `WorkflowService` and call that instead.
 */
import * as fs from 'fs';
import * as path from 'path';

const MCP_ROOT = path.resolve(__dirname, '..');

// Submodules that are internal to the workflow package. Importing any
// of these directly from `services/mcp/**` violates the boundary.
const FORBIDDEN_WORKFLOW_SUBMODULES = [
  'phases',
  'roles',
  'plans',
  'registries',
  'status',
  'gates',
  'orchestration',
  'orchestrator',
  'agents',
  'skills',
  'scaling',
  'collaboration',
  'errors',
  'prevcConfig',
  'guidance',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.test.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

describe('services/mcp architectural boundary', () => {
  const files = walk(MCP_ROOT);

  it('collects at least one source file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('does not import workflow submodules directly', () => {
    const violations: Array<{ file: string; line: string }> = [];

    // Matches: from '.../workflow/<submodule>' or '.../workflow/<submodule>/...'
    // Also matches absolute `@/workflow/<submodule>` if ever adopted.
    const submodulePattern = new RegExp(
      String.raw`from\s+['"][^'"]*workflow\/(` +
        FORBIDDEN_WORKFLOW_SUBMODULES.join('|') +
        String.raw`)(?:\/[^'"]*)?['"]`
    );

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (line.startsWith('//') || line.startsWith('*')) continue;
        if (submodulePattern.test(line)) {
          violations.push({ file, line });
        }
      }
    }

    if (violations.length > 0) {
      const message = violations
        .map((v) => `  ${path.relative(MCP_ROOT, v.file)}: ${v.line}`)
        .join('\n');
      throw new Error(
        `services/mcp must not import workflow submodules directly.\n` +
          `Use the workflow barrel (../../workflow/index) or a ` +
          `WorkflowService facade method.\n\nViolations:\n${message}`
      );
    }

    expect(violations).toEqual([]);
  });
});
