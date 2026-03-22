# Agent Handbook

This directory contains ready-to-customize playbooks for AI agents collaborating on the `@dotcontext/cli` codebase.

## Available Agents

- [Code Reviewer](./code-reviewer.md) -- Review code changes for quality, style, and best practices
- [Bug Fixer](./bug-fixer.md) -- Analyze bug reports and error messages
- [Feature Developer](./feature-developer.md) -- Implement new features according to specifications
- [Refactoring Specialist](./refactoring-specialist.md) -- Identify code smells and improvement opportunities
- [Test Writer](./test-writer.md) -- Write comprehensive unit and integration tests
- [Documentation Writer](./documentation-writer.md) -- Create clear, comprehensive documentation
- [Performance Optimizer](./performance-optimizer.md) -- Identify performance bottlenecks

## How To Use These Playbooks

1. Pick the agent that matches your task (e.g., `test-writer` when adding test coverage for a new service).
2. Open the playbook file and adapt the template with project-specific context:
   - Reference the relevant service under `src/services/` or generator under `src/generators/`.
   - Link to the corresponding doc in `.context/docs/` or plan in `.context/plans/`.
   - Include any active workflow phase or plan constraints.
3. Paste the final prompt into your AI assistant session.
4. After the task, capture learnings in the relevant documentation file (`.context/docs/`) so future runs improve.

## Related Resources

- [Documentation Index](../docs/README.md)
- [Agent Knowledge Base](../../AGENTS.md)
- [Contributor Guidelines](../../CONTRIBUTING.md)
