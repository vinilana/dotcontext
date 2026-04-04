/**
 * Skill structure definitions with static default content
 */

import { createSkillStructure, SkillDefaultContent } from './factory';

// ============================================================================
// Default Content Definitions
// ============================================================================

export const commitMessageContent: SkillDefaultContent = {
  whenToUse: `Use this skill when:
- Creating git commits after code changes
- Writing commit messages for staged changes
- Following conventional commit format for the project`,

  instructions: `1. Review the staged changes using \`git diff --staged\`
2. Identify the type of change (feat, fix, docs, style, refactor, test, chore)
3. Determine the scope (component, module, or area affected)
4. Write a concise subject line (50 chars max, imperative mood)
5. Add body if needed to explain "why" not "what"
6. Reference issue numbers if applicable`,

  examples: `**Feature commit:**
\`\`\`
feat(auth): add password reset functionality

Implement forgot password flow with email verification.
Users can now reset their password via email link.

Closes #123
\`\`\`

**Bug fix commit:**
\`\`\`
fix(api): handle null response in user lookup

Previously threw TypeError when user not found.
Now returns 404 with appropriate error message.

Fixes #456
\`\`\``,

  guidelines: `- Use imperative mood: "add" not "added" or "adds"
- Keep subject line under 50 characters
- Separate subject from body with blank line
- Use body to explain why, not what (code shows what)
- Reference issues with "Closes #X" or "Fixes #X"
- One logical change per commit
- Don't end subject line with period`,
};

export const prReviewContent: SkillDefaultContent = {
  whenToUse: `Use this skill when:
- Reviewing a pull request before merge
- Providing feedback on proposed changes
- Validating PR meets project standards`,

  instructions: `1. Read the PR description to understand the goal
2. Review the linked issue(s) for context
3. Check that tests are included and passing
4. Review code changes file by file
5. Verify documentation is updated if needed
6. Leave constructive feedback with specific suggestions
7. Approve, request changes, or comment based on findings`,

  examples: `**Approval comment:**
\`\`\`
Looks good! Clean implementation with comprehensive tests.

Minor suggestion: Consider extracting the validation logic
in \`UserService.ts:45\` into a separate function for reusability.

Approved ✅
\`\`\`

**Request changes:**
\`\`\`
Good progress, but a few items need attention:

1. Missing test for error handling in \`fetchUser()\`
2. The new endpoint needs documentation in the API docs
3. Consider adding input validation for the email field

Please address these and I'll re-review.
\`\`\``,

  guidelines: `- Start with understanding the PR's goal
- Be constructive and specific in feedback
- Distinguish between required changes and suggestions
- Test the changes locally if complex
- Check for security implications
- Verify backward compatibility
- Approve only when confident in the changes`,
};

export const codeReviewContent: SkillDefaultContent = {
  whenToUse: `Use this skill when:
- Reviewing code changes for quality
- Checking adherence to coding standards
- Identifying potential bugs or issues`,

  instructions: `1. Understand the context and purpose of the code
2. Check for correctness and logic errors
3. Evaluate code structure and organization
4. Look for potential performance issues
5. Check for security vulnerabilities
6. Verify error handling is appropriate
7. Assess readability and maintainability`,

  examples: `**Code quality feedback:**
\`\`\`
// Before: Nested callbacks
fetchUser(id, (user) => {
  fetchPosts(user.id, (posts) => {
    render(posts);
  });
});

// Suggestion: Use async/await
const user = await fetchUser(id);
const posts = await fetchPosts(user.id);
render(posts);
\`\`\`

**Security feedback:**
\`\`\`
// Issue: SQL injection vulnerability
const query = \`SELECT * FROM users WHERE id = \${userId}\`;

// Fix: Use parameterized query
const query = 'SELECT * FROM users WHERE id = ?';
db.query(query, [userId]);
\`\`\``,

  guidelines: `- Focus on the most impactful issues first
- Explain why something is a problem
- Provide concrete suggestions for improvement
- Consider the developer's experience level
- Balance thoroughness with pragmatism
- Praise good patterns when you see them`,
};

export const testGenerationContent: SkillDefaultContent = {
  whenToUse: `Use this skill when:
- Writing tests for new functionality
- Adding tests for bug fixes (regression tests)
- Improving test coverage for existing code`,

  instructions: `1. Identify the function/component to test
2. List the behaviors that need testing
3. Write tests for happy path scenarios
4. Add tests for edge cases and boundaries
5. Include error handling tests
6. Mock external dependencies appropriately
7. Verify tests are deterministic and isolated`,

  examples: `**Unit test example:**
\`\`\`typescript
describe('calculateTotal', () => {
  it('should sum item prices correctly', () => {
    const items = [{ price: 10 }, { price: 20 }];
    expect(calculateTotal(items)).toBe(30);
  });

  it('should return 0 for empty array', () => {
    expect(calculateTotal([])).toBe(0);
  });

  it('should handle negative prices', () => {
    const items = [{ price: 10 }, { price: -5 }];
    expect(calculateTotal(items)).toBe(5);
  });
});
\`\`\``,

  guidelines: `- Test behavior, not implementation
- Use descriptive test names that explain what and why
- Follow Arrange-Act-Assert pattern
- Keep tests independent and isolated
- Don't test external libraries
- Mock at the boundary, not everywhere
- Aim for fast, reliable tests`,
};

