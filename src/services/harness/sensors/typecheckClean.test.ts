import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { executeTypecheckClean } from './typecheckClean';

describe('typecheck-clean sensor', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'typecheck-clean-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('passes when the configured command exits 0', async () => {
    const result = await executeTypecheckClean(tempDir, {
      sessionId: 's',
      context: { command: ['node', '-e', 'process.exit(0)'] },
    });
    expect(result.status).toBe('passed');
    expect(result.summary).toMatch(/no errors/);
  });

  it('fails on non-zero exit and captures stderr tail', async () => {
    const errBody = Array.from({ length: 60 }, (_, i) => `error TS${1000 + i}: line ${i}`).join('\\n');
    const result = await executeTypecheckClean(tempDir, {
      sessionId: 's',
      context: {
        command: ['node', '-e', `process.stderr.write("${errBody}"); process.exit(2)`],
        tailLines: 50,
      },
    });
    expect(result.status).toBe('failed');
    expect(result.summary).toContain('exit 2');
    const out = result.output as { exitCode: number; tail: string };
    expect(out.exitCode).toBe(2);
    // We requested 50 lines tail, so the very first lines should be dropped.
    expect(out.tail).not.toContain('line 0');
    expect(out.tail).toContain('line 59');
  });
});
