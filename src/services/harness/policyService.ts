import * as fs from 'fs-extra';
import * as path from 'path';

export type HarnessPolicyEffect = 'allow' | 'deny' | 'require_approval';
export type HarnessPolicyRisk = 'low' | 'medium' | 'high' | 'critical';
export type HarnessPolicyTarget = 'tool' | 'action' | 'path' | 'risk';
export type HarnessPolicyScope = HarnessPolicyTarget;
export type HarnessPolicyDefaultEffect = 'allow' | 'deny';

export interface HarnessPolicyRuleSelector {
  tools?: string[];
  actions?: string[];
  paths?: string[];
  risk?: HarnessPolicyRisk;
}

export interface HarnessPolicyRule {
  id: string;
  effect: HarnessPolicyEffect;
  when?: HarnessPolicyRuleSelector;
  target?: HarnessPolicyTarget;
  pattern?: string;
  approvalRole?: string;
  reason?: string;
}

export interface HarnessPolicyDocument {
  version: 1;
  defaultEffect: HarnessPolicyDefaultEffect;
  rules: HarnessPolicyRule[];
}

export interface HarnessPolicyApproval {
  approvedBy?: string;
  note?: string;
}

export interface HarnessPolicyEvaluationInput {
  tool?: string;
  action: string;
  paths?: string[];
  path?: string;
  risk?: HarnessPolicyRisk;
  approval?: HarnessPolicyApproval;
  approvalRole?: string;
  metadata?: Record<string, unknown>;
}

export interface HarnessPolicyLegacyEnforcementInput {
  scope: HarnessPolicyScope;
  target?: string;
  path?: string;
  risk?: HarnessPolicyRisk;
  metadata?: Record<string, unknown>;
  approval?: HarnessPolicyApproval;
  approvalRole?: string;
}

export interface HarnessPolicyMatch {
  rule: HarnessPolicyRule;
  requiresApproval: boolean;
  blocked: boolean;
  approved: boolean;
}

export interface HarnessPolicyDecision {
  allowed: boolean;
  blocked: boolean;
  requiresApproval: boolean;
  reasons: string[];
  matchedRules: HarnessPolicyMatch[];
  policy: HarnessPolicyDocument;
}

export type HarnessPolicyEvaluationResult = HarnessPolicyDecision;

export interface CreateHarnessPolicyRuleInput {
  id: string;
  effect: HarnessPolicyEffect;
  target: HarnessPolicyTarget;
  pattern: string;
  approvalRole?: string;
  reason?: string;
}

export interface HarnessPolicyServiceOptions {
  repoPath: string;
}

export class HarnessPolicyBlockedError extends Error {
  constructor(
    message: string,
    public readonly decision: HarnessPolicyDecision
  ) {
    super(message);
    this.name = 'HarnessPolicyBlockedError';
  }
}

function normalizePath(input: string): string {
  return input.split(path.sep).join('/');
}

function escapeRegex(input: string): string {
  return input.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePath(pattern);
  const regex = normalized
    .split('**').join('__DOUBLE_STAR__')
    .split('*').join('__STAR__')
    .split('?').join('__QMARK__');
  const escaped = escapeRegex(regex)
    .replace(/__DOUBLE_STAR__/g, '.*')
    .replace(/__STAR__/g, '[^/]*')
    .replace(/__QMARK__/g, '.');

  return new RegExp(`^${escaped}$`, 'i');
}

function matchesAnyPattern(value: string, patterns: string[]): boolean {
  const normalizedValue = normalizePath(value);
  return patterns.some((pattern) => {
    if (pattern.includes('*') || pattern.includes('?')) {
      return globToRegExp(pattern).test(normalizedValue);
    }

    const normalizedPattern = normalizePath(pattern);
    return normalizedValue === normalizedPattern || normalizedValue.includes(normalizedPattern);
  });
}

function riskRank(risk: HarnessPolicyRisk): number {
  return {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  }[risk];
}

function compareRisk(inputRisk: HarnessPolicyRisk | undefined, ruleRisk: HarnessPolicyRisk | undefined): boolean {
  if (!ruleRisk) {
    return true;
  }
  if (!inputRisk) {
    return false;
  }
  return riskRank(inputRisk) >= riskRank(ruleRisk);
}

function normalizeRule(rule: HarnessPolicyRule): HarnessPolicyRule {
  if (rule.when) {
    return rule;
  }

  const selector: HarnessPolicyRuleSelector = {};
  if (rule.target === 'tool' && rule.pattern) {
    selector.tools = [rule.pattern];
  } else if (rule.target === 'action' && rule.pattern) {
    selector.actions = [rule.pattern];
  } else if (rule.target === 'path' && rule.pattern) {
    selector.paths = [rule.pattern];
  } else if (rule.target === 'risk' && rule.pattern) {
    selector.risk = rule.pattern as HarnessPolicyRisk;
  }

  return {
    ...rule,
    when: selector,
  };
}