export const documentationContent: SkillDefaultContent = {
  whenToUse: `Use this skill when:
- Documenting new features or APIs
- Updating docs for code changes
- Creating README or getting started guides`,

  instructions: `1. Identify the target audience
2. Determine what needs to be documented
3. Write clear, concise explanations
4. Include working code examples
5. Add any necessary diagrams or visuals
6. Review for clarity and completeness
7. Verify examples work with current code`,

  examples: `**Function documentation:**
\`\`\`typescript
/**
 * Calculates the total price of items in a cart.
 *
 * @param items - Array of cart items with price property
 * @returns The sum of all item prices
 * @throws {Error} If items is not an array
 *
 * @example
 * const total = calculateTotal([{ price: 10 }, { price: 20 }]);
 * // Returns: 30
 */
function calculateTotal(items: CartItem[]): number
\`\`\``,

  guidelines: `- Write for your audience's knowledge level
- Lead with the most important information
- Include working, copy-pasteable examples
- Keep documentation close to the code
- Update docs in the same PR as code changes
- Use consistent formatting and terminology`,
};

export const refactoringContent: SkillDefaultContent = {
  whenToUse: `Use this skill when:
- Improving code structure without changing behavior
- Reducing code duplication
- Simplifying complex logic`,

  instructions: `1. Ensure adequate test coverage exists
2. Identify the specific improvement to make
3. Make one type of change at a time
4. Run tests after each change
5. Commit frequently with clear messages
6. Verify no behavior changes occurred`,

  examples: `**Extract function:**
\`\`\`typescript
// Before: Inline validation logic
if (email && email.includes('@') && email.length > 5) {
  // process email
}

// After: Extracted to function
function isValidEmail(email: string): boolean {
  return email && email.includes('@') && email.length > 5;
}

if (isValidEmail(email)) {
  // process email
}
\`\`\``,

  guidelines: `- Never refactor without tests
- Small steps, frequent commits
- One refactoring type per commit
- If tests break, you changed behavior
- Use IDE refactoring tools when available
- Keep the PR focused and reviewable`,
};

export const bugInvestigationContent: SkillDefaultContent = {
  whenToUse: `Use this skill when:
- Investigating reported bugs
- Diagnosing unexpected behavior
- Finding the root cause of issues`,

  instructions: `1. Reproduce the bug consistently
2. Gather information (logs, stack traces, steps)
3. Identify when the bug was introduced (git bisect)
4. Form a hypothesis about the cause
5. Verify hypothesis with debugging
6. Document the root cause
7. Plan the fix approach`,

  examples: `**Bug investigation notes:**
\`\`\`
## Bug: User profile fails to load

### Reproduction:
1. Log in as any user
2. Navigate to /profile
3. Error: "Cannot read property 'name' of undefined"

### Investigation:
- Stack trace points to ProfilePage.tsx:25
- API returns 200 but empty body when session expired
- Bug introduced in commit abc123 (session refactor)

### Root cause:
Session middleware not checking token expiration correctly.
Returns empty response instead of 401.

### Fix approach:
Update session middleware to return 401 when token expired.
\`\`\``,

  guidelines: `- Always reproduce before investigating
- Check recent changes that might relate
- Use debugger and logging strategically
- Document your findings
- Consider if bug exists elsewhere
- Write a regression test with the fix`,
};

export const featureBreakdownContent: SkillDefaultContent = {
  whenToUse: `Use this skill when:
- Planning new feature implementation
- Breaking large tasks into smaller pieces
- Creating implementation roadmap`,

  instructions: `1. Understand the full feature requirements
2. Identify the main components needed
3. Break into independent, testable tasks
4. Identify dependencies between tasks
5. Order tasks by dependency and priority
6. Add acceptance criteria to each task
7. Flag any unknowns or risks`,

  examples: `**Feature breakdown example:**
\`\`\`
## Feature: User Authentication

### Task 1: Database schema
- Add users table with email, password_hash, created_at
- Add sessions table with user_id, token, expires_at
- Acceptance: Migrations run successfully

### Task 2: Registration endpoint
- POST /api/auth/register
- Validate email format and password strength
- Hash password before storing
- Acceptance: Can create user, returns 201

### Task 3: Login endpoint
- POST /api/auth/login
- Verify credentials, create session
- Return JWT token
- Acceptance: Can login, receive valid token

### Dependencies:
Task 2 requires Task 1
Task 3 requires Task 1
\`\`\``,

  guidelines: `- Each task should be independently testable
- Tasks should be small enough to complete in a day
- Clearly state acceptance criteria
- Identify and document dependencies
- Flag technical risks or unknowns early
- Consider parallel work opportunities`,
};

