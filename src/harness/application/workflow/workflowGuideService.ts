import * as fs from 'fs-extra';
import * as path from 'path';

import {
  createSkillRegistry,
  META_SKILL_SLUGS,
  PHASE_META_SKILL,
} from '../../domain/workflow/skills';
import { WorkflowGuidanceService } from '../../domain/workflow/orchestration/workflowGuidanceService';
import { getScaleName } from '../../domain/workflow/scaling';
import type { PrevcPhase, ProjectScale } from '../../domain/workflow';

import { formatWorkflowGuideExcerpt } from './formatWorkflowGuideExcerpt';
import type {
  HarnessWorkflowGuideInput,
  WorkflowGuideDecision,
  WorkflowGuideResult,
  WorkflowGuideSkillRef,
} from './workflowGuideTypes';
import { WorkflowService } from './workflowService';

export interface WorkflowGuideServiceOptions {
  repoPath: string;
}

export class WorkflowGuideService {
  constructor(private readonly options: WorkflowGuideServiceOptions) {}

  async guide(params: HarnessWorkflowGuideInput = {}): Promise<WorkflowGuideResult> {
    const repoPath = path.resolve(params.repoPath ?? this.options.repoPath);
    const format = params.format ?? resolveGuideFormat();
    const intent = params.intent ?? 'explicit';
    const contextPath = path.join(repoPath, '.context');
    const contextInitialized = await fs.pathExists(contextPath);

    const contextState = await this.resolveContextState(repoPath, contextInitialized);
    const workflowService = await WorkflowService.create(repoPath);
    const hasWorkflow = contextInitialized && await workflowService.hasWorkflow();

    if (!hasWorkflow) {
      const result = this.buildInactiveWorkflowGuide({
        contextState,
        intent,
        format,
      });
      return result;
    }

    const summary = await workflowService.getSummary();
    const phase = params.phaseHint ?? summary.currentPhase;
    const domainGuidance = new WorkflowGuidanceService(repoPath);
    const orchestration = await domainGuidance.getPhaseOrchestration(phase);
    const recommendedActions = domainGuidance.getRecommendedActions(
      await workflowService.getStatus()
    );
    const settings = await workflowService.getSettings();

    const skills = await this.resolveSkills(repoPath, phase);
    const nextSteps = this.buildActiveNextSteps({
      intent,
      phase,
      orchestrationSteps: orchestration.orchestrationSteps ?? [],
      recommendedActions,
      settings,
    });
    const decision = this.buildDecision({ hasWorkflow: true, settings, phase, intent });

    const result: WorkflowGuideResult = {
      workflow: {
        active: true,
        name: summary.name,
        phase,
        scale: getScaleName(summary.scale as ProjectScale),
      },
      context: contextState,
      nextSteps,
      skills,
      decision,
      excerpt: '',
    };

    result.excerpt = formatWorkflowGuideExcerpt(result, format);
    return result;
  }

  private async resolveContextState(
    repoPath: string,
    contextInitialized: boolean
  ): Promise<WorkflowGuideResult['context']> {
    if (!contextInitialized) {
      return { initialized: false };
    }

    const enabled: string[] = [];
    for (const key of ['docs', 'agents', 'skills', 'plans', 'workflow', 'harness'] as const) {
      const target = path.join(repoPath, '.context', key === 'workflow' ? 'workflow' : key);
      if (await fs.pathExists(target)) {
        enabled.push(key);
      }
    }

    return {
      initialized: true,
      enabled: enabled.length > 0 ? enabled : undefined,
    };
  }

