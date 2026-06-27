import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import {
  HookInstallService,
  buildHookInstallHostChoices,
  resolveHookInstallHostSelection,
} from '../hookInstallService';
import { CODEX_HOOK_TRUST_REMINDER } from '../../../integrations/codex';
import type { CLIInterface } from '../../../utils/cliUI';

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

const mockT = (key: string, params?: Record<string, unknown>) => {
  if (params) {
    let result = key;
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(`{${k}}`, String(v));
    }
    return result;
  }
  return key;
};

describe('HookInstallService', () => {
  let tempDir: string;
  let service: HookInstallService;
  let mockUI: CLIInterface;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-install-test-'));
    mockUI = createMockUI();
    service = new HookInstallService({
      ui: mockUI,
      t: mockT,
      version: '1.0.0',
    });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('getSupportedHosts', () => {
    it('returns claude-code, codex, and pi', () => {
      expect(service.getSupportedHostIds()).toEqual(['claude-code', 'codex', 'pi']);
    });
  });

  describe('buildHookInstallHostChoices', () => {
    it('orders detected hosts first and labels them', () => {
      const choices = buildHookInstallHostChoices(
        ['claude-code', 'codex', 'pi'],
        ['codex'],
        mockT as any
      );

      expect(choices).toEqual([
        { name: 'commands.hookInstall.allDetected', value: 'all' },
        { name: 'Codex CLI (labels.detected)', value: 'codex' },
        { name: 'Claude Code', value: 'claude-code' },
        { name: 'Pi', value: 'pi' },
      ]);
    });
  });

  describe('resolveHookInstallHostSelection', () => {
    it('returns the provided host without prompting', async () => {
      const promptHost = jest.fn();

      const selectedHost = await resolveHookInstallHostSelection({
        selectedHost: 'claude-code',
        isInteractive: true,
        service,
        t: mockT as any,
        promptHost,
      });

      expect(selectedHost).toBe('claude-code');
      expect(promptHost).not.toHaveBeenCalled();
    });

    it('defaults to all in non-interactive mode', async () => {
      const selectedHost = await resolveHookInstallHostSelection({
        isInteractive: false,
        service,
        t: mockT as any,
      });

      expect(selectedHost).toBe('all');
    });
  });

  describe('runInstall', () => {
    it('installs Claude Code hooks in the project by default', async () => {
      const result = await service.runInstall({
        host: 'claude-code',
        repoPath: tempDir,
        dryRun: false,
      });

      expect(result.filesCreated).toBe(1);
      expect(result.installations[0].host).toBe('claude-code');
      expect(result.installations[0].action).toBe('created');

      const configPath = path.join(tempDir, '.claude', 'settings.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      expect(config.hooks.SessionStart).toBeDefined();
      expect(config.hooks.PostToolUse).toBeDefined();
      expect(config.hooks.Stop).toBeDefined();
      expect(config.hooks.PostToolUse[0].matcher).toBe('^Write$|^Edit$|^Bash$');

      const command = config.hooks.SessionStart[0].hooks[0];
      expect(command.type).toBe('command');
      expect(command.command).toContain('npx -y @dotcontext/cli@latest hook dispatch --source claude-code');
    });

    it('supports dry-run mode for Claude Code', async () => {
      const result = await service.runInstall({
        host: 'claude-code',
        repoPath: tempDir,
        dryRun: true,
        verbose: true,
      });

      expect(result.filesCreated).toBe(1);
      expect(result.installations[0].dryRun).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, '.claude', 'settings.json'))).toBe(false);
    });

    it('skips when Claude Code hooks are already configured', async () => {
      await service.runInstall({
        host: 'claude-code',
        repoPath: tempDir,
      });

      const result = await service.runInstall({
        host: 'claude-code',
        repoPath: tempDir,
      });

      expect(result.filesSkipped).toBe(1);
      expect(result.installations[0].action).toBe('skipped');
    });

    it('installs Codex hooks as JSON in the project by default', async () => {
      const result = await service.runInstall({
        host: 'codex',
        repoPath: tempDir,
        dryRun: false,
      });

      expect(result.filesCreated).toBe(1);
      expect(mockUI.displayInfo).toHaveBeenCalledWith(
        'Codex CLI',
        CODEX_HOOK_TRUST_REMINDER
      );

      const configPath = path.join(tempDir, '.codex', 'hooks.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      expect(config.hooks.SessionStart[0].hooks[0].command).toContain('codex');
    });

    it('installs Codex hooks as TOML when requested', async () => {
      const result = await service.runInstall({
        host: 'codex',
        global: false,
        repoPath: tempDir,
        format: 'toml',
      });

      expect(result.filesCreated).toBe(1);

      const configPath = path.join(tempDir, '.codex', 'config.toml');
      const config = await fs.readFile(configPath, 'utf-8');
      expect(config).toContain('[features]');
      expect(config).toContain('hooks = true');
      expect(config).toContain('[[hooks.SessionStart]]');
      expect(config).toContain('npx -y @dotcontext/cli@latest hook dispatch --source codex');
    });

    it('prints Pi instructions and writes .mcp.json snippet', async () => {
      const result = await service.runInstall({
        host: 'pi',
        repoPath: tempDir,
      });

      expect(result.installations[0].action).toBe('instructions');
      expect(mockUI.displayInfo).toHaveBeenCalledWith(
        'Pi',
        'info.hook.piInstructions'
      );

      const mcpPath = path.join(tempDir, '.mcp.json');
      expect(await fs.pathExists(mcpPath)).toBe(true);
      const config = await fs.readJson(mcpPath);
      expect(config.mcpServers.dotcontext.command).toBe('npx');
    });

    it('appends to hook-install.log', async () => {
      await service.runInstall({
        host: 'claude-code',
        repoPath: tempDir,
      });

      const logPath = path.join(tempDir, '.context', 'logs', 'hook-install.log');
      expect(await fs.pathExists(logPath)).toBe(true);

      const lines = (await fs.readFile(logPath, 'utf-8')).trim().split('\n');
      const entry = JSON.parse(lines[lines.length - 1]);
      expect(entry.operation).toBe('install');
      expect(entry.host).toBe('claude-code');
      expect(entry.global).toBe(false);
    });

    it('shows error for unsupported host', async () => {
      const result = await service.runInstall({
        host: 'unknown-host',
        repoPath: tempDir,
      });

      expect(mockUI.displayError).toHaveBeenCalled();
      expect(result.installations).toHaveLength(0);
    });
  });

  describe('runUninstall', () => {
    it('removes Claude Code hook entries', async () => {
      await service.runInstall({
        host: 'claude-code',
        repoPath: tempDir,
      });

      const result = await service.runUninstall({
        host: 'claude-code',
        repoPath: tempDir,
      });

      expect(result.filesCreated).toBe(1);

      const config = await fs.readJson(path.join(tempDir, '.claude', 'settings.json'));
      expect(config.hooks.SessionStart[0]?.hooks ?? []).toHaveLength(0);
    });
  });
});