export const apiDesignContent: SkillDefaultContent = {
  whenToUse: `Use this skill when:
- Designing new API endpoints
- Restructuring existing APIs
- Planning API versioning strategy`,

  instructions: `1. Define the resources and their relationships
2. Choose appropriate HTTP methods
3. Design URL structure following REST conventions
4. Define request/response schemas
5. Plan error handling and status codes
6. Consider pagination, filtering, sorting
7. Document the API specification`,

  examples: `**RESTful API design:**
\`\`\`
# Users API

GET    /api/v1/users          # List users (paginated)
POST   /api/v1/users          # Create user
GET    /api/v1/users/:id      # Get user by ID
PUT    /api/v1/users/:id      # Update user
DELETE /api/v1/users/:id      # Delete user

# Nested resources
GET    /api/v1/users/:id/posts    # Get user's posts

# Response format
{
  "data": { ... },
  "meta": { "page": 1, "total": 100 }
}

# Error format
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [...]
  }
}
\`\`\``,

  guidelines: `- Use nouns for resources, not verbs
- Use proper HTTP methods and status codes
- Version your API from the start
- Be consistent in naming and structure
- Provide clear error messages
- Document all endpoints
- Consider rate limiting and caching`,
};

export const securityAuditContent: SkillDefaultContent = {
  whenToUse: `Use this skill when:
- Reviewing code for security vulnerabilities
- Assessing authentication/authorization
- Checking for OWASP top 10 issues`,

  instructions: `1. Review authentication implementation
2. Check authorization on all endpoints
3. Look for injection vulnerabilities
4. Verify input validation and sanitization
5. Check for sensitive data exposure
6. Review dependency security
7. Document findings with severity`,

  examples: `**Security audit findings:**
\`\`\`
## Security Audit Report

### Critical
1. SQL Injection in UserController.ts:45
   - Query constructed with string concatenation
   - Fix: Use parameterized queries

### High
2. Missing authentication on /api/admin/*
   - Admin routes accessible without auth
   - Fix: Add auth middleware

### Medium
3. Sensitive data in logs
   - Passwords logged in debug mode
   - Fix: Sanitize logs, remove sensitive fields

### Recommendations
- Enable security headers (HSTS, CSP)
- Implement rate limiting
- Add input validation middleware
\`\`\``,

  guidelines: `- Check OWASP top 10 vulnerabilities
- Never trust user input
- Review authentication carefully
- Verify authorization on all routes
- Check for sensitive data exposure
- Scan dependencies for known vulnerabilities
- Document findings with clear severity levels`,
};

// ============================================================================
// Skill Structure Exports
// ============================================================================

export const commitMessageSkillStructure = createSkillStructure(
  'commit-message',
  'Commit Message',
  'Generates conventional commit messages following project conventions',
  'Focus on conventional commits format, clear descriptions, and linking to issues.',
  commitMessageContent
);

export const prReviewSkillStructure = createSkillStructure(
  'pr-review',
  'PR Review',
  'Reviews pull requests for quality, completeness, and adherence to standards',
  'Focus on code quality, test coverage, documentation, and potential issues.',
  prReviewContent
);

export const codeReviewSkillStructure = createSkillStructure(
  'code-review',
  'Code Review',
  'Reviews code changes for quality and best practices',
  'Focus on maintainability, performance, security, and style consistency.',
  codeReviewContent
);

export const testGenerationSkillStructure = createSkillStructure(
  'test-generation',
  'Test Generation',
  'Generates comprehensive tests for code',
  'Focus on unit tests, edge cases, mocking strategies, and test organization.',
  testGenerationContent
);

export const documentationSkillStructure = createSkillStructure(
  'documentation',
  'Documentation',
  'Creates and updates documentation',
  'Focus on clarity, examples, API documentation, and keeping docs current.',
  documentationContent
);

export const refactoringSkillStructure = createSkillStructure(
  'refactoring',
  'Refactoring',
  'Refactors code to improve structure and maintainability',
  'Focus on small incremental changes, test coverage, and preserving behavior.',
  refactoringContent
);

export const bugInvestigationSkillStructure = createSkillStructure(
  'bug-investigation',
  'Bug Investigation',
  'Investigates and diagnoses bugs',
  'Focus on reproduction, root cause analysis, and fix verification.',
  bugInvestigationContent
);

export const featureBreakdownSkillStructure = createSkillStructure(
  'feature-breakdown',
  'Feature Breakdown',
  'Breaks down features into implementable tasks',
  'Focus on clear requirements, dependencies, and estimation.',
  featureBreakdownContent
);

export const apiDesignSkillStructure = createSkillStructure(
  'api-design',
  'API Design',
  'Designs APIs following best practices',
  'Focus on RESTful design, versioning, error handling, and documentation.',
  apiDesignContent
);

export const securityAuditSkillStructure = createSkillStructure(
  'security-audit',
  'Security Audit',
  'Audits code for security vulnerabilities',
  'Focus on OWASP top 10, input validation, authentication, and authorization.',
  securityAuditContent
);
