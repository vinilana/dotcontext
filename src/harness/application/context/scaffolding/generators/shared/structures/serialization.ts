/**
 * Serialization functions for scaffold structures
 */

import { ScaffoldStructure, ScaffoldSection } from './types';

/**
 * Serialize a scaffold structure to markdown content with section headings,
 * guidance comments, and example content.
 * Used for CLI mode to provide useful templates for manual filling.
 */
export function serializeStructureAsMarkdown(structure: ScaffoldStructure): string {
  const lines: string[] = [];

  const sortedSections = [...structure.sections].sort((a, b) => a.order - b.order);

  for (const section of sortedSections) {
    lines.push(formatSectionAsMarkdown(section));
    lines.push('');
  }

  // Add cross-references section if present
  if (structure.linkTo && structure.linkTo.length > 0) {
    lines.push('## Related Resources');
    lines.push('');
    lines.push('<!-- Link to related documents for cross-navigation. -->');
    lines.push('');
    for (const link of structure.linkTo) {
      lines.push(`- [${link}](./${link})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format a single section as markdown with heading, guidance, and example/placeholder content.
 */
function formatSectionAsMarkdown(section: ScaffoldSection): string {
  const lines: string[] = [];

  // Create heading with appropriate level
  const headingLevel = section.headingLevel || 2;
  const headingPrefix = '#'.repeat(headingLevel);
  lines.push(`${headingPrefix} ${section.heading}`);
  lines.push('');

  // Prefer defaultContent (static useful content) over guidance + placeholder
  if (section.defaultContent) {
    lines.push(section.defaultContent);
    return lines.join('\n');
  }

  // Add guidance as HTML comment
  lines.push(`<!-- ${section.guidance} -->`);
  lines.push('');

  // Add example content or placeholder based on content type
  if (section.exampleContent) {
    lines.push(section.exampleContent);
  } else {
    lines.push(getPlaceholderForContentType(section.contentType, section.required));
  }

  return lines.join('\n');
}

/**
 * Get appropriate placeholder text based on content type.
 */
function getPlaceholderForContentType(contentType: string, required: boolean): string {
  const requiredNote = required ? '' : ' (optional)';

  switch (contentType) {
    case 'prose':
      return `_Add descriptive content here${requiredNote}._`;
    case 'list':
      return `- _Item 1${requiredNote}_\n- _Item 2_\n- _Item 3_`;
    case 'code-block':
      return '```\n// Add code example here\n```';
    case 'table':
      return '| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| _value_ | _value_ | _value_ |';
    case 'checklist':
      return `- [ ] _Task 1${requiredNote}_\n- [ ] _Task 2_\n- [ ] _Task 3_`;
    case 'diagram':
      return '```mermaid\ngraph TD\n    A[Start] --> B[End]\n```';
    default:
      return `_Add content here${requiredNote}._`;
  }
}

/**
 * Serialize a scaffold structure to a readable format for AI context
 */
export function serializeStructureForAI(structure: ScaffoldStructure): string {
  const lines: string[] = [];

  lines.push(`# Document Structure: ${structure.title}`);
  lines.push('');
  lines.push(`**Type:** ${structure.fileType}`);
  lines.push(`**Tone:** ${structure.tone}`);
  lines.push(`**Audience:** ${structure.audience}`);
  lines.push(`**Description:** ${structure.description}`);

  if (structure.additionalContext) {
    lines.push(`**Additional Context:** ${structure.additionalContext}`);
  }

  lines.push('');
  lines.push('## Required Sections');
  lines.push('');

  const sortedSections = [...structure.sections].sort((a, b) => a.order - b.order);

  for (const section of sortedSections) {
    const requiredLabel = section.required ? '(REQUIRED)' : '(optional)';
    const level = section.headingLevel || 2;
    const headingPrefix = '#'.repeat(level);

    lines.push(`### ${section.order}. ${headingPrefix} ${section.heading} ${requiredLabel}`);
    lines.push(`- **Content Type:** ${section.contentType}`);
    lines.push(`- **Guidance:** ${section.guidance}`);

    if (section.exampleContent) {
      lines.push('- **Example:**');
      lines.push('```');
      lines.push(section.exampleContent);
      lines.push('```');
    }

    lines.push('');
  }

  if (structure.linkTo && structure.linkTo.length > 0) {
    lines.push('## Cross-References');
    lines.push('Link to these related documents where appropriate:');
    for (const link of structure.linkTo) {
      lines.push(`- ${link}`);
    }
  }

  return lines.join('\n');
}
