import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import type { CLIInterface } from '../../utils/cliUI';
import { ClaudeBootstrapService } from './claudeBootstrapService';

const PRE_TOOL_HOOK_COMMAND = 'node .claude/hooks/pre-tool-use.js';
const STOP_HOOK_COMMAND = 'node .claude/hooks/stop.js';
const GENERATED_MARKER = '<!-- generated-by: ai-coders-context claude -->';

const createMockUI = (): CLIInterface => ({
  displayWelcome: jest.fn(),
  displayError: jest.fn(),
  displaySuccess: jest.fn(),
  displayInfo: jest.fn(),
  displayWarning: jest.fn(),
  displayList: jest.fn(),
  displayTable: jest.fn(),
  displayJson: jest.fn(),
  displayProjectConfiguration: jest.fn(),
  displayFileTypeDistribution: jest.fn(),
  displayGenerationSummary: jest.fn(),
  startSpinner: jest.fn(),
  updateSpinner: jest.fn(),
  stopSpinner: jest.fn(),
  displayAnalysisComplete: jest.fn(),
  displayBox: jest.fn(),
  displaySection: jest.fn(),
  displayStep: jest.fn(),
  displayDiff: jest.fn(),
  displaySkillHeader: jest.fn(),
  displaySkillDefinition: jest.fn(),
  displaySkillExamples: jest.fn(),
  displaySkillContent: jest.fn(),
} as unknown as CLIInterface);

const mockTranslate = (key: string) => key;

describe('ClaudeBootstrapService', () => {
  let tempDir: string;
  let service: ClaudeBootstrapService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-bootstrap-test-'));
    service = new ClaudeBootstrapService({
      ui: createMockUI(),
      t: mockTranslate,
      version: '1.0.0',
    });

    await fs.ensureDir(path.join(tempDir, '.context', 'agents'));
    await fs.writeFile(
      path.join(tempDir, '.context', 'agents', 'feature-developer.md'),
      `---
type: agent
name: Feature Developer
description: Implements features
---

# Feature Developer
`,
      'utf-8'
    );
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('creates .mcp.json, .claude/settings.json and Claude agents on first run', async () => {
    await service.run(tempDir);

    const mcpPath = path.join(tempDir, '.mcp.json');
    const settingsPath = path.join(tempDir, '.claude', 'settings.json');
    const agentPath = path.join(tempDir, '.claude', 'agents', 'feature-developer.md');
    const preToolHookPath = path.join(tempDir, '.claude', 'hooks', 'pre-tool-use.js');
    const stopHookPath = path.join(tempDir, '.claude', 'hooks', 'stop.js');
    const gitignorePath = path.join(tempDir, '.gitignore');

    expect(await fs.pathExists(mcpPath)).toBe(true);
    expect(await fs.pathExists(settingsPath)).toBe(true);
    expect(await fs.pathExists(agentPath)).toBe(true);
    expect(await fs.pathExists(preToolHookPath)).toBe(true);
    expect(await fs.pathExists(stopHookPath)).toBe(true);
    expect(await fs.pathExists(gitignorePath)).toBe(true);

    const mcpConfig = await fs.readJson(mcpPath);
    expect(mcpConfig.mcpServers).toBeDefined();
    expect(mcpConfig.mcpServers['ai-context']).toBeDefined();

    const settingsConfig = await fs.readJson(settingsPath);
    const preToolCommands = (settingsConfig.hooks?.PreToolUse || [])
      .flatMap((rule: any) => rule.hooks || [])
      .map((hook: any) => hook.command);
    const stopCommands = (settingsConfig.hooks?.Stop || [])
      .flatMap((rule: any) => rule.hooks || [])
      .map((hook: any) => hook.command);

    expect(preToolCommands).toContain(PRE_TOOL_HOOK_COMMAND);
    expect(stopCommands).toContain(STOP_HOOK_COMMAND);

    const agentContent = await fs.readFile(agentPath, 'utf-8');
    expect(agentContent).toContain(GENERATED_MARKER);
    expect(agentContent).toContain('name: Feature Developer');
    expect(agentContent).toContain('description: Implements features');

    const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    expect(gitignoreContent).toContain('.claude/settings.local.json');
  });

  it('is idempotent and does not duplicate MCP/hooks entries', async () => {
    await service.run(tempDir);
    const secondRun = await service.run(tempDir);

    const mcpConfig = await fs.readJson(path.join(tempDir, '.mcp.json'));
    expect(Object.keys(mcpConfig.mcpServers).filter((key) => key === 'ai-context')).toHaveLength(1);

    const settingsConfig = await fs.readJson(path.join(tempDir, '.claude', 'settings.json'));
    const preToolCommands = (settingsConfig.hooks?.PreToolUse || [])
      .flatMap((rule: any) => rule.hooks || [])
      .filter((hook: any) => hook.command === PRE_TOOL_HOOK_COMMAND);
    const stopCommands = (settingsConfig.hooks?.Stop || [])
      .flatMap((rule: any) => rule.hooks || [])
      .filter((hook: any) => hook.command === STOP_HOOK_COMMAND);

    expect(preToolCommands).toHaveLength(1);
    expect(stopCommands).toHaveLength(1);
    expect(secondRun.agentsSkipped).toBeGreaterThan(0);
  });

  it('merges with preexisting .mcp.json without losing unrelated configuration', async () => {
    const preexistingMcp = {
      customRootKey: true,
      mcpServers: {
        existing: {
          command: 'node',
          args: ['some-existing-server.js'],
        },
        'ai-context': {
          command: 'custom',
          args: ['custom-mcp'],
        },
      },
    };
    await fs.writeJson(path.join(tempDir, '.mcp.json'), preexistingMcp, { spaces: 2 });

    await service.run(tempDir);

    const mergedConfig = await fs.readJson(path.join(tempDir, '.mcp.json'));
    expect(mergedConfig.customRootKey).toBe(true);
    expect(mergedConfig.mcpServers.existing).toEqual(preexistingMcp.mcpServers.existing);
    expect(mergedConfig.mcpServers['ai-context']).toEqual(preexistingMcp.mcpServers['ai-context']);
  });
});
