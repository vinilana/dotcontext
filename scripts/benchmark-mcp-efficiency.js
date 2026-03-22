#!/usr/bin/env node

const os = require('os');
const path = require('path');
const fs = require('fs-extra');

const { handleWorkflowInit } = require('../dist/services/mcp/gateway/workflowInit');
const { handleWorkflowStatus } = require('../dist/services/mcp/gateway/workflowStatus');
const { handleWorkflowAdvance } = require('../dist/services/mcp/gateway/workflowAdvance');
const { getCodebaseMapTool } = require('../dist/services/ai/tools/getCodebaseMapTool');
const { scaffoldPlanTool } = require('../dist/services/ai/tools/scaffoldPlanTool');

const OUTPUT_DIR = path.resolve(process.cwd(), 'docs', 'benchmarks', 'mcp-token-efficiency');
const PROFILE_TOOL_COUNTS = {
  standalone: 10,
  planning: 9,
  execution: 6,
};

const NON_MCP_FIXTURES = {
  planning: [
    'Analyze this repository manually and produce a full implementation plan for improving MCP token efficiency.',
    'Because you do not have MCP tools, do the equivalent of codebase discovery inline: infer architecture layers, likely hot-path files, workflow entry points, and planning touchpoints.',
    'Write a plan that includes: goal, scope included, scope excluded, baseline assumptions, execution risks, rollout strategy, compatibility strategy, and measurable success criteria.',
    'Break the work into PREVC-style phases and, for each phase, include: objective, concrete steps, primary owner/agent role, expected deliverables, verification evidence, and a commit checkpoint.',
    'Also include documentation updates, benchmark methodology, test strategy, migration guidance, and follow-up backlog items.',
    'Assume the client needs all instructions inline, including how to scaffold the plan, how to fill missing context manually, and how to keep compact and verbose compatibility paths available.',
    'Please include a detailed agent lineup covering architect, feature developer, performance optimizer, test writer, documentation writer, and code reviewer, and explain the first responsibility focus for each one.',
    'For the benchmark methodology, compare current MCP, optimized MCP, and a non-MCP manual workflow for both planning and execution. Define the scenario matrix, the exact prompts or commands to use, how payload size is measured, and how estimated tokens are calculated.',
    'For documentation, specify updates to the top-level README, the MCP service README, workflow guidance, and any rollout or migration notes that explain profiles, compact defaults, verbose compatibility, and benchmark evidence.',
    'For the planning deliverable, include explicit instructions for how a manual user without MCP would gather architecture context, inspect code, enumerate workflow tools, and keep track of phase state without cached bundles or status revisions.',
    'Make the plan self-contained and execution-ready so another engineer can follow it without any additional resources, hidden context, or MCP-specific helper surfaces.',
  ].join(' '),
  execution: [
    'Current workflow state is not available through MCP. Reconstruct it from the description below and then provide the full next-step guidance inline.',
    'Summarize the current PREVC phase, overall progress, whether the workflow can advance, which gates might block advancement, and what approval or plan-link requirements still apply.',
    'List the next agent to start with, the recommended agent sequence for the current phase, relevant documents to read first, useful skills to load, and the safest way to hand off work.',
    'Then explain how to advance to the next phase, what artifacts should be produced before advancing, and what a fallback path looks like if the workflow is blocked.',
    'Assume there is no cached bundle, no workflow help resource, and no dedicated status endpoint, so include the operational guidance, examples, and cautions inline in the response.',
    'Include examples of the manual commands or notes the engineer should keep for state tracking: current phase, completed phases, remaining phases, active agent, pending approvals, linked plan status, and produced artifacts.',
    'Explain which documents to consult for the current phase, why they matter, and what a reviewer should verify before the workflow advances. Also note which skills or playbooks would normally be suggested by the system and summarize them inline.',
    'Provide concrete examples of handoff messages, approval checks, and phase-completion evidence so the execution guidance can be followed without any machine-generated bundle, compact delta response, or not-modified polling support.',
    'Make the answer complete enough that the user does not need to ask a second question to know the next action, the fallback path, or the compatibility implications of enabling autonomous mode or bypassing gates.',
  ].join(' '),
};

function parseResponse(response) {
  return JSON.parse(response.content[0].text);
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function payloadStats(label, payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    label,
    bytes: Buffer.byteLength(text, 'utf8'),
    chars: text.length,
    estimatedTokens: estimateTokens(text),
    payload,
  };
}

function percentDelta(next, prev) {
  if (prev === 0) {
    return 0;
  }

  return Number((((next - prev) / prev) * 100).toFixed(1));
}

function formatPercent(next, prev) {
  const delta = percentDelta(next, prev);
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
}

