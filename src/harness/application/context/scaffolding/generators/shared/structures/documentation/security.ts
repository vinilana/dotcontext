import { ScaffoldStructure } from '../types';

export const securityStructure: ScaffoldStructure = {
  fileType: 'doc',
  documentName: 'security',
  title: 'Security & Compliance Notes',
  description: 'Security policies, authentication, secrets management, and compliance requirements',
  tone: 'formal',
  audience: 'developers',
  sections: [
    {
      heading: 'Security & Compliance Notes',
      order: 1,
      contentType: 'prose',
      guidance: 'Capture the policies and guardrails that keep this project secure and compliant.',
      required: true,
      headingLevel: 2,
      defaultContent: `This document outlines security practices, policies, and guidelines for this project.

**Security Principles**:
- Defense in depth — Multiple security layers
- Principle of least privilege — Minimal necessary access
- Secure by default — Safe configurations out of the box`,
    },
    {
      heading: 'Authentication & Authorization',
      order: 2,
      contentType: 'prose',
      guidance: 'Describe identity providers, token formats, session strategies, and role/permission models.',
      required: true,
      headingLevel: 2,
      defaultContent: `**Authentication**:
- [Describe authentication mechanism: JWT, sessions, OAuth, etc.]
- Token/session expiration: [Duration]
- Refresh strategy: [How tokens are refreshed]

**Authorization**:
- Permission model: [RBAC, ABAC, etc.]
- Role definitions: [Admin, User, etc.]
- Access control enforcement: [Where/how permissions are checked]`,
    },
    {
      heading: 'Secrets & Sensitive Data',
      order: 3,
      contentType: 'prose',
      guidance: 'Document storage locations (vaults, parameter stores), rotation cadence, encryption practices, and data classifications.',
      required: true,
      headingLevel: 2,
      defaultContent: `**Secrets Management**:
- Storage: Environment variables / secrets manager
- Never commit secrets to version control
- Use \`.env.example\` as a template (without real values)

**Sensitive Data Handling**:
- Encryption at rest: [Yes/No, method]
- Encryption in transit: TLS 1.2+
- Data classification: [Public, Internal, Confidential, Restricted]

**Best Practices**:
- Rotate secrets regularly
- Use strong, unique passwords
- Audit access to sensitive data`,
    },
    {
      heading: 'Compliance & Policies',
      order: 4,
      contentType: 'list',
      guidance: 'List applicable standards (GDPR, SOC2, HIPAA, internal policies) and evidence requirements.',
      required: false,
      headingLevel: 2,
      defaultContent: `**Applicable Standards**:
- [List relevant compliance frameworks]

**Security Policies**:
- Code review required for all changes
- Dependency scanning for vulnerabilities
- Regular security assessments`,
    },
    {
      heading: 'Incident Response',
      order: 5,
      contentType: 'prose',
      guidance: 'Note on-call contacts, escalation steps, and tooling for detection, triage, and post-incident analysis.',
      required: false,
      headingLevel: 2,
      defaultContent: `**Reporting Security Issues**:
- Report security vulnerabilities to [security contact]
- Do not disclose publicly before fix is available

**Incident Response**:
1. Identify and contain the issue
2. Assess impact and scope
3. Remediate and recover
4. Document and learn from the incident`,
    },
  ],
  linkTo: ['architecture.md'],
};
