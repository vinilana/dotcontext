import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import { MCPInstallService } from './mcpInstallService';
import type { CLIInterface } from '../../utils/cliUI';

// Mock CLIInterface
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

// Mock translate function
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

describe('MCPInstallService', () => {
  let tempDir: string;
  let service: MCPInstallService;
  let mockUI: CLIInterface;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-install-test-'));
    mockUI = createMockUI();
    service = new MCPInstallService({
      ui: mockUI,
      t: mockT,
      version: '1.0.0',
    });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('getSupportedTools', () => {
    it('should return list of supported tools', () => {
      const tools = service.getSupportedTools();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.some(t => t.id === 'claude')).toBe(true);
      expect(tools.some(t => t.id === 'cursor')).toBe(true);
    });
  });

  describe('getSupportedToolIds', () => {
    it('should return list of supported tool IDs', () => {
      const ids = service.getSupportedToolIds();
      expect(ids).toContain('claude');
      expect(ids).toContain('cursor');
      expect(ids).toContain('codex');
      expect(ids).toContain('windsurf');
      expect(ids).toContain('continue');
      expect(ids).toContain('trae');
      expect(ids).toContain('copilot-cli');
    });

    it('should not include removed tool IDs', () => {
      const ids = service.getSupportedToolIds();
      expect(ids).not.toContain('warp');
      expect(ids).not.toContain('cline');
    });
  });

  describe('detectInstalledTools', () => {
    it('should return an array of tool IDs', async () => {
      const detected = await service.detectInstalledTools();
      expect(Array.isArray(detected)).toBe(true);
      const validIds = service.getSupportedToolIds();
      for (const id of detected) {
        expect(validIds).toContain(id);
      }
    });
  });

  describe('run', () => {
    it('should install MCP configuration for Claude', async () => {
      const result = await service.run({
        tool: 'claude',
        global: false,
        repoPath: tempDir,
        dryRun: false,
      });

      expect(result.filesCreated).toBe(1);
      expect(result.installations.length).toBe(1);
      expect(result.installations[0].tool).toBe('claude');
      expect(result.installations[0].action).toBe('created');

      // Verify file was created at new path
      const configPath = path.join(tempDir, '.mcp.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      // Verify config content
      const config = await fs.readJson(configPath);
      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers['dotcontext']).toBeDefined();
      expect(config.mcpServers['dotcontext'].command).toBe('npx');
    });

    it('should support dry-run mode', async () => {
      const result = await service.run({
        tool: 'claude',
        global: false,
        repoPath: tempDir,
        dryRun: true,
      });

      expect(result.filesCreated).toBe(1);
      expect(result.installations[0].dryRun).toBe(true);

      // Verify file was NOT created
      const configPath = path.join(tempDir, '.mcp.json');
      expect(await fs.pathExists(configPath)).toBe(false);
    });

    it('should skip if already configured', async () => {
      // First install
      await service.run({
        tool: 'claude',
        global: false,
        repoPath: tempDir,
        dryRun: false,
      });

      // Second install should skip
      const result = await service.run({
        tool: 'claude',
        global: false,
        repoPath: tempDir,
        dryRun: false,
      });

      expect(result.filesSkipped).toBe(1);
      expect(result.installations[0].action).toBe('skipped');
    });

    it('should merge with existing config', async () => {
      // Create existing config with other servers
      const configPath = path.join(tempDir, '.mcp.json');
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeJson(configPath, {
        mcpServers: {
          'other-server': { command: 'other', args: [] },
        },
      });

      const result = await service.run({
        tool: 'claude',
        global: false,
        repoPath: tempDir,
        dryRun: false,
      });

      expect(result.filesCreated).toBe(1);
      expect(result.installations[0].action).toBe('updated');

      // Verify both servers exist
      const config = await fs.readJson(configPath);
      expect(config.mcpServers['other-server']).toBeDefined();
      expect(config.mcpServers['dotcontext']).toBeDefined();
    });

    it('should install for multiple tools when specifying tool as "all"', async () => {
      const result = await service.run({
        tool: 'all',
        global: false,
        repoPath: tempDir,
        dryRun: false,
      });

      expect(result.installations.length).toBeGreaterThan(0);
      const validIds = service.getSupportedToolIds();
      for (const install of result.installations) {
        expect(validIds).toContain(install.tool);
      }
    });

    it('should fall back to all supported tools when "all" is requested and nothing is detected', async () => {
      const detectSpy = jest.spyOn(service, 'detectInstalledTools').mockResolvedValue([]);

      const result = await service.run({
        tool: 'all',
        global: false,
        repoPath: tempDir,
        dryRun: true,
      });

      expect(detectSpy).toHaveBeenCalled();
      expect(result.installations.length).toBe(service.getSupportedToolIds().length);

      detectSpy.mockRestore();
    });

    it('should show warning when unsupported tool is specified', async () => {
      const result = await service.run({
        tool: 'nonexistent-tool',
        global: false,
        repoPath: tempDir,
      });

      expect(mockUI.displayError).toHaveBeenCalled();
      expect(result.filesCreated).toBe(0);
    });

    it('should fall back to all supported tools when no tool is specified and nothing is detected', async () => {
      const detectSpy = jest.spyOn(service, 'detectInstalledTools').mockResolvedValue([]);

      const result = await service.run({
        global: false,
        repoPath: tempDir,
        dryRun: true,
      });

      expect(detectSpy).toHaveBeenCalled();
      expect(result.installations.length).toBe(service.getSupportedToolIds().length);

      detectSpy.mockRestore();
    });
  });

  describe('tool-specific configurations', () => {
    it('should generate correct config for Cursor with type field', async () => {
      const result = await service.run({
        tool: 'cursor',
        global: false,
        repoPath: tempDir,
      });

      expect(result.filesCreated).toBe(1);

      const configPath = path.join(tempDir, '.cursor', 'mcp.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      expect(config.mcpServers['dotcontext']).toBeDefined();
      expect(config.mcpServers['dotcontext'].type).toBe('stdio');
      expect(config.mcpServers['dotcontext'].command).toBe('npx');
    });

    it('should generate correct config for Continue.dev as standalone file', async () => {
      const result = await service.run({
        tool: 'continue',
        global: false,
        repoPath: tempDir,
      });

      expect(result.filesCreated).toBe(1);

      const configPath = path.join(tempDir, '.continue', 'mcpServers', 'dotcontext.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      expect(config.command).toBe('npx');
      expect(config.args).toBeDefined();
      expect(config.env).toBeDefined();
      // Should NOT have experimental or modelContextProtocolServers wrapper
      expect(config.experimental).toBeUndefined();
    });
  });

  describe('Phase 1: Standard JSON tools', () => {
    it('should install MCP configuration for Claude Desktop', async () => {
      const result = await service.run({
        tool: 'claude-desktop',
        global: false,
        repoPath: tempDir,
      });

      expect(result.filesCreated).toBe(1);
      const configPath = path.join(tempDir, '.claude-desktop', 'mcp_servers.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      expect(config.mcpServers['dotcontext']).toBeDefined();
      expect(config.mcpServers['dotcontext'].command).toBe('npx');
    });

    it('should install MCP configuration for VS Code with servers key and type field', async () => {
      const result = await service.run({
        tool: 'vscode',
        global: false,
        repoPath: tempDir,
      });

      expect(result.filesCreated).toBe(1);
      const configPath = path.join(tempDir, '.vscode', 'mcp.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      // Should use 'servers' key, not 'mcpServers'
      expect(config.servers).toBeDefined();
      expect(config.servers['dotcontext']).toBeDefined();
      expect(config.servers['dotcontext'].type).toBe('stdio');
      expect(config.servers['dotcontext'].command).toBe('npx');
      expect(config.mcpServers).toBeUndefined();
    });

    it('should install MCP configuration for Roo Code', async () => {
      const result = await service.run({
        tool: 'roo',
        global: false,
        repoPath: tempDir,
      });

      expect(result.filesCreated).toBe(1);
      const configPath = path.join(tempDir, '.roo', 'mcp.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      expect(config.mcpServers['dotcontext']).toBeDefined();
    });

    it('should install MCP configuration for Amazon Q Developer CLI', async () => {
      const result = await service.run({
        tool: 'amazonq',
        global: false,
        repoPath: tempDir,
      });

      expect(result.filesCreated).toBe(1);
      const configPath = path.join(tempDir, '.amazonq', 'mcp.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      expect(config.mcpServers['dotcontext']).toBeDefined();
    });

    it('should install MCP configuration for Gemini CLI', async () => {
      const result = await service.run({
        tool: 'gemini-cli',
        global: false,
        repoPath: tempDir,
      });

      expect(result.filesCreated).toBe(1);
      const configPath = path.join(tempDir, '.gemini', 'settings.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      expect(config.mcpServers['dotcontext']).toBeDefined();
    });

    it('should install MCP configuration for Codex CLI using TOML', async () => {
      const result = await service.run({
        tool: 'codex',
        global: false,
        repoPath: tempDir,
      });

      expect(result.filesCreated).toBe(1);
      const configPath = path.join(tempDir, '.codex', 'config.toml');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readFile(configPath, 'utf-8');
      expect(config).toContain('[mcp_servers.dotcontext]');
      expect(config).toContain('command = "npx"');
      expect(config).toContain('args = ["-y", "@dotcontext/cli@latest", "mcp"]');
    });

    it('should install MCP configuration for Kiro at settings path', async () => {
      const result = await service.run({
        tool: 'kiro',
        global: false,
        repoPath: tempDir,
      });

      expect(result.filesCreated).toBe(1);
      const configPath = path.join(tempDir, '.kiro', 'settings', 'mcp.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      expect(config.mcpServers['dotcontext']).toBeDefined();
    });

    it('should install MCP configuration for Windsurf at codeium path', async () => {
      const result = await service.run({
        tool: 'windsurf',
        global: false,
        repoPath: tempDir,
      });

      expect(result.filesCreated).toBe(1);
      const configPath = path.join(tempDir, '.codeium', 'windsurf', 'mcp_config.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      expect(config.mcpServers['dotcontext']).toBeDefined();
    });
  });

  describe('Phase 2: Special JSON formats', () => {
    it('should install MCP configuration for Zed with flat context_servers format', async () => {
      const result = await service.run({
        tool: 'zed',
        global: false,
        repoPath: tempDir,
      });

      expect(result.filesCreated).toBe(1);
      const configPath = path.join(tempDir, '.zed', 'settings.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      expect(config.context_servers).toBeDefined();
      expect(config.context_servers['dotcontext']).toBeDefined();
      // Should have flat command, not nested command.path
      expect(config.context_servers['dotcontext'].command).toBe('npx');
      expect(config.context_servers['dotcontext'].args).toBeDefined();
      expect(config.context_servers['dotcontext'].settings).toBeUndefined();
    });

    it('should install MCP configuration for JetBrains with servers array', async () => {
      const result = await service.run({
        tool: 'jetbrains',
        global: false,
        repoPath: tempDir,
      });

      expect(result.filesCreated).toBe(1);
      const configPath = path.join(tempDir, '.jb-mcp.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      // Should use servers array, not mcpServers object
      expect(config.servers).toBeDefined();
      expect(Array.isArray(config.servers)).toBe(true);
      const aiContext = config.servers.find((s: { name: string }) => s.name === 'dotcontext');
      expect(aiContext).toBeDefined();
      expect(aiContext.command).toBe('npx');
      expect(config.mcpServers).toBeUndefined();
    });

    it('should merge JetBrains servers array without duplicates', async () => {
      // Create existing config with another server
      const configPath = path.join(tempDir, '.jb-mcp.json');
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeJson(configPath, {
        servers: [
          { name: 'other-server', command: 'other', args: [] },
        ],
      });

      await service.run({
        tool: 'jetbrains',
        global: false,
        repoPath: tempDir,
      });

      const config = await fs.readJson(configPath);
      expect(config.servers.length).toBe(2);
      expect(config.servers.some((s: { name: string }) => s.name === 'other-server')).toBe(true);
      expect(config.servers.some((s: { name: string }) => s.name === 'dotcontext')).toBe(true);
    });
  });

  describe('New tools', () => {
    it('should install MCP configuration for Trae', async () => {
      const result = await service.run({
        tool: 'trae',
        global: false,
        repoPath: tempDir,
      });

      expect(result.filesCreated).toBe(1);
      const configPath = path.join(tempDir, '.trae', 'mcp.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      expect(config.mcpServers['dotcontext']).toBeDefined();
      expect(config.mcpServers['dotcontext'].command).toBe('npx');
    });

    it('should install MCP configuration for Kilo Code with mcp format', async () => {
      const result = await service.run({
        tool: 'kilo',
        global: false,
        repoPath: tempDir,
      });

      expect(result.filesCreated).toBe(1);
      const configPath = path.join(tempDir, '.kilo', 'mcp.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      // Should use 'mcp' key with type/command/enabled format
      expect(config.mcp).toBeDefined();
      expect(config.mcp['dotcontext']).toBeDefined();
      expect(config.mcp['dotcontext'].type).toBe('local');
      expect(config.mcp['dotcontext'].command).toEqual(['npx', '-y', '@dotcontext/cli@latest', 'mcp']);
      expect(config.mcp['dotcontext'].enabled).toBe(true);
      expect(config.mcpServers).toBeUndefined();
    });

    it('should install MCP configuration for GitHub Copilot CLI', async () => {
      const result = await service.run({
        tool: 'copilot-cli',
        global: false,
        repoPath: tempDir,
      });

      expect(result.filesCreated).toBe(1);
      const configPath = path.join(tempDir, '.copilot', 'mcp-config.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      expect(config.mcpServers['dotcontext']).toBeDefined();
      expect(config.mcpServers['dotcontext'].command).toBe('npx');
    });
  });

  describe('Merge behavior for new tools', () => {
    it('should preserve existing servers when installing VS Code', async () => {
      const configPath = path.join(tempDir, '.vscode', 'mcp.json');
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeJson(configPath, {
        servers: {
          'other-server': { type: 'stdio', command: 'other', args: [] }
        }
      });

      await service.run({
        tool: 'vscode',
        global: false,
        repoPath: tempDir,
      });

      const config = await fs.readJson(configPath);
      expect(config.servers['other-server']).toBeDefined();
      expect(config.servers['dotcontext']).toBeDefined();
    });

    it('should preserve existing context_servers when installing Zed', async () => {
      const configPath = path.join(tempDir, '.zed', 'settings.json');
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeJson(configPath, {
        context_servers: {
          'other-server': { command: 'other', args: [] }
        }
      });

      await service.run({
        tool: 'zed',
        global: false,
        repoPath: tempDir,
      });

      const config = await fs.readJson(configPath);
      expect(config.context_servers['other-server']).toBeDefined();
      expect(config.context_servers['dotcontext']).toBeDefined();
    });
  });
});