async function createFixtureRepo(prefix) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.ensureDir(path.join(tempDir, '.context', 'docs'));
  await fs.ensureDir(path.join(tempDir, 'src'));
  await fs.writeJson(
    path.join(tempDir, 'package.json'),
    {
      name: 'mcp-benchmark-fixture',
      version: '1.0.0',
    },
    { spaces: 2 }
  );
  await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), 'export const fixture = true;\n');
  await fs.writeJson(
    path.join(tempDir, '.context', 'docs', 'codebase-map.json'),
    {
      stack: { runtime: 'node', language: 'typescript' },
      structure: { root: ['src', '.context'] },
      architecture: {
        layers: [
          { name: 'CLI', directories: ['src'], dependsOn: ['services'] },
          { name: 'MCP', directories: ['src/services/mcp'], dependsOn: ['workflow'] },
        ],
      },
      symbols: {
        classes: [],
        interfaces: [],
        functions: [],
        types: [],
        enums: [],
      },
      publicAPI: [],
      dependencies: [],
      stats: { files: 2 },
      keyFiles: [],
      navigation: {},
    },
    { spaces: 2 }
  );

  return tempDir;
}

async function measureExecution(repoPath) {
  const compactInit = parseResponse(
    await handleWorkflowInit(
      { name: 'benchmark-execution', scale: 'MEDIUM', autonomous: true },
      { repoPath }
    )
  );
  const legacyInit = parseResponse(
    await handleWorkflowInit(
      {
        name: 'benchmark-execution-legacy',
        scale: 'MEDIUM',
        autonomous: true,
        includeLegacy: true,
        verbose: true,
        archive_previous: true,
      },
      { repoPath }
    )
  );
  const compactStatus = parseResponse(await handleWorkflowStatus({}, { repoPath }));
  const notModifiedStatus = parseResponse(
    await handleWorkflowStatus(
      { revision: compactStatus.revision },
      { repoPath }
    )
  );
  const legacyStatus = parseResponse(
    await handleWorkflowStatus(
      { includeLegacy: true, verbose: true, includeOrchestration: true },
      { repoPath }
    )
  );
  const compactAdvance = parseResponse(await handleWorkflowAdvance({}, { repoPath }));
  const legacyAdvance = parseResponse(
    await handleWorkflowAdvance(
      { includeLegacy: true, verbose: true },
      { repoPath }
    )
  );

  return {
    compact: [
      payloadStats('workflow-init', compactInit),
      payloadStats('workflow-status', compactStatus),
      payloadStats('workflow-advance', compactAdvance),
    ],
    legacy: [
      payloadStats('workflow-init', legacyInit),
      payloadStats('workflow-status', legacyStatus),
      payloadStats('workflow-advance', legacyAdvance),
    ],
    polling: payloadStats('workflow-status', notModifiedStatus),
    nonMcp: payloadStats('non-mcp-execution', NON_MCP_FIXTURES.execution),
  };
}

async function measurePlanning(repoPath) {
  const compactMap = await getCodebaseMapTool.execute(
    { repoPath },
    { toolCallId: '', messages: [] }
  );
  const legacyMap = await getCodebaseMapTool.execute(
    { repoPath, section: 'all' },
    { toolCallId: '', messages: [] }
  );
  const compactPlan = await scaffoldPlanTool.execute(
    { planName: 'compact-plan', repoPath },
    { toolCallId: '', messages: [] }
  );
  const legacyPlan = await scaffoldPlanTool.execute(
    {
      planName: 'legacy-plan',
      repoPath,
      includeContent: true,
      includeInstructions: true,
    },
    { toolCallId: '', messages: [] }
  );

  return {
    compact: [
      payloadStats('getCodebaseMap', compactMap),
      payloadStats('scaffoldPlan', compactPlan),
    ],
    legacy: [
      payloadStats('getCodebaseMap', legacyMap),
      payloadStats('scaffoldPlan', legacyPlan),
    ],
    nonMcp: payloadStats('non-mcp-planning', NON_MCP_FIXTURES.planning),
  };
}

function summarizeScenario(scenario) {
  const compactTokens = scenario.compact.reduce((sum, item) => sum + item.estimatedTokens, 0);
  const legacyTokens = scenario.legacy.reduce((sum, item) => sum + item.estimatedTokens, 0);
  const nonMcpTokens = scenario.nonMcp.estimatedTokens;

  return {
    compactTokens,
    legacyTokens,
    nonMcpTokens,
    compactVsLegacyPct: percentDelta(compactTokens, legacyTokens),
    compactVsNonMcpPct: percentDelta(compactTokens, nonMcpTokens),
  };
}

