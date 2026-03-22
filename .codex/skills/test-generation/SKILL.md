---
name: Test Generation
description: Generate comprehensive test cases for code
phases: [E, V]
---

# Test Generation

Generate and maintain tests for the `@dotcontext/cli` project using Jest with ts-jest.

## When to Use

- Writing tests for new services, generators, or utilities
- Adding test coverage for MCP gateway handlers
- Creating integration tests for CLI commands
- Validating bug fixes with regression tests
- During Execution (E) and Validation (V) phases

## Test Configuration

- **Framework**: Jest with ts-jest preset
- **Config**: `jest.config.js` at project root
- **Test location**: Co-located with source files (`*.test.ts`) or in `__tests__/` directories
- **Test match patterns**: `**/__tests__/**/*.ts`, `**/?(*.)+(spec|test).ts`
- **Root**: `src/`

```bash
# Run all tests
npm test

# Run specific test file
npx jest src/services/fill/fillService.test.ts

# Run tests matching a pattern
npx jest --testPathPattern="mcp"

# Run with coverage
npx jest --coverage
```

## Test Patterns by Layer

### Service Tests

Services are the most common test target. Follow the pattern in `fillService.test.ts`:

```typescript
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import { MyService } from './myService';
import type { CLIInterface } from '../../utils/cliUI';
import type { TranslateFn } from '../../utils/i18n';

// Mock external dependencies
jest.mock('../ai/agents/documentationAgent', () => ({
  DocumentationAgent: jest.fn().mockImplementation(() => ({
    generateDocumentation: jest.fn().mockResolvedValue({
      text: '# Content',
      toolsUsed: [],
      steps: 1
    })
  }))
}));

// Create temp directory for isolation
let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));
});

afterEach(async () => {
  await fs.remove(tempDir);
});

// Mock CLI interface
function createMockUI(): CLIInterface {
  return {
    displayWelcome: jest.fn(),
    displayProjectInfo: jest.fn(),
    displayStep: jest.fn(),
    displaySuccess: jest.fn(),
    displayWarning: jest.fn(),
    displayError: jest.fn(),
    // ... other CLIInterface methods
  };
}

// Mock translate function
const mockT: TranslateFn = ((key: string) => key) as TranslateFn;
```

Key patterns:
- **Temp directories**: Always use `fs.mkdtemp()` and clean up in `afterEach`
- **Mock CLIInterface**: Provide a mock with `jest.fn()` for each method
- **Mock TranslateFn**: Simple passthrough `(key) => key`
- **Mock AI agents**: Use `jest.mock()` at module level with factory function
- **Mock llmConfig**: Mock `resolveLlmConfig` to return test credentials

### MCP Gateway Handler Tests

Test handlers directly, not through MCP transport:

```typescript
import { handleExplore, ExploreParams } from './gateway/explore';

describe('handleExplore', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'explore-'));
    await fs.writeFile(path.join(tempDir, 'test.ts'), 'export const x = 1;');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('should read a file', async () => {
    const result = await handleExplore(
      { action: 'read', filePath: path.join(tempDir, 'test.ts') },
      { repoPath: tempDir }
    );

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.content).toContain('export const x');
  });

  it('should return error for missing file', async () => {
    const result = await handleExplore(
      { action: 'read', filePath: path.join(tempDir, 'missing.ts') },
      { repoPath: tempDir }
    );

    expect(result.isError).toBe(true);
  });
});
```

### Generator Tests

Test that generators produce correct file structures:

```typescript
import { SkillGenerator } from './skillGenerator';

describe('SkillGenerator', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gen-'));
  });

  it('should generate skill directories', async () => {
    const generator = new SkillGenerator({ repoPath: tempDir });
    const result = await generator.generate({ skills: ['commit-message'] });

    expect(result.generatedSkills).toContain('commit-message');
    expect(fs.existsSync(path.join(tempDir, '.context/skills/commit-message/SKILL.md'))).toBe(true);
  });

  it('should skip existing skills when force is false', async () => {
    const generator = new SkillGenerator({ repoPath: tempDir });
    await generator.generate({ skills: ['commit-message'] });
    const result = await generator.generate({ skills: ['commit-message'], force: false });

    expect(result.skippedSkills).toContain('commit-message');
  });
});
```

### Utility Tests

Test pure functions directly:

```typescript
import { parseFrontMatter, isScaffoldFrontmatter } from './frontMatter';

describe('frontMatter', () => {
  it('should parse v2 scaffold frontmatter', () => {
    const content = `---
type: skill
name: Test
status: filled
scaffoldVersion: "2.0.0"
---
# Content`;

    const result = parseFrontMatter(content);
    expect(isScaffoldFrontmatter(result)).toBe(true);
    expect(result.status).toBe('filled');
  });
});
```

### Workflow Tests

Test phase transitions and gate logic:

```typescript
import { GateChecker } from './gateChecker';

describe('GateChecker', () => {
  it('should block P->R transition when plan required but missing', () => {
    const checker = new GateChecker({ require_plan: true });
    const result = checker.canAdvance('P', 'R', { hasPlan: false });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('plan');
  });
});
```

## What to Mock

| Dependency | Mock Strategy | Example |
|-----------|--------------|---------|
| AI agents (DocumentationAgent, PlaybookAgent) | `jest.mock()` at module level | `fillService.test.ts` |
| LLM config resolution | `jest.mock('../shared/llmConfig')` | Return test credentials |
| File system (for isolation) | Use `fs.mkdtemp()` temp dirs | All service tests |
| Prompt loader | `jest.mock('../../utils/promptLoader')` | Return test prompt |
| CLI interface | Manual mock object | `createMockUI()` helper |
| Translate function | Passthrough `(key) => key` | All CLI-facing tests |
| tree-sitter (optional dep) | Test with and without | Semantic analysis tests |

## Test Checklist

- [ ] Tests are co-located with source or in `__tests__/`
- [ ] File name matches pattern: `<name>.test.ts`
- [ ] External dependencies are mocked (AI, file system, network)
- [ ] Temp directories created in `beforeEach`, removed in `afterEach`
- [ ] Both success and error paths are tested
- [ ] Edge cases covered: empty input, missing files, malformed frontmatter
- [ ] Tests run independently (no shared mutable state between tests)
- [ ] TypeScript types verified at compile time (`npm run build`)

## Integration Tests

For end-to-end testing of CLI commands, see `src/runInit.integration.test.ts`:

```typescript
// Integration tests use real file system but mock AI providers
// They verify the full command pipeline from CLI args to file output
```

Integration tests are slower and may require:
- Real `.context/` directory structure
- Actual file writes (in temp dirs)
- Mocked AI responses (but real service orchestration)

Run integration tests separately if needed:
```bash
npx jest --testPathPattern="integration"
```