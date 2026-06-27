import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import {
  buildClaudeCodeHooksFragment,
  installClaudeCodeHooks,
  previewClaudeCodeHooks,
} from '../claude-code';
import {
  CODEX_HOOK_TRUST_REMINDER,
  CODEX_HOOK_DISPATCH_COMMAND,
  buildCodexHooksDocument,
  buildCodexTomlHookBlocks,
  installCodexHooks,
  previewCodexHooks,
} from '../codex';
import {
  normalizeToolEvent,
  resolveHarnessHookFromHostEvent,
} from '../shared';
import { sessionStartFixture } from '../fixtures/hostHookEvents';

describe('shared integration helpers', () => {
  it('normalizes common stdin fields', () => {
    expect(normalizeToolEvent(sessionStartFixture)).toEqual({
      sessionId: sessionStartFixture.session_id,
      cwd: sessionStartFixture.cwd,
      hookEventName: sessionStartFixture.hook_event_name,
      toolName: undefined,
      toolInput: undefined,
      raw: sessionStartFixture,
    });
  });

  it('resolves SessionStart harness action from normalized events', () => {
    const normalized = normalizeToolEvent(sessionStartFixture);
    expect(resolveHarnessHookFromHostEvent(normalized)).toEqual({
      tool: 'context',
      params: {
        action: 'check',
        repoPath: sessionStartFixture.cwd,
      },
    });
  });
});

