import type { WorkflowGuideFormat, WorkflowGuideResult } from './workflowGuideTypes';

const COMPACT_SKILL_LIMIT = 3;
const COMPACT_STEP_LIMIT = 5;

function formatSkillsSection(
  skills: WorkflowGuideResult['skills'],
  format: WorkflowGuideFormat
): string {
  if (skills.length === 0) {
    return '';
  }

  const limit = format === 'compact' ? COMPACT_SKILL_LIMIT : skills.length;
  const lines = skills.slice(0, limit).map(
    (skill) => `- ${skill.slug}: ${skill.description}`
  );

  if (format === 'compact' && skills.length > limit) {
    lines.push(`- …and ${skills.length - limit} more (use skill list or workflow guide full)`);
  }

  return `\nSkills:\n${lines.join('\n')}`;
}

function formatStepsSection(
  nextSteps: string[],
  format: WorkflowGuideFormat
): string {
  if (nextSteps.length === 0) {
    return '';
  }

  const limit = format === 'compact' ? COMPACT_STEP_LIMIT : nextSteps.length;
  const lines = nextSteps.slice(0, limit).map((step, index) => `${index + 1}. ${step}`);

  return `\nNext steps:\n${lines.join('\n')}`;
}

/**
 * Render adapter-neutral workflow guidance text from harness output.
 */
export function formatWorkflowGuideExcerpt(
  guidance: WorkflowGuideResult,
  format: WorkflowGuideFormat = 'compact'
): string {
  const lines: string[] = ['dotcontext workflow guide:'];

  if (!guidance.context.initialized) {
    lines.push('No .context/ — run context init after MCP install.');
    return lines.join('\n') + formatStepsSection(guidance.nextSteps, format);
  }

  if (!guidance.workflow.active) {
    lines.push('No active PREVC workflow. Use workflow-init for planned work; skip for trivial edits.');
  } else {
    const phase = guidance.workflow.phase ?? '?';
    const name = guidance.workflow.name ? `"${guidance.workflow.name}"` : 'active';
    const scale = guidance.workflow.scale ? ` (${guidance.workflow.scale})` : '';
    lines.push(`Workflow ${name} — phase ${phase}${scale}.`);
  }

  if (guidance.decision.reason && format === 'full') {
    lines.push(`Decision: ${guidance.decision.reason}`);
  }

  return lines.join('\n')
    + formatStepsSection(guidance.nextSteps, format)
    + formatSkillsSection(guidance.skills, format);
}
