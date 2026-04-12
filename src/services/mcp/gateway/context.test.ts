import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { SemanticContextBuilder } from '../../semantic/contextBuilder';
import { handleContext } from './context';

function parseResponse(response: { content: Array<{ text: string }> }) {
  return JSON.parse(response.content[0].text);
}

describe('handleContext', () => {
  let tempDir: string;
  let contextBuilder: SemanticContextBuilder;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-mcp-context-'));
    contextBuilder = new SemanticContextBuilder();

    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'context-gateway-test',
      version: '1.0.0',
    }, { spaces: 2 });

    await fs.ensureDir(path.join(tempDir, 'src'));
    await fs.writeFile(
      path.join(tempDir, 'src', 'index.ts'),
      'export function greet(name: string) { return `hello ${name}`; }\n',
      'utf-8'
    );
  });

  afterEach(async () => {
    await contextBuilder.shutdown();
    await fs.remove(tempDir);
  });

  it('passes generateQA through context init and skips QA generation when disabled', async () => {
    const response = await handleContext(
      {
        action: 'init',
        repoPath: tempDir,
        type: 'docs',
        skipContentGeneration: true,
        generateQA: false,
      },
      {
        repoPath: tempDir,
        contextBuilder,
      }
    );

    const payload = parseResponse(response);

    expect(payload.qaGenerated).toBe(0);
    expect(payload.qaNote).toBeUndefined();
    await expect(fs.pathExists(path.join(tempDir, '.context', 'docs', 'qa'))).resolves.toBe(false);
  });

  it('directs scaffoldPlan responses to start workflow-init on the harness', async () => {
    const response = await handleContext(
      {
        action: 'scaffoldPlan',
        repoPath: tempDir,
        planName: 'feature-rollout',
        autoFill: false,
      },
      {
        repoPath: tempDir,
        contextBuilder,
      }
    );

    const payload = parseResponse(response);

    expect(payload.success).toBe(true);
    expect(payload._actionRequired).toBe(true);
    expect(payload.enhancementPrompt).toContain('workflow-init({ name: "feature-rollout" })');
    expect(payload.enhancementPrompt).toContain('.context/harness/workflows/prevc.json');
    expect(payload.nextSteps).toContain(
      'REQUIRED: Call workflow-init({ name: "feature-rollout" }) to start the harness-backed PREVC workflow'
    );
  });
});