describe('hook install services', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-hook-install-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('defaults direct hook installs to project-local config paths', async () => {
    const claudeResult = await installClaudeCodeHooks({
      repoPath: tempDir,
    });
    const codexResult = await installCodexHooks({
      repoPath: tempDir,
    });

    expect(claudeResult.configPath).toBe(path.join(tempDir, '.claude', 'settings.json'));
    expect(codexResult.configPath).toBe(path.join(tempDir, '.codex', 'hooks.json'));
    expect(await fs.pathExists(claudeResult.configPath)).toBe(true);
    expect(await fs.pathExists(codexResult.configPath)).toBe(true);
  });

  it('previews Claude Code hooks merged into settings.json', async () => {
    const configPath = path.join(tempDir, '.claude', 'settings.json');
    await fs.outputJson(configPath, {
      hooks: {
        Notification: [{ hooks: [{ type: 'command', command: 'echo hi' }] }],
      },
    });

    const preview = await previewClaudeCodeHooks({
      global: false,
      repoPath: tempDir,
    });

    expect(preview.hooks).toMatchObject(buildClaudeCodeHooksFragment());
    const previewHooks = preview.hooks as Record<string, Array<{ matcher?: string }>>;
    expect(previewHooks.PostToolUse[0].matcher).toBe(
      '^Write$|^Edit$|^Bash$'
    );
    expect((preview.hooks as Record<string, unknown>).Notification).toBeDefined();
  });

  it('writes Codex hooks.json locally without clobbering unrelated hooks', async () => {
    const configPath = path.join(tempDir, '.codex', 'hooks.json');
    await fs.outputJson(configPath, {
      hooks: {
        Notification: [{ hooks: [{ type: 'command', command: 'echo ping' }] }],
      },
    });

    const result = await installCodexHooks({
      global: false,
      repoPath: tempDir,
    });

    expect(result.format).toBe('json');
    expect(result.action).toBe('updated');
    expect(result.trustReminder).toBe(CODEX_HOOK_TRUST_REMINDER);
    expect(result.trustReminder).toContain('/hooks');

    const written = await fs.readJson(configPath);
    expect(written.hooks).toMatchObject(buildCodexHooksDocument().hooks);
    expect(written.hooks.Notification).toBeDefined();
  });

  it('appends Codex TOML hook blocks and enables features.hooks', async () => {
    const configPath = path.join(tempDir, '.codex', 'config.toml');
    await fs.outputFile(configPath, '[mcp_servers.dotcontext]\ncommand = "npx"\n');

    const result = await installCodexHooks({
      global: false,
      repoPath: tempDir,
      format: 'toml',
    });

    expect(result.format).toBe('toml');
    expect(result.action).toBe('updated');
    expect(result.trustReminder).toBe(CODEX_HOOK_TRUST_REMINDER);
    expect(result.trustReminder).toContain('/hooks');

    const written = await fs.readFile(configPath, 'utf8');
    expect(written).toContain('[features]');
    expect(written).toContain('hooks = true');
    expect(written).toContain('npx -y @dotcontext/cli@latest hook dispatch --source codex');
    expect(written).toContain('[mcp_servers.dotcontext]');
  });

  it('does not skip Codex TOML install when only one current hook block exists', async () => {
    const configPath = path.join(tempDir, '.codex', 'config.toml');
    await fs.outputFile(
      configPath,
      [
        '[features]',
        'hooks = true',
        '',
        '[[hooks.SessionStart]]',
        'matcher = "*"',
        `command = ${JSON.stringify(CODEX_HOOK_DISPATCH_COMMAND)}`,
        '',
      ].join('\n')
    );

    const result = await installCodexHooks({
      global: false,
      repoPath: tempDir,
      format: 'toml',
    });

    expect(result.action).toBe('updated');

    const written = await fs.readFile(configPath, 'utf8');
    expect(written.match(/\[\[hooks\.SessionStart\]\]/g)).toHaveLength(1);
    expect(written.match(/\[\[hooks\.PostToolUse\]\]/g)).toHaveLength(1);
    expect(written.match(/\[\[hooks\.Stop\]\]/g)).toHaveLength(1);
  });

  it('skips Codex TOML install when all current hook blocks exist', async () => {
    const configPath = path.join(tempDir, '.codex', 'config.toml');
    await fs.outputFile(configPath, buildCodexTomlHookBlocks());

    const result = await installCodexHooks({
      global: false,
      repoPath: tempDir,
      format: 'toml',
    });

    expect(result.action).toBe('skipped');
  });

  it('skips Claude Code install when current dotcontext hooks already exist', async () => {
    const configPath = path.join(tempDir, '.claude', 'settings.json');
    await fs.outputJson(configPath, {
      hooks: buildClaudeCodeHooksFragment(),
    });

    const result = await installClaudeCodeHooks({
      global: false,
      repoPath: tempDir,
    });

    expect(result.action).toBe('skipped');
  });

  it('upgrades legacy Claude Code hook commands to the current npx dispatch command', async () => {
    const configPath = path.join(tempDir, '.claude', 'settings.json');
    const legacyCommand = 'dotcontext hook dispatch --source claude-code';
    await fs.outputJson(configPath, {
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: legacyCommand }] }],
        PostToolUse: [{ hooks: [{ type: 'command', command: legacyCommand }] }],
        Stop: [{ hooks: [{ type: 'command', command: legacyCommand }] }],
      },
    });

    const result = await installClaudeCodeHooks({
      global: false,
      repoPath: tempDir,
    });

    expect(result.action).toBe('updated');

    const written = await fs.readJson(configPath);
    expect(written.hooks.SessionStart[0].hooks[0].command).toContain(
      'npx -y @dotcontext/cli@latest hook dispatch --source claude-code'
    );
  });

  it('upgrades legacy Codex TOML hook commands to the current npx dispatch command', async () => {
    const configPath = path.join(tempDir, '.codex', 'config.toml');
    await fs.outputFile(
      configPath,
      [
        '[[hooks.SessionStart]]',
        'matcher = "*"',
        'command = "dotcontext hook dispatch --source codex"',
        '',
      ].join('\n')
    );

    const result = await installCodexHooks({
      global: false,
      repoPath: tempDir,
      format: 'toml',
    });

    expect(result.action).toBe('updated');

    const written = await fs.readFile(configPath, 'utf8');
    expect(written).toContain('npx -y @dotcontext/cli@latest hook dispatch --source codex');
    expect(written).not.toContain('command = "dotcontext hook dispatch --source codex"');
  });

  it('previews Codex TOML append output', async () => {
    const preview = await previewCodexHooks({
      global: false,
      repoPath: tempDir,
      format: 'toml',
    });

    expect(typeof preview).toBe('string');
    expect(preview).toContain('[[hooks.SessionStart]]');
  });
});
