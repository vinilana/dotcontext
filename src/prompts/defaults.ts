export const UPDATE_SCAFFOLD_PROMPT_FALLBACK = `# Prompt: Update Repository Docs, Skills, and Agent Playbooks

## Purpose
You are an AI assistant responsible for refreshing documentation (\`docs/\`), skills (\`skills/\`), and agent playbooks (\`agents/\`). Your goal is to bring every guide up to date with the latest repository state and maintain cross-references.

## Context Gathering
1. Review the repository structure and recent changes.
2. Inspect \`package.json\`, CI configuration, and any release or roadmap notes.
3. Check \`docs/README.md\` for the current document map.

## Update Procedure
1. **Update Documentation (docs/)**
   - Replace TODO placeholders with accurate, current information.
   - Verify that links between docs remain valid.
   - If you add new guides or sections, update \`docs/README.md\`.

2. **Update Skills (skills/)**
   - Ensure each skill has codebase-specific activation rules and steps.
   - Add concrete command/examples using repository conventions.
   - Keep scope narrow and task-driven per skill.

3. **Agent Playbook Alignment (agents/)**
   - For each change in \`docs/\`, adjust the related \`agents/*.md\` playbooks.
   - Update responsibilities, best practices, and documentation touchpoints.

4. **Required Fill Order**
   - Fill files in this exact order: \`docs -> skills -> agents\`.

## Acceptance Criteria
- No unresolved TODO placeholders remain unless they require explicit human input.
- Skills contain concrete, codebase-specific instructions.
- Agent playbooks list accurate responsibilities and best practices.
- Changes are self-contained, well-formatted Markdown.

## Deliverables
- Updated Markdown files.
`;

/**
 * Prompt for AI agents to enhance scaffolding via MCP tools.
 * This prompt MUST be included in ALL scaffolding generation responses.
 */
export const MCP_SCAFFOLD_ENHANCEMENT_PROMPT = `# AI Enhancement Required

Your scaffolding has been generated but contains placeholder content that MUST be enhanced.

## Required Actions

1. **For each generated file**, call \`fillSingleFile\` to get:
   - Semantic context from the codebase
   - Scaffold structure with section guidance
   - Current file content to enhance

2. **Generate rich content** based on the context provided:
   - Replace ALL placeholders with accurate, codebase-specific information
   - Follow the tone and audience guidelines in the scaffold structure
   - Include cross-references to related docs/agents
   - Use concrete examples from the actual codebase

3. **Write the enhanced content** using the Write tool

## Quality Checklist

- [ ] No TODO placeholders remain
- [ ] All sections have concrete, actionable content
- [ ] Cross-references point to existing files
- [ ] Examples are drawn from actual codebase code
- [ ] Terminology matches project conventions

## Example Workflow

\`\`\`
1. context({ action: "listToFill" })           → Get list of files needing content
2. context({ action: "fillSingle", filePath }) → Get context for each file
3. Generate content based on semantic context
4. Write enhanced content to file
5. Repeat for all files
\`\`\`

DO NOT consider scaffolding complete until ALL files have been enhanced with codebase-specific content.
`;

export const UPDATE_PLAN_PROMPT_FALLBACK = `# Prompt: Update Collaboration Plans

## Purpose
You are an AI assistant responsible for refining collaboration plans. Each plan orchestrates work across documentation guides (\`docs/\`) and agent playbooks (\`agents/\`). Your goal is to replace TODOs with actionable guidance.

## Update Procedure
1. **Task Snapshot**
   - Summarize the primary goal and success signal in concrete terms.
   - List authoritative references (docs, issues, specs).

2. **Agent Alignment**
   - For each agent in the lineup, describe why they are involved.
   - Ensure playbook links match the referenced agent files.

3. **Documentation Touchpoints**
   - Map each plan stage to the docs excerpts provided.

4. **Working Phases**
   - Break the work into sequential phases with numbered steps and deliverables.
   - Reference documentation and agent resources for each phase.

5. **Evidence & Follow-up**
   - Specify artefacts to capture (PR links, test runs, change logs).
   - Record any follow-up actions.

## Acceptance Criteria
- TODOs are resolved with concrete information.
- Tables reference existing files.
- Phases provide actionable guidance.

## Deliverables
- Updated plan Markdown returned verbatim.
`;
