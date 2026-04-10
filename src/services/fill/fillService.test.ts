import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';

import { FillService, FillCommandFlags } from './fillService';
import type { CLIInterface } from '../../utils/cliUI';
import type { TranslateFn } from '../../utils/i18n';

// Mock the DocumentationAgent
jest.mock('../ai/agents/documentationAgent', () => ({
  DocumentationAgent: jest.fn().mockImplementation(() => ({
    generateDocumentation: jest.fn().mockResolvedValue({
      text: '# Updated Documentation\n\nContent here.',
      toolsUsed: ['semanticAnalysis'],
      steps: 1
    })
  }))
}));

// Mock the PlaybookAgent
jest.mock('../ai/agents/playbookAgent', () => ({
  PlaybookAgent: jest.fn().mockImplementation(() => ({
    generatePlaybook: jest.fn().mockResolvedValue({
      text: '# Updated Playbook\n\nAgent content here.',
      toolsUsed: ['semanticAnalysis'],
      steps: 1
    })
  }))
}));

// Mock resolveLlmConfig
jest.mock('../shared/llmConfig', () => ({
  resolveLlmConfig: jest.fn().mockResolvedValue({
    apiKey: 'test-api-key',
    model: 'test-model',
    provider: 'openrouter',
    baseUrl: undefined
  })
}));

// Mock resolveScaffoldPrompt
jest.mock('../../utils/promptLoader', () => ({
  resolveScaffoldPrompt: jest.fn().mockResolvedValue({
    content: 'Test prompt content',
    path: undefined,
    source: 'builtin'
  })
}));

function createTempOutput(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function createMockUI(): CLIInterface {
  return {
    displayWelcome: jest.fn(),
    displayProjectInfo: jest.fn(),
    displayStep: jest.fn(),
    displaySuccess: jest.fn(),
    displayWarning: jest.fn(),
    displayError: jest.fn(),
    displayInfo: jest.fn(),
    displayAnalysisComplete: jest.fn(),
    displayFileTypeDistribution: jest.fn(),
    displayGenerationSummary: jest.fn(),
    startSpinner: jest.fn(),
    updateSpinner: jest.fn(),
    stopSpinner: jest.fn(),
    createAgentCallbacks: jest.fn(() => ({}))
  } as unknown as CLIInterface;
}

function createMockTranslate(): TranslateFn {
  return ((key: string, params?: Record<string, unknown>) => {
    if (params) {
      let result = key;
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(`{${k}}`, String(v));
      }
      return result;
    }
    return key;
  }) as TranslateFn;
}

function createMockFileMapper() {
  return {
    mapRepository: jest.fn().mockResolvedValue({
      totalFiles: 10,
      totalSize: 1024,
      directories: [{ relativePath: 'src' }],
      files: []
    })
  };
}