function isLegacyEnforcementInput(
  input: HarnessPolicyEvaluationInput | HarnessPolicyLegacyEnforcementInput
): input is HarnessPolicyLegacyEnforcementInput {
  return (input as HarnessPolicyLegacyEnforcementInput).scope !== undefined;
}

export class HarnessPolicyService {
  constructor(private readonly options: HarnessPolicyServiceOptions) {}

  private get repoPath(): string {
    return path.resolve(this.options.repoPath);
  }

  private get policyPath(): string {
    return path.join(this.repoPath, '.context', 'harness', 'policy.json');
  }

  private toEvaluationInput(
    input: HarnessPolicyEvaluationInput | HarnessPolicyLegacyEnforcementInput
  ): HarnessPolicyEvaluationInput {
    if (!isLegacyEnforcementInput(input)) {
      return input;
    }

    return {
      tool: 'harness',
      action: input.target ?? input.scope,
      paths: input.path ? [input.path] : undefined,
      risk: input.risk,
      metadata: input.metadata,
      approval: input.approval,
      approvalRole: input.approvalRole,
    };
  }

  async loadPolicy(): Promise<HarnessPolicyDocument> {
    if (!(await fs.pathExists(this.policyPath))) {
      return {
        version: 1,
        defaultEffect: 'allow',
        rules: [],
      };
    }

    const loaded = await fs.readJson(this.policyPath) as Partial<HarnessPolicyDocument>;
    return {
      version: 1,
      defaultEffect: loaded.defaultEffect === 'deny' ? 'deny' : 'allow',
      rules: Array.isArray(loaded.rules) ? (loaded.rules as HarnessPolicyRule[]).map(normalizeRule) : [],
    };
  }

  async savePolicy(policy: HarnessPolicyDocument): Promise<HarnessPolicyDocument> {
    await fs.ensureDir(path.dirname(this.policyPath));
    const normalized: HarnessPolicyDocument = {
      version: 1,
      defaultEffect: policy.defaultEffect === 'deny' ? 'deny' : 'allow',
      rules: policy.rules.map(normalizeRule),
    };
    await fs.writeJson(this.policyPath, normalized, { spaces: 2 });
    return normalized;
  }

  async listRules(): Promise<HarnessPolicyRule[]> {
    const policy = await this.loadPolicy();
    return policy.rules.map(normalizeRule);
  }

  private evaluateWithPolicy(input: HarnessPolicyEvaluationInput, policy: HarnessPolicyDocument): HarnessPolicyDecision {
    const currentPolicy = policy ?? {
      version: 1,
      defaultEffect: 'allow',
      rules: [],
    };
    const matchedRules: HarnessPolicyMatch[] = [];
    const reasons: string[] = [];
    const tool = input.tool ?? 'harness';
    const paths = input.paths ?? (input.path ? [input.path] : []);

    for (const rawRule of currentPolicy.rules) {
      const rule = normalizeRule(rawRule);
      const selector = rule.when ?? {};
      const toolMatch = !selector.tools || selector.tools.length === 0
        ? true
        : matchesAnyPattern(tool, selector.tools);
      const actionMatch = !selector.actions || selector.actions.length === 0
        ? true
        : matchesAnyPattern(input.action, selector.actions);
      const pathMatch = !selector.paths || selector.paths.length === 0
        ? true
        : paths.some((value) => matchesAnyPattern(value, selector.paths!));
      const riskMatch = compareRisk(input.risk, selector.risk);

      if (!(toolMatch && actionMatch && pathMatch && riskMatch)) {
        continue;
      }

      const approvedByProvided = Boolean(input.approval?.approvedBy);
      const approvalRoleSatisfied = !rule.approvalRole || input.approvalRole === rule.approvalRole;
      const approved = approvedByProvided && approvalRoleSatisfied;
      const requiresApproval = rule.effect === 'require_approval' && !approved;
      const blocked = rule.effect === 'deny' || requiresApproval;

      matchedRules.push({
        rule,
        requiresApproval,
        blocked,
        approved,
      });

      if (rule.reason) {
        reasons.push(rule.reason);
      } else if (requiresApproval && rule.approvalRole) {
        reasons.push(`Policy rule ${rule.id} requires approval by role: ${rule.approvalRole}`);
      } else {
        reasons.push(`Policy rule matched: ${rule.id}`);
      }
    }

    const blocked = matchedRules.some((match) => match.blocked);
    const requiresApproval = matchedRules.some((match) => match.requiresApproval);
    const allowed = !blocked && (currentPolicy.defaultEffect === 'allow' || matchedRules.length > 0);

    if (!allowed && matchedRules.length === 0) {
      reasons.push(`Default policy effect is ${currentPolicy.defaultEffect}`);
    }

    return {
      allowed,
      blocked,
      requiresApproval,
      reasons,
      matchedRules,
      policy: currentPolicy,
    };
  }

