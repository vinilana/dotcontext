# Prompt: Start PREVC from a GitHub Issue

## Purpose
You are an AI coding assistant starting structured dotcontext PREVC work from a GitHub issue. Your goal is to turn the live issue into a reviewable plan, initialize or prepare the dotcontext workflow, define validation evidence, and stop before implementation unless the user explicitly approves execution.

## Inputs
- GitHub issue reference, such as `#108`, `owner/repo#108`, or a GitHub issue URL.
- Repository path or current working directory.
- Optional workflow name, branch name, milestone, or target PR.

## Preparation Checklist
1. Confirm the repository path, current branch, working tree state, and target base branch.
2. Read repository instructions first, including `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`, and relevant project docs.
3. Fetch the live GitHub issue body, labels, comments, linked PRs, acceptance criteria, and blockers.
4. Inspect nearby code, tests, scripts, CI, and docs only enough to scope the work and identify validation sensors.
5. Check whether `.context/` exists and whether an active PREVC workflow is already running.

## Workflow Procedure
1. **Issue Snapshot**
   - Summarize the issue goal, user impact, acceptance criteria, and explicit non-goals.
   - Note the live issue URL and any linked PRs or blockers.

2. **Context Readiness**
   - If `.context/` is missing, prepare the context initialization steps.
   - If `.context/` exists, run or request a context readiness check.
   - Identify canonical docs, architecture notes, and repo-specific workflow rules.

3. **PREVC Setup**
   - Choose a concise workflow name derived from the issue.
   - Select an appropriate scale: `QUICK`, `SMALL`, `MEDIUM`, or `LARGE`.
   - Start or prepare a PREVC workflow for non-trivial work.
   - Do not advance beyond planning until the plan is reviewable.

4. **Plan Scaffold**
   - Create or update a plan under `.context/plans/`.
   - Link the plan to the issue, workflow, branch, target base, and acceptance criteria.
   - Break the work into PREVC-aligned phases with clear deliverables.
   - Keep scope limited to the issue unless dependencies force a follow-up.

5. **Sensors and Evidence**
   - Identify concrete validation commands from the repository, such as tests, typecheck, lint, build, smoke checks, screenshots, or deployment checks.
   - Record required artifacts: PR link, test output, screenshots, logs, docs updates, migration notes, or release notes.
   - Mark any unavailable sensor as blocked with the reason and a substitute evidence path.

6. **Handoff**
   - Produce a concise handoff that a human or another agent can review before execution.
   - Include unresolved questions only when they block a correct implementation.
   - Ask for approval before coding if the repository policy requires it.

## Output Format
Return Markdown with these sections:

```markdown
## Issue
- Reference:
- Goal:
- Acceptance:
- Non-goals:

## Workflow
- Name:
- Scale:
- Current phase:
- Plan file:
- Base branch:
- Work branch:

## Scope
- In:
- Out:
- Risks:
- Dependencies:

## Sensors
- Command:
- Command:

## Evidence
- Artifact:
- Artifact:

## Unresolved Questions
- Question or `None`.

## Next Prompt
Paste-ready prompt for the next agent turn.
```

## Acceptance Criteria
- The issue is based on live GitHub state, not stale local memory.
- Repository instructions and relevant docs are reflected in the plan.
- The PREVC workflow is initialized or the exact initialization step is documented.
- The plan has clear scope, sensors, evidence, risks, and review gates.
- No implementation changes are made unless the user explicitly approves execution.