describe('FillService', () => {
  let tempDir: string;
  let outputDir: string;
  let mockUI: CLIInterface;
  let mockT: TranslateFn;
  let service: FillService;

  beforeEach(async () => {
    tempDir = await createTempOutput('ai-context-fillservice-');
    outputDir = path.join(tempDir, '.context');
    mockUI = createMockUI();
    mockT = createMockTranslate();

    service = new FillService({
      ui: mockUI,
      t: mockT,
      version: '0.4.0',
      defaultModel: 'test-model',
      fileMapperFactory: () => createMockFileMapper() as any
    });

    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  describe('run', () => {
    it('should throw error when neither docs nor agents directory exists', async () => {
      // Don't create any dirs
      await expect(
        service.run(tempDir, { output: outputDir })
      ).rejects.toThrow('errors.fill.missingScaffold');
    });

    it('should work when only docs directory exists', async () => {
      // Create only docs dir with a file
      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.writeFile(
        path.join(outputDir, 'docs', 'test.md'),
        '# Test'
      );

      await service.run(tempDir, { output: outputDir });

      expect(mockUI.displaySuccess).toHaveBeenCalled();
    });

    it('should work when only agents directory exists', async () => {
      // Create only agents dir with a file
      await fs.ensureDir(path.join(outputDir, 'agents'));
      await fs.writeFile(
        path.join(outputDir, 'agents', 'code-reviewer.md'),
        '# Code Reviewer'
      );

      await service.run(tempDir, { output: outputDir });

      expect(mockUI.displaySuccess).toHaveBeenCalled();
    });

    it('should work when only skills directory exists', async () => {
      await fs.ensureDir(path.join(outputDir, 'skills'));
      await fs.writeFile(
        path.join(outputDir, 'skills', 'commit-message.md'),
        '# Commit Message'
      );

      await service.run(tempDir, { output: outputDir });

      expect(mockUI.displaySuccess).toHaveBeenCalled();
    });

    it('should display warning when no target files exist', async () => {
      // Create empty dirs
      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.ensureDir(path.join(outputDir, 'agents'));

      await service.run(tempDir, { output: outputDir });

      expect(mockUI.displayWarning).toHaveBeenCalledWith('warnings.fill.noTargets');
    });

    it('should process documentation files with DocumentationAgent', async () => {
      // Create dirs and files
      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.ensureDir(path.join(outputDir, 'agents'));
      await fs.writeFile(
        path.join(outputDir, 'docs', 'architecture.md'),
        '# Architecture\n\nTODO: fill in'
      );

      await service.run(tempDir, { output: outputDir });

      const { DocumentationAgent } = require('../ai/agents/documentationAgent');
      expect(DocumentationAgent).toHaveBeenCalled();

      // File should be updated
      const content = await fs.readFile(
        path.join(outputDir, 'docs', 'architecture.md'),
        'utf-8'
      );
      expect(content).toContain('# Updated Documentation');
    });

    it('should process agent files with PlaybookAgent', async () => {
      // Create dirs and files
      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.ensureDir(path.join(outputDir, 'agents'));
      await fs.writeFile(
        path.join(outputDir, 'agents', 'code-reviewer.md'),
        '# Code Reviewer\n\nTODO: fill in'
      );

      await service.run(tempDir, { output: outputDir });

      const { PlaybookAgent } = require('../ai/agents/playbookAgent');
      expect(PlaybookAgent).toHaveBeenCalled();

      // File should be updated
      const content = await fs.readFile(
        path.join(outputDir, 'agents', 'code-reviewer.md'),
        'utf-8'
      );
      expect(content).toContain('# Updated Playbook');
    });

    it('should process skills before agents', async () => {
      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.ensureDir(path.join(outputDir, 'skills'));
      await fs.ensureDir(path.join(outputDir, 'agents'));

      await fs.writeFile(
        path.join(outputDir, 'docs', 'architecture.md'),
        '# Architecture\n\nTODO: fill in'
      );
      await fs.writeFile(
        path.join(outputDir, 'skills', 'commit-message.md'),
        '# Commit Message\n\nTODO: fill in'
      );
      await fs.writeFile(
        path.join(outputDir, 'agents', 'code-reviewer.md'),
        '# Code Reviewer\n\nTODO: fill in'
      );

      await service.run(tempDir, { output: outputDir });

      const { DocumentationAgent } = require('../ai/agents/documentationAgent');
      const { PlaybookAgent } = require('../ai/agents/playbookAgent');
      const documentationTargets = DocumentationAgent.mock.results.flatMap((result: any) =>
        result.value.generateDocumentation.mock.calls.map((call: any[]) => call[0].targetFile)
      );
      expect(documentationTargets).toEqual([
        path.join('docs', 'architecture.md'),
        path.join('skills', 'commit-message.md')
      ]);

      const documentationCallOrders = DocumentationAgent.mock.results
        .flatMap((result: any) => result.value.generateDocumentation.mock.invocationCallOrder);
      const playbookCallOrders = PlaybookAgent.mock.results
        .flatMap((result: any) => result.value.generatePlaybook.mock.invocationCallOrder);
      const lastDocumentationCallOrder = Math.max(...documentationCallOrders);
      const firstPlaybookCallOrder = Math.min(...playbookCallOrders);
      expect(lastDocumentationCallOrder).toBeLessThan(firstPlaybookCallOrder);
    });

    it('should respect limit option', async () => {
      // Create dirs and multiple files
      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.ensureDir(path.join(outputDir, 'agents'));
      await fs.writeFile(path.join(outputDir, 'docs', 'file1.md'), '# File 1');
      await fs.writeFile(path.join(outputDir, 'docs', 'file2.md'), '# File 2');
      await fs.writeFile(path.join(outputDir, 'docs', 'file3.md'), '# File 3');

      await service.run(tempDir, { output: outputDir, limit: 1 });

      const { DocumentationAgent } = require('../ai/agents/documentationAgent');
      const mockInstance = DocumentationAgent.mock.results[0].value;

      // Should only process 1 file
      expect(mockInstance.generateDocumentation).toHaveBeenCalledTimes(1);
    });

    it('should pass useLSP option to agents (default false)', async () => {
      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.ensureDir(path.join(outputDir, 'agents'));
      await fs.writeFile(
        path.join(outputDir, 'docs', 'test.md'),
        '# Test'
      );

      await service.run(tempDir, { output: outputDir });

      const { DocumentationAgent } = require('../ai/agents/documentationAgent');
      const mockInstance = DocumentationAgent.mock.results[0].value;

      expect(mockInstance.generateDocumentation).toHaveBeenCalledWith(
        expect.objectContaining({
          useLSP: false
        })
      );
    });

    it('should pass useLSP=true when useLsp option is true', async () => {
      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.ensureDir(path.join(outputDir, 'agents'));
      await fs.writeFile(
        path.join(outputDir, 'docs', 'test.md'),
        '# Test'
      );

      await service.run(tempDir, { output: outputDir, useLsp: true });

      const { DocumentationAgent } = require('../ai/agents/documentationAgent');
      const mockInstance = DocumentationAgent.mock.results[0].value;

      expect(mockInstance.generateDocumentation).toHaveBeenCalledWith(
        expect.objectContaining({
          useLSP: true
        })
      );
    });

    it('should pass useSemanticContext option to agents (default true)', async () => {
      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.ensureDir(path.join(outputDir, 'agents'));
      await fs.writeFile(
        path.join(outputDir, 'docs', 'test.md'),
        '# Test'
      );

      await service.run(tempDir, { output: outputDir });

      const { DocumentationAgent } = require('../ai/agents/documentationAgent');
      const mockInstance = DocumentationAgent.mock.results[0].value;

      expect(mockInstance.generateDocumentation).toHaveBeenCalledWith(
        expect.objectContaining({
          useSemanticContext: true
        })
      );
    });

    it('should pass useSemanticContext=false when semantic option is false', async () => {
      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.ensureDir(path.join(outputDir, 'agents'));
      await fs.writeFile(
        path.join(outputDir, 'docs', 'test.md'),
        '# Test'
      );

      await service.run(tempDir, { output: outputDir, semantic: false });

      const { DocumentationAgent } = require('../ai/agents/documentationAgent');
      const mockInstance = DocumentationAgent.mock.results[0].value;

      expect(mockInstance.generateDocumentation).toHaveBeenCalledWith(
        expect.objectContaining({
          useSemanticContext: false
        })
      );
    });
  });

  describe('parseLanguages', () => {
    it('should return default languages when input is undefined', async () => {
      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.ensureDir(path.join(outputDir, 'agents'));
      await fs.writeFile(
        path.join(outputDir, 'docs', 'test.md'),
        '# Test'
      );

      // The parseLanguages is private, but we can test it through run()
      // by checking that it doesn't throw and works with undefined languages
      await service.run(tempDir, { output: outputDir, languages: undefined });

      // If it ran without error, the default languages were used
      expect(mockUI.displaySuccess).toHaveBeenCalled();
    });

    it('should parse comma-separated string', async () => {
      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.ensureDir(path.join(outputDir, 'agents'));
      await fs.writeFile(
        path.join(outputDir, 'docs', 'test.md'),
        '# Test'
      );

      // Run with comma-separated languages
      await service.run(tempDir, {
        output: outputDir,
        languages: 'typescript,python,rust'
      });

      // If it ran without error, the languages were parsed correctly
      expect(mockUI.displaySuccess).toHaveBeenCalled();
    });

    it('should handle array input', async () => {
      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.ensureDir(path.join(outputDir, 'agents'));
      await fs.writeFile(
        path.join(outputDir, 'docs', 'test.md'),
        '# Test'
      );

      // Run with array of languages
      await service.run(tempDir, {
        output: outputDir,
        languages: ['typescript', 'python']
      });

      // If it ran without error, the languages were parsed correctly
      expect(mockUI.displaySuccess).toHaveBeenCalled();
    });
  });

  describe('extractAgentTypeFromPath', () => {
    it('should extract code-reviewer from path', async () => {
      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.ensureDir(path.join(outputDir, 'agents'));
      await fs.writeFile(
        path.join(outputDir, 'agents', 'code-reviewer.md'),
        '# Code Reviewer'
      );

      await service.run(tempDir, { output: outputDir });

      const { PlaybookAgent } = require('../ai/agents/playbookAgent');
      const mockInstance = PlaybookAgent.mock.results[0].value;

      expect(mockInstance.generatePlaybook).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'code-reviewer'
        })
      );
    });

    it('should default to feature-developer for unknown agent types', async () => {
      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.ensureDir(path.join(outputDir, 'agents'));
      await fs.writeFile(
        path.join(outputDir, 'agents', 'unknown-agent.md'),
        '# Unknown Agent'
      );

      await service.run(tempDir, { output: outputDir });

      const { PlaybookAgent } = require('../ai/agents/playbookAgent');
      const mockInstance = PlaybookAgent.mock.results[0].value;

      expect(mockInstance.generatePlaybook).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'feature-developer'
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle agent errors gracefully', async () => {
      // Make the agent throw an error
      const { DocumentationAgent } = require('../ai/agents/documentationAgent');
      DocumentationAgent.mockImplementationOnce(() => ({
        generateDocumentation: jest.fn().mockRejectedValue(new Error('LLM API Error'))
      }));

      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.ensureDir(path.join(outputDir, 'agents'));
      await fs.writeFile(
        path.join(outputDir, 'docs', 'test.md'),
        '# Test'
      );

      // Should not throw, but handle the error
      await service.run(tempDir, { output: outputDir });

      expect(mockUI.displayError).toHaveBeenCalled();
    });

    it('should handle empty response from agent', async () => {
      // Make the agent return empty content
      const { DocumentationAgent } = require('../ai/agents/documentationAgent');
      DocumentationAgent.mockImplementationOnce(() => ({
        generateDocumentation: jest.fn().mockResolvedValue({
          text: '',
          toolsUsed: [],
          steps: 1
        })
      }));

      await fs.ensureDir(path.join(outputDir, 'docs'));
      await fs.ensureDir(path.join(outputDir, 'agents'));
      await fs.writeFile(
        path.join(outputDir, 'docs', 'test.md'),
        '# Test'
      );

      await service.run(tempDir, { output: outputDir });

      expect(mockUI.displayWarning).toHaveBeenCalled();
    });
  });
});