function renderMarkdown(summary) {
  const payloadRows = [];
  const planningBaseline = Object.fromEntries(summary.planning.legacy.map((entry) => [entry.label, entry]));
  const executionBaseline = Object.fromEntries(summary.execution.legacy.map((entry) => [entry.label, entry]));

  for (const entry of summary.planning.compact) {
    payloadRows.push(`| ${entry.label} | compact | ${entry.bytes} | ${entry.chars} | ${entry.estimatedTokens} | ${formatPercent(entry.estimatedTokens, planningBaseline[entry.label].estimatedTokens)} |`);
  }
  for (const entry of summary.planning.legacy) {
    payloadRows.push(`| ${entry.label} | legacy | ${entry.bytes} | ${entry.chars} | ${entry.estimatedTokens} | baseline |`);
  }
  for (const entry of summary.execution.compact) {
    payloadRows.push(`| ${entry.label} | compact | ${entry.bytes} | ${entry.chars} | ${entry.estimatedTokens} | ${formatPercent(entry.estimatedTokens, executionBaseline[entry.label].estimatedTokens)} |`);
  }
  payloadRows.push(
    `| workflow-status | notModified | ${summary.execution.polling.bytes} | ${summary.execution.polling.chars} | ${summary.execution.polling.estimatedTokens} | ${formatPercent(summary.execution.polling.estimatedTokens, executionBaseline['workflow-status'].estimatedTokens)} |`
  );
  for (const entry of summary.execution.legacy) {
    payloadRows.push(`| ${entry.label} | legacy | ${entry.bytes} | ${entry.chars} | ${entry.estimatedTokens} | baseline |`);
  }

  return [
    '# MCP Token Efficiency Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Scenario Summary',
    '',
    '| Scenario | Current MCP (legacy) | Optimized MCP (compact) | Non-MCP fixture | Compact vs legacy | Compact vs non-MCP |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    `| Planning | ${summary.planningSummary.legacyTokens} | ${summary.planningSummary.compactTokens} | ${summary.planningSummary.nonMcpTokens} | ${summary.planningSummary.compactVsLegacyPct.toFixed(1)}% | ${summary.planningSummary.compactVsNonMcpPct.toFixed(1)}% |`,
    `| Workflow loop | ${summary.executionSummary.legacyTokens} | ${summary.executionSummary.compactTokens} | ${summary.executionSummary.nonMcpTokens} | ${summary.executionSummary.compactVsLegacyPct.toFixed(1)}% | ${summary.executionSummary.compactVsNonMcpPct.toFixed(1)}% |`,
    '',
    '## Tool Surface',
    '',
    '| Profile | Registered tools | Notes |',
    '| --- | ---: | --- |',
    `| \`standalone\` | ${PROFILE_TOOL_COUNTS.standalone} | Full onboarding, planning, sync, workflow, and skills surface |`,
    `| \`planning\` | ${PROFILE_TOOL_COUNTS.planning} | Drops \`sync\` but keeps planning and orchestration tools |`,
    `| \`execution\` | ${PROFILE_TOOL_COUNTS.execution} | Keeps the hot path: workflow tools, \`plan\`, and \`explore\` |`,
    '',
    '## Payload Benchmarks',
    '',
    '| Payload | Mode | Bytes | Chars | Est. tokens | Delta vs legacy |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
    ...payloadRows,
    '',
    '## Raw Payload Examples',
    '',
    '- Compact and legacy payload examples are written to `docs/benchmarks/mcp-token-efficiency/`.',
    '- `notModified-workflow-status.json` captures the cached polling path when a client sends the current `revision`.',
    '- The non-MCP baseline remains a checked-in prompt fixture so the comparison stays repeatable without external tooling.',
  ].join('\n');
}

async function writePayloadExamples(rootDir, prefix, entries) {
  for (const entry of entries) {
    await fs.writeJson(path.join(rootDir, `${prefix}-${entry.label}.json`), entry.payload, { spaces: 2 });
  }
}

async function main() {
  const planningRepo = await createFixtureRepo('planning-benchmark-');
  const executionRepo = await createFixtureRepo('execution-benchmark-');

  try {
    const [planning, execution] = await Promise.all([
      measurePlanning(planningRepo),
      measureExecution(executionRepo),
    ]);

    const summary = {
      planning,
      execution,
      profileToolCounts: PROFILE_TOOL_COUNTS,
      planningSummary: summarizeScenario(planning),
      executionSummary: summarizeScenario(execution),
    };

    await fs.ensureDir(OUTPUT_DIR);
    await writePayloadExamples(OUTPUT_DIR, 'compact', [
      ...planning.compact,
      ...execution.compact,
    ]);
    await writePayloadExamples(OUTPUT_DIR, 'legacy', [
      ...planning.legacy,
      ...execution.legacy,
    ]);
    await fs.writeJson(
      path.join(OUTPUT_DIR, 'notModified-workflow-status.json'),
      execution.polling.payload,
      { spaces: 2 }
    );
    await fs.writeJson(path.join(OUTPUT_DIR, 'summary.json'), summary, { spaces: 2 });

    const markdown = renderMarkdown(summary);
    await fs.writeFile(path.join(OUTPUT_DIR, 'README.md'), markdown);
    process.stdout.write(`${markdown}\n`);
  } finally {
    await fs.remove(planningRepo);
    await fs.remove(executionRepo);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