  async evaluate(input: HarnessPolicyEvaluationInput, policy?: HarnessPolicyDocument): Promise<HarnessPolicyDecision> {
    const currentPolicy = policy ?? await this.loadPolicy();
    return this.evaluateWithPolicy(input, currentPolicy);
  }

  async evaluateAndAuthorize(
    input: HarnessPolicyEvaluationInput,
    policy?: HarnessPolicyDocument
  ): Promise<HarnessPolicyDecision> {
    const currentPolicy = policy ?? await this.loadPolicy();
    return this.evaluateWithPolicy(input, currentPolicy);
  }

  async authorize(
    input: HarnessPolicyEvaluationInput,
    policy?: HarnessPolicyDocument
  ): Promise<HarnessPolicyDecision> {
    const decision = await this.evaluateAndAuthorize(input, policy);
    if (decision.requiresApproval) {
      throw new HarnessPolicyBlockedError(
        `Policy approval required for ${(input.tool ?? 'harness')}.${input.action}`,
        decision
      );
    }
    if (decision.blocked || !decision.allowed) {
      throw new HarnessPolicyBlockedError(
        `Policy denied ${(input.tool ?? 'harness')}.${input.action}`,
        decision
      );
    }
    return decision;
  }

  async enforce(
    input: HarnessPolicyEvaluationInput | HarnessPolicyLegacyEnforcementInput,
    policy?: HarnessPolicyDocument
  ): Promise<HarnessPolicyDecision> {
    return this.authorize(this.toEvaluationInput(input), policy);
  }

  async setPolicyFromRules(input: {
    defaultEffect?: HarnessPolicyDefaultEffect;
    rules?: HarnessPolicyRule[];
  }): Promise<HarnessPolicyDocument> {
    return this.savePolicy({
      version: 1,
      defaultEffect: input.defaultEffect ?? 'allow',
      rules: (input.rules ?? []).map(normalizeRule),
    });
  }

  async setPolicy(policy: HarnessPolicyDocument): Promise<HarnessPolicyDocument> {
    return this.savePolicy({
      version: 1,
      defaultEffect: policy.defaultEffect,
      rules: policy.rules.map(normalizeRule),
    });
  }

  async setPolicyDocument(policy: HarnessPolicyDocument): Promise<HarnessPolicyDocument> {
    return this.setPolicy(policy);
  }

  async registerRule(input: CreateHarnessPolicyRuleInput): Promise<HarnessPolicyRule> {
    const policy = await this.loadPolicy();
    const rule: HarnessPolicyRule = {
      id: input.id,
      effect: input.effect,
      target: input.target,
      pattern: input.pattern,
      approvalRole: input.approvalRole,
      reason: input.reason,
    };
    policy.rules = policy.rules.filter((existing) => existing.id !== rule.id);
    policy.rules.push(rule);
    await this.savePolicy(policy);
    return normalizeRule(rule);
  }

  async evaluateLegacy(input: HarnessPolicyEvaluationInput): Promise<HarnessPolicyEvaluationResult> {
    return this.evaluate(input);
  }

  async assertAllowed(input: HarnessPolicyEvaluationInput): Promise<void> {
    await this.authorize(input);
  }

  async evaluatePolicy(input: HarnessPolicyEvaluationInput): Promise<HarnessPolicyEvaluationResult> {
    return this.evaluate(input);
  }

  async evaluateRule(input: HarnessPolicyEvaluationInput): Promise<HarnessPolicyEvaluationResult> {
    return this.evaluate(input);
  }

  async getPolicy(): Promise<HarnessPolicyDocument> {
    return this.loadPolicy();
  }

  createBootstrapPolicy(): HarnessPolicyDocument {
    return {
      version: 1,
      defaultEffect: 'allow',
      rules: [
        {
          id: 'protect-mcp-adapter',
          effect: 'require_approval',
          when: {
            paths: ['src/services/mcp/**', 'src/mcp/**'],
            risk: 'high',
          },
          reason: 'Changes to the MCP adapter or high-risk MCP operations require approval.',
        },
        {
          id: 'protect-workflow-core',
          effect: 'require_approval',
          when: {
            paths: ['src/services/workflow/**', 'src/workflow/**'],
            risk: 'high',
          },
          reason: 'Changes to workflow core require approval.',
        },
        {
          id: 'block-secrets',
          effect: 'deny',
          when: {
            paths: ['**/.env*', '**/*.pem', '**/*.key', '**/*secret*'],
          },
          reason: 'Secret-like files are blocked by policy.',
        },
      ],
    };
  }
}
