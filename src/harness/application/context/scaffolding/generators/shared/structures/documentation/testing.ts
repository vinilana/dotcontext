import { ScaffoldStructure } from '../types';

export const testingStrategyStructure: ScaffoldStructure = {
  fileType: 'doc',
  documentName: 'testing-strategy',
  title: 'Testing Strategy',
  description: 'Test frameworks, patterns, coverage requirements, and quality gates',
  tone: 'instructional',
  audience: 'developers',
  sections: [
    {
      heading: 'Testing Strategy',
      order: 1,
      contentType: 'prose',
      guidance: 'Document how quality is maintained across the codebase.',
      required: true,
      headingLevel: 2,
      defaultContent: `This document outlines the testing strategy for maintaining code quality.

**Testing Philosophy**:
- Tests should be fast, isolated, and deterministic
- Follow the test pyramid: many unit tests, fewer integration tests, minimal E2E tests
- Test behavior, not implementation details
- Every bug fix should include a regression test`,
    },
    {
      heading: 'Test Types',
      order: 2,
      contentType: 'list',
      guidance: 'For Unit, Integration, and E2E tests: list frameworks, file naming conventions, and required tooling.',
      exampleContent: '- **Unit**: Jest, files named `*.test.ts`\n- **Integration**: Describe scenarios\n- **E2E**: Note harnesses or environments',
      required: true,
      headingLevel: 2,
      defaultContent: `**Unit Tests**:
- Framework: Jest / Vitest
- Location: \`__tests__/\` or co-located \`*.test.ts\` files
- Purpose: Test individual functions and components in isolation
- Mocking: Use jest mocks for external dependencies

**Integration Tests**:
- Framework: Jest / Vitest
- Location: \`tests/integration/\` or \`*.integration.test.ts\`
- Purpose: Test feature workflows and component interactions
- Setup: May require test database or external services

**E2E Tests** (if applicable):
- Framework: Playwright / Cypress
- Location: \`e2e/\` or \`tests/e2e/\`
- Purpose: Test critical user paths end-to-end
- Environment: Requires full application stack`,
    },
    {
      heading: 'Running Tests',
      order: 3,
      contentType: 'list',
      guidance: 'Commands for running all tests, watch mode, and coverage. Use code blocks.',
      exampleContent: '- All tests: `npm run test`\n- Watch mode: `npm run test -- --watch`\n- Coverage: `npm run test -- --coverage`',
      required: true,
      headingLevel: 2,
      defaultContent: `**Commands**:
\`\`\`bash
# Run all tests
npm run test

# Run tests in watch mode (for development)
npm run test -- --watch

# Run tests with coverage report
npm run test -- --coverage

# Run specific test file
npm run test -- path/to/file.test.ts

# Run tests matching pattern
npm run test -- --testNamePattern="pattern"
\`\`\``,
    },
    {
      heading: 'Quality Gates',
      order: 4,
      contentType: 'list',
      guidance: 'Define minimum coverage expectations. Capture linting or formatting requirements before merging.',
      required: true,
      headingLevel: 2,
      defaultContent: `**Coverage Requirements**:
- Minimum overall coverage: 80%
- New code should have higher coverage
- Critical paths require 100% coverage

**Pre-merge Checks**:
- [ ] All tests pass
- [ ] Coverage thresholds met
- [ ] Linting passes (\`npm run lint\`)
- [ ] Type checking passes (\`npm run typecheck\`)
- [ ] Build succeeds (\`npm run build\`)

**CI Pipeline**:
- Tests run automatically on every PR
- Coverage reports generated and compared to baseline
- Failed checks block merge`,
    },
    {
      heading: 'Troubleshooting',
      order: 5,
      contentType: 'prose',
      guidance: 'Document flaky suites, long-running tests, or environment quirks.',
      required: false,
      headingLevel: 2,
      defaultContent: `**Common Issues**:

*Tests timing out*:
- Increase timeout for slow operations
- Check for unresolved promises
- Verify mocks are properly configured

*Flaky tests*:
- Avoid time-dependent assertions
- Use proper async/await patterns
- Isolate tests from external state

*Environment issues*:
- Ensure Node version matches project requirements
- Clear node_modules and reinstall if dependencies are corrupted
- Check for conflicting global installations`,
    },
  ],
  linkTo: ['development-workflow.md'],
};
