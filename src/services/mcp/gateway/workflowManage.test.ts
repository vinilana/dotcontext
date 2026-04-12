import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { handlePlan } from './plan';
import { handleWorkflowAdvance } from './workflowAdvance';
import { handleWorkflowInit } from './workflowInit';
import { handleWorkflowManage } from './workflowManage';
import { handleWorkflowStatus } from './workflowStatus';

function parseResponse(response: { content: Array<{ text: string }> }) {
  return JSON.parse(response.content[0].text);
}

describe('workflow MCP harness integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotcontext-mcp-workflow-'));
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'mcp-workflow-test',
      version: '1.0.0',
      scripts: {
        build: 'node -e "process.exit(0)"',
      },
    }, { spaces: 2 });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('exposes defineTask, recordArtifact, and runSensors through workflow-manage', async () => {
    await handleWorkflowInit({
      name: 'delta',
      scale: 'SMALL',
      autonomous: true,
      repoPath: tempDir,
    }, { repoPath: tempDir });

    const task = parseResponse(await handleWorkflowManage({
      action: 'defineTask',
      taskTitle: 'Implement delta',
      requiredSensors: ['build'],
      requiredArtifacts: ['handoff-summary'],
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    const artifact = parseResponse(await handleWorkflowManage({
      action: 'recordArtifact',
      name: 'handoff-summary',
      kind: 'text',
      content: 'ready',
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    const sensors = parseResponse(await handleWorkflowManage({
      action: 'runSensors',
      sensors: ['build'],
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    expect(task.success).toBe(true);
    expect(task.task.title).toBe('Implement delta');
    expect(artifact.success).toBe(true);
    expect(artifact.artifact.name).toBe('handoff-summary');
    expect(sensors.success).toBe(true);
    expect(sensors.backpressure.blocked).toBe(false);
  });

  it('returns structured harness blocking info from workflow-advance', async () => {
    await handleWorkflowInit({
      name: 'epsilon',
      scale: 'SMALL',
      autonomous: true,
      repoPath: tempDir,
    }, { repoPath: tempDir });

    await handleWorkflowManage({
      action: 'defineTask',
      taskTitle: 'Implement epsilon',
      requiredSensors: ['build'],
      requiredArtifacts: ['handoff-summary'],
      repoPath: tempDir,
    }, { repoPath: tempDir });

    const response = parseResponse(await handleWorkflowAdvance({
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    expect(response.success).toBe(false);
    expect(response.blockedBy).toBe('harness');
    expect(response.reasons).toContain('Missing required sensors: build');
    expect(response.reasons).toContain('Missing required artifacts: handoff-summary');
  });

  it('returns structured policy blocking info from workflow-manage and workflow-advance', async () => {
    await handleWorkflowInit({
      name: 'zeta',
      scale: 'SMALL',
      autonomous: true,
      repoPath: tempDir,
    }, { repoPath: tempDir });

    await fs.ensureDir(path.join(tempDir, '.context', 'harness'));
    await fs.writeJson(
      path.join(tempDir, '.context', 'harness', 'policy.json'),
      {
        version: 1,
        defaultEffect: 'allow',
        rules: [
          {
            id: 'deny-artifact-record',
            effect: 'deny',
            when: {
              tools: ['workflow'],
              actions: ['recordArtifact'],
            },
            reason: 'artifact writes blocked for test',
          },
          {
            id: 'deny-advance',
            effect: 'deny',
            when: {
              tools: ['workflow'],
              actions: ['advance'],
            },
            reason: 'advance blocked for test',
          },
        ],
      },
      { spaces: 2 }
    );

    const artifactResponse = parseResponse(await handleWorkflowManage({
      action: 'recordArtifact',
      name: 'handoff-summary',
      kind: 'text',
      content: 'ready',
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    const advanceResponse = parseResponse(await handleWorkflowAdvance({
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    expect(artifactResponse.success).toBe(false);
    expect(artifactResponse.blockedBy).toBe('policy');
    expect(artifactResponse.reasons).toContain('artifact writes blocked for test');

    expect(advanceResponse.success).toBe(false);
    expect(advanceResponse.blockedBy).toBe('policy');
    expect(advanceResponse.reasons).toContain('advance blocked for test');
  });

  it('persists plan approval metadata to the linked plan index and workflow state', async () => {
    await handleWorkflowInit({
      name: 'approval-persistence',
      scale: 'SMALL',
      autonomous: true,
      repoPath: tempDir,
    }, { repoPath: tempDir });

    await fs.ensureDir(path.join(tempDir, '.context', 'plans'));
    await fs.writeFile(
      path.join(tempDir, '.context', 'plans', 'core-plan.md'),
      '# Core Plan\n\n> Approval persistence test.\n',
      'utf-8'
    );

    const linkResponse = parseResponse(await handlePlan({
      action: 'link',
      planSlug: 'core-plan',
    }, { repoPath: tempDir }));

    expect(linkResponse.success).toBe(true);
    expect(linkResponse.workflowActive).toBe(true);
    expect(linkResponse.planCreatedForGates).toBe(true);

    const approveResponse = parseResponse(await handleWorkflowManage({
      action: 'approvePlan',
      planSlug: 'core-plan',
      approver: 'reviewer',
      notes: 'approved for execution',
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    expect(approveResponse.success).toBe(true);
    expect(approveResponse.plan.approval_status).toBe('approved');
    expect(approveResponse.plan.approved_by).toBe('reviewer');
    expect(approveResponse.plan.approved_at).toBeDefined();
    expect(approveResponse.approval.plan_approved).toBe(true);

    const plansIndex = await fs.readJson(path.join(tempDir, '.context', 'workflow', 'plans.json'));
    const persistedPlan = [...plansIndex.active, ...plansIndex.completed].find((plan: { slug: string }) => plan.slug === 'core-plan');
    expect(persistedPlan.approval_status).toBe('approved');
    expect(persistedPlan.approved_by).toBe('reviewer');
    expect(persistedPlan.approved_at).toBeDefined();

    const relinkResponse = parseResponse(await handlePlan({
      action: 'link',
      planSlug: 'core-plan',
    }, { repoPath: tempDir }));

    expect(relinkResponse.success).toBe(true);

    const relinkedPlansIndex = await fs.readJson(path.join(tempDir, '.context', 'workflow', 'plans.json'));
    const relinkedPlan = [...relinkedPlansIndex.active, ...relinkedPlansIndex.completed].find((plan: { slug: string }) => plan.slug === 'core-plan');
    expect(relinkedPlan.approval_status).toBe('approved');
    expect(relinkedPlan.approved_by).toBe('reviewer');
    expect(relinkedPlan.approved_at).toBeDefined();

    const workflowState = await fs.readJson(path.join(tempDir, '.context', 'harness', 'workflows', 'prevc.json'));
    expect(workflowState.status.approval.plan_approved).toBe(true);
    expect(workflowState.status.approval.approved_by).toBe('reviewer');
    expect(workflowState.status.approval.approved_at).toBeDefined();
  });

  it('bootstraps a task contract for the linked plan and rotates it on workflow advance', async () => {
    await handleWorkflowInit({
      name: 'bootstrap-rotation',
      scale: 'MEDIUM',
      autonomous: true,
      repoPath: tempDir,
    }, { repoPath: tempDir });

    await fs.ensureDir(path.join(tempDir, '.context', 'plans'));
    await fs.writeFile(
      path.join(tempDir, '.context', 'plans', 'bootstrap-rotation.md'),
      '# Bootstrap Rotation\n\n> Contract rotation regression.\n\n### Phase 1 - Discovery & Alignment\n1. Review the current system state\n2. Capture the phase bootstrap outputs\n\n### Phase 2 - Implementation\n1. Execute the implementation work\n',
      'utf-8'
    );

    const linkResponse = parseResponse(await handlePlan({
      action: 'link',
      planSlug: 'bootstrap-rotation',
    }, { repoPath: tempDir }));

    expect(linkResponse.success).toBe(true);
    expect(linkResponse.workflowActive).toBe(true);
    expect(linkResponse.planCreatedForGates).toBe(true);

    const beforeAdvance = parseResponse(await handleWorkflowStatus({
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    expect(beforeAdvance.success).toBe(true);
    expect(beforeAdvance.harness.binding.activeTaskId).toBeDefined();
    expect(beforeAdvance.harness.taskContracts).toHaveLength(1);

    const bootstrapTaskId = beforeAdvance.harness.binding.activeTaskId;
    expect(beforeAdvance.harness.taskContracts[0].id).toBe(bootstrapTaskId);
    expect(beforeAdvance.harness.taskContracts[0].status).toBe('ready');

    const advanceResponse = parseResponse(await handleWorkflowAdvance({
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    expect(advanceResponse.success).toBe(true);
    expect(advanceResponse.nextPhase.code).toBe('R');

    const afterAdvance = parseResponse(await handleWorkflowStatus({
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    expect(afterAdvance.success).toBe(true);
    expect(afterAdvance.currentPhase.code).toBe('R');
    expect(afterAdvance.harness.taskContracts).toHaveLength(2);
    expect(afterAdvance.harness.binding.activeTaskId).toBeDefined();
    expect(afterAdvance.harness.binding.activeTaskId).not.toBe(bootstrapTaskId);
    expect(afterAdvance.harness.taskContracts.find((task: { id: string; status: string }) => task.id === bootstrapTaskId)?.status).toBe('completed');
    expect(afterAdvance.harness.taskContracts.find((task: { id: string; status: string }) => task.id === afterAdvance.harness.binding.activeTaskId)?.status).toBe('ready');
  });

  it('instructs the caller to start workflow-init before relying on a linked plan', async () => {
    await fs.ensureDir(path.join(tempDir, '.context', 'plans'));
    await fs.writeFile(
      path.join(tempDir, '.context', 'plans', 'standalone-plan.md'),
      '# Standalone Plan\n\n> Created before workflow initialization.\n',
      'utf-8'
    );

    const linkResponse = parseResponse(await handlePlan({
      action: 'link',
      planSlug: 'standalone-plan',
    }, { repoPath: tempDir }));

    expect(linkResponse.success).toBe(true);
    expect(linkResponse.workflowActive).toBe(false);
    expect(linkResponse.planCreatedForGates).toBe(false);
    expect(linkResponse.enhancementPrompt).toContain('workflow-init({ name: "standalone-plan" })');
    expect(linkResponse.enhancementPrompt).toContain('Call plan({ action: "link", planSlug: "standalone-plan" }) again');
    expect(linkResponse.workflowStatePath).toContain('.context/harness/workflows/prevc.json');
    expect(linkResponse.nextSteps).toContain(
      'REQUIRED: Call workflow-init({ name: "standalone-plan" }) to start the harness-backed PREVC workflow'
    );
  });

  it('rejects approval when the requested plan slug diverges from the linked workflow plan', async () => {
    await handleWorkflowInit({
      name: 'approval-mismatch',
      scale: 'SMALL',
      autonomous: true,
      repoPath: tempDir,
    }, { repoPath: tempDir });

    await fs.ensureDir(path.join(tempDir, '.context', 'plans'));
    await fs.writeFile(
      path.join(tempDir, '.context', 'plans', 'primary-plan.md'),
      '# Primary Plan\n\n> Canonical workflow plan.\n',
      'utf-8'
    );
    await fs.writeFile(
      path.join(tempDir, '.context', 'plans', 'other-plan.md'),
      '# Other Plan\n\n> Divergent plan.\n',
      'utf-8'
    );

    const linkResponse = parseResponse(await handlePlan({
      action: 'link',
      planSlug: 'primary-plan',
    }, { repoPath: tempDir }));

    expect(linkResponse.success).toBe(true);

    const approveResponse = parseResponse(await handleWorkflowManage({
      action: 'approvePlan',
      planSlug: 'other-plan',
      approver: 'reviewer',
      repoPath: tempDir,
    }, { repoPath: tempDir }));

    expect(approveResponse.success).toBe(false);
    expect(approveResponse.error).toContain('Plan slug mismatch');
  });
});
