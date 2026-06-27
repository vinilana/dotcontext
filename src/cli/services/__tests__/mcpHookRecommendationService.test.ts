import {
  buildHookInstallCommand,
  getAvailableRecommendedHookTargets,
  getHookCapableMcpToolIds,
  getHookHostForMcpTool,
  getMcpHookRecommendationDecision,
  getMcpHookSuggestionTargets,
  getRecommendedHookTargets,
  isMcpInstallAllFallback,
  parseRecommendedHookFormat,
  validateMcpHookRecommendationOptions,
} from '../mcpHookRecommendationService';
import type { MCPInstallation } from '../mcpInstallService';

function installation(tool: string): MCPInstallation {
  return {
    tool,
    toolDisplayName: tool,
    configPath: `/tmp/${tool}`,
    action: 'created',
    dryRun: false,
  };
}

describe('mcpHookRecommendationService', () => {
  it('maps MCP tools to supported hook hosts', () => {
    expect(getHookHostForMcpTool('claude')).toBe('claude-code');
    expect(getHookHostForMcpTool('codex')).toBe('codex');
    expect(getHookHostForMcpTool('pi')).toBe('pi');
  });

  it('excludes MCP tools without hook integrations', () => {
    expect(getHookHostForMcpTool('cursor')).toBeUndefined();
    expect(getHookHostForMcpTool('windsurf')).toBeUndefined();
    expect(getHookCapableMcpToolIds()).toEqual(['claude', 'codex', 'pi']);
  });

  it('recommends hooks for explicitly selected hook-capable tools', () => {
    expect(
      getRecommendedHookTargets({
        selectedTool: 'codex',
        detectedTools: [],
        mcpInstallations: [installation('codex')],
      })
    ).toEqual([
      {
        host: 'codex',
        sourceTool: 'codex',
        displayName: 'Codex CLI',
      },
    ]);
  });

  it('does not recommend hooks for explicitly selected non-hook tools', () => {
    expect(
      getRecommendedHookTargets({
        selectedTool: 'cursor',
        detectedTools: [],
        mcpInstallations: [installation('cursor')],
      })
    ).toEqual([]);
  });

  it('limits all-mode recommendations to detected hook-capable tools', () => {
    expect(
      getRecommendedHookTargets({
        selectedTool: 'all',
        detectedTools: ['codex', 'cursor'],
        mcpInstallations: [installation('codex'), installation('cursor'), installation('claude')],
      })
    ).toEqual([
      {
        host: 'codex',
        sourceTool: 'codex',
        displayName: 'Codex CLI',
      },
    ]);
  });

  it('does not recommend every hook host when all-mode falls back to every MCP tool', () => {
    const input = {
      selectedTool: 'all',
      detectedTools: [],
      mcpInstallations: [installation('claude'), installation('codex'), installation('pi')],
    };

    expect(isMcpInstallAllFallback(input)).toBe(true);
    expect(getRecommendedHookTargets(input)).toEqual([]);
    expect(getMcpHookSuggestionTargets(input)).toEqual(getAvailableRecommendedHookTargets());
  });

  it('decides prompt, install, suggest, and skip modes without side effects', () => {
    const input = {
      selectedTool: 'codex',
      detectedTools: ['codex'],
      mcpInstallations: [installation('codex')],
    };

    expect(getMcpHookRecommendationDecision({ ...input, isInteractive: true }).mode).toBe('prompt');
    expect(getMcpHookRecommendationDecision({
      ...input,
      isInteractive: false,
      withHooks: true,
    }).mode).toBe('install');
    expect(getMcpHookRecommendationDecision({ ...input, isInteractive: false }).mode).toBe('suggest');
    expect(getMcpHookRecommendationDecision({
      ...input,
      isInteractive: true,
      noHooks: true,
    })).toMatchObject({
      mode: 'skip',
      reason: 'hooks-disabled',
      targets: [],
    });
  });

  it('keeps fallback all as a suggestion even when hooks are explicitly requested', () => {
    expect(getMcpHookRecommendationDecision({
      selectedTool: 'all',
      detectedTools: [],
      mcpInstallations: [installation('claude'), installation('codex'), installation('pi')],
      isInteractive: false,
      withHooks: true,
    })).toMatchObject({
      mode: 'suggest',
      reason: 'fallback-all-without-detected-tools',
      targets: [],
      suggestedTargets: getAvailableRecommendedHookTargets(),
    });
  });

  it('lets no-hooks suppress fallback-all hook suggestions', () => {
    expect(getMcpHookRecommendationDecision({
      selectedTool: 'all',
      detectedTools: [],
      mcpInstallations: [installation('claude'), installation('codex'), installation('pi')],
      isInteractive: false,
      noHooks: true,
    })).toMatchObject({
      mode: 'skip',
      reason: 'hooks-disabled',
      targets: [],
      suggestedTargets: [],
    });
  });

  it('validates hook recommendation flags and format', () => {
    expect(parseRecommendedHookFormat()).toBe('json');
    expect(parseRecommendedHookFormat('toml')).toBe('toml');
    expect(() => parseRecommendedHookFormat('yaml')).toThrow(
      'Invalid --hook-format value. Expected "json" or "toml".'
    );
    expect(() => validateMcpHookRecommendationOptions({
      withHooks: true,
      noHooks: true,
    })).toThrow('Cannot use --with-hooks and --no-hooks together.');
  });

  it('formats manual hook install commands', () => {
    expect(buildHookInstallCommand('claude-code')).toBe(
      'npx -y @dotcontext/cli@latest hook install claude-code'
    );
    expect(buildHookInstallCommand('codex', { format: 'toml' })).toBe(
      'npx -y @dotcontext/cli@latest hook install codex --format toml'
    );
  });
});