  private buildInactiveWorkflowGuide(input: {
    contextState: WorkflowGuideResult['context'];
    intent: HarnessWorkflowGuideInput['intent'];
    format: HarnessWorkflowGuideInput['format'];
  }): WorkflowGuideResult {
    const nextSteps: string[] = [];

    if (!input.contextState.initialized) {
      nextSteps.push('Install dotcontext MCP and run context init to scaffold .context/');
    } else {
      nextSteps.push('Use workflow-init when starting non-trivial planned work');
      nextSteps.push('Skip workflow-init for trivial edits (typos, single-line fixes)');
    }

    if (input.intent === 'session_end') {
      nextSteps.push('Capture outputs and notes before ending the session');
    }

    const skills: WorkflowGuideSkillRef[] = META_SKILL_SLUGS.map((slug) => ({
      slug,
      name: slug,
      description: slug === 'dotcontext-workflow'
        ? 'PREVC workflow operation across any adapter'
        : 'When to use harness workflow and adapter actions',
      isBuiltIn: true,
    }));

    const result: WorkflowGuideResult = {
      workflow: { active: false },
      context: input.contextState,
      nextSteps,
      skills,
      decision: { allow: true },
      excerpt: '',
    };

    result.excerpt = formatWorkflowGuideExcerpt(result, input.format ?? 'compact');
    return result;
  }

  private async resolveSkills(
    repoPath: string,
    phase: PrevcPhase
  ): Promise<WorkflowGuideSkillRef[]> {
    const registry = createSkillRegistry(repoPath);
    const phaseSkills = await registry.getSkillsForPhase(phase);
    const bySlug = new Map<string, WorkflowGuideSkillRef>();

    for (const slug of META_SKILL_SLUGS) {
      bySlug.set(slug, {
        slug,
        name: slug,
        description: slug === 'dotcontext-workflow'
          ? 'PREVC workflow operation across any adapter'
          : 'When to use harness workflow and adapter actions',
        isBuiltIn: true,
      });
    }

    const phaseMeta = PHASE_META_SKILL[phase];
    bySlug.set(phaseMeta, {
      slug: phaseMeta,
      name: phaseMeta,
      description: `PREVC phase ${phase} checklist`,
      isBuiltIn: true,
    });

    for (const skill of phaseSkills) {
      bySlug.set(skill.slug, {
        slug: skill.slug,
        name: skill.metadata.name,
        description: skill.metadata.description,
        path: skill.path,
        isBuiltIn: skill.isBuiltIn,
      });
    }

    return [...bySlug.values()];
  }

  private buildActiveNextSteps(input: {
    intent: HarnessWorkflowGuideInput['intent'];
    phase: PrevcPhase;
    orchestrationSteps: string[];
    recommendedActions: string[];
    settings: { require_plan?: boolean; require_approval?: boolean; autonomous_mode?: boolean };
  }): string[] {
    const steps = [...input.orchestrationSteps];

    for (const action of input.recommendedActions.slice(0, 3)) {
      if (!steps.includes(action)) {
        steps.push(action);
      }
    }

    if (input.intent === 'session_start') {
      steps.unshift(`Confirm workflow "${input.phase}" phase goals before editing`);
    }

    if (input.intent === 'session_end') {
      steps.push('Call workflow-advance when phase deliverables are complete');
    }

    if (input.settings.require_plan && input.phase === 'P') {
      steps.push('Link a plan with plan link before advancing P → R');
    }

    if (input.settings.require_approval && input.phase === 'R') {
      steps.push('Approve linked plan with workflow-manage approvePlan before R → E');
    }

    return steps;
  }

  private buildDecision(input: {
    hasWorkflow: boolean;
    settings: { autonomous_mode?: boolean };
    phase: PrevcPhase;
    intent: HarnessWorkflowGuideInput['intent'];
  }): WorkflowGuideDecision {
    if (input.settings.autonomous_mode) {
      return { allow: true, reason: 'Autonomous mode — gates bypassed' };
    }

    return {
      allow: true,
      requires: input.hasWorkflow ? [`phase:${input.phase}`] : ['workflow-init'],
    };
  }
}

function resolveGuideFormat(): 'compact' | 'full' {
  const value = process.env.DOTCONTEXT_WORKFLOW_GUIDE?.trim().toLowerCase();
  return value === 'full' ? 'full' : 'compact';
}
