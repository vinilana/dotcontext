import { AgentType } from './agentTypes';

export const AGENT_RESPONSIBILITIES: Record<AgentType, string[]> = {
  'code-reviewer': [
    'Review code changes for quality, style, and best practices',
    'Identify potential bugs and security issues',
    'Ensure code follows project conventions',
    'Provide constructive feedback and suggestions'
  ],
  'bug-fixer': [
    'Analyze bug reports and error messages',
    'Identify root causes of issues',
    'Implement targeted fixes with minimal side effects',
    'Test fixes thoroughly before deployment'
  ],
  'feature-developer': [
    'Implement new features according to specifications',
    'Design clean, maintainable code architecture',
    'Integrate features with existing codebase',
    'Write comprehensive tests for new functionality'
  ],
  'refactoring-specialist': [
    'Identify code smells and improvement opportunities',
    'Refactor code while maintaining functionality',
    'Improve code organization and structure',
    'Optimize performance where applicable'
  ],
  'test-writer': [
    'Write comprehensive unit and integration tests',
    'Ensure good test coverage across the codebase',
    'Create test utilities and fixtures',
    'Maintain and update existing tests'
  ],
  'documentation-writer': [
    'Create clear, comprehensive documentation',
    'Update existing documentation as code changes',
    'Write helpful code comments and examples',
    'Maintain README and API documentation'
  ],
  'performance-optimizer': [
    'Identify performance bottlenecks',
    'Optimize code for speed and efficiency',
    'Implement caching strategies',
    'Monitor and improve resource usage'
  ],
  'security-auditor': [
    'Identify security vulnerabilities',
    'Implement security best practices',
    'Review dependencies for security issues',
    'Ensure data protection and privacy compliance'
  ],
  'backend-specialist': [
    'Design and implement server-side architecture',
    'Create and maintain APIs and microservices',
    'Optimize database queries and data models',
    'Implement authentication and authorization',
    'Handle server deployment and scaling'
  ],
  'frontend-specialist': [
    'Design and implement user interfaces',
    'Create responsive and accessible web applications',
    'Optimize client-side performance and bundle sizes',
    'Implement state management and routing',
    'Ensure cross-browser compatibility'
  ],
  'architect-specialist': [
    'Design overall system architecture and patterns',
    'Define technical standards and best practices',
    'Evaluate and recommend technology choices',
    'Plan system scalability and maintainability',
    'Create architectural documentation and diagrams'
  ],
  'devops-specialist': [
    'Design and maintain CI/CD pipelines',
    'Implement infrastructure as code',
    'Configure monitoring and alerting systems',
    'Manage container orchestration and deployments',
    'Optimize cloud resources and cost efficiency'
  ],
  'database-specialist': [
    'Design and optimize database schemas',
    'Create and manage database migrations',
    'Optimize query performance and indexing',
    'Ensure data integrity and consistency',
    'Implement backup and recovery strategies'
  ],
  'mobile-specialist': [
    'Develop native and cross-platform mobile applications',
    'Optimize mobile app performance and battery usage',
    'Implement mobile-specific UI/UX patterns',
    'Handle app store deployment and updates',
    'Integrate push notifications and offline capabilities'
  ]
};

export const AGENT_BEST_PRACTICES: Record<AgentType, string[]> = {
  'code-reviewer': [
    'Focus on maintainability and readability',
    'Consider the broader impact of changes',
    'Be constructive and specific in feedback'
  ],
  'bug-fixer': [
    'Reproduce the bug before fixing',
    'Write tests to prevent regression',
    'Document the fix for future reference'
  ],
  'feature-developer': [
    'Follow existing patterns and conventions',
    'Consider edge cases and error handling',
    'Write tests alongside implementation'
  ],
  'refactoring-specialist': [
    'Make small, incremental changes',
    'Ensure tests pass after each refactor',
    'Preserve existing functionality exactly'
  ],
  'test-writer': [
    'Write tests that are clear and maintainable',
    'Test both happy path and edge cases',
    'Use descriptive test names'
  ],
  'documentation-writer': [
    'Keep documentation up-to-date with code',
    'Write from the user\'s perspective',
    'Include practical examples'
  ],
  'performance-optimizer': [
    'Measure before optimizing',
    'Focus on actual bottlenecks',
    'Don\'t sacrifice readability unnecessarily'
  ],
  'security-auditor': [
    'Follow security best practices',
    'Stay updated on common vulnerabilities',
    'Consider the principle of least privilege'
  ],
  'backend-specialist': [
    'Design APIs according the specification of the project',
    'Implement proper error handling and logging',
    'Use appropriate design patterns and clean architecture',
    'Consider scalability and performance from the start',
    'Implement comprehensive testing for business logic'
  ],
  'frontend-specialist': [
    'Follow modern frontend development patterns',
    'Optimize for accessibility and user experience',
    'Implement responsive design principles',
    'Use component-based architecture effectively',
    'Optimize performance and loading times'
  ],
  'architect-specialist': [
    'Consider long-term maintainability and scalability',
    'Balance technical debt with business requirements',
    'Document architectural decisions and rationale',
    'Promote code reusability and modularity',
    'Stay updated on industry trends and technologies'
  ],
  'devops-specialist': [
    'Automate everything that can be automated',
    'Implement infrastructure as code for reproducibility',
    'Monitor system health proactively',
    'Design for failure and implement proper fallbacks',
    'Keep security and compliance in every deployment'
  ],
  'database-specialist': [
    'Always benchmark queries before and after optimization',
    'Plan migrations with rollback strategies',
    'Use appropriate indexing strategies for workloads',
    'Maintain data consistency across transactions',
    'Document schema changes and their business impact'
  ],
  'mobile-specialist': [
    'Test on real devices, not just simulators',
    'Optimize for battery life and data usage',
    'Follow platform-specific design guidelines',
    'Implement proper offline-first strategies',
    'Plan for app store review requirements early'
  ]
};