/**
 * Type definitions for scaffold structures
 */

import { ScaffoldFileType } from '../../../../../../../types/scaffoldFrontmatter';

/**
 * Content type for a section
 */
export type ScaffoldContentType =
  | 'prose'        // Paragraph text
  | 'list'         // Bullet/numbered list
  | 'code-block'   // Code snippet
  | 'table'        // Markdown table
  | 'checklist'    // Task list with checkboxes
  | 'diagram';     // Mermaid or ASCII diagram

/**
 * Tone for document generation
 */
export type ScaffoldTone =
  | 'technical'        // Precise, detailed technical language
  | 'conversational'   // Friendly, accessible
  | 'formal'           // Professional, structured
  | 'instructional';   // Step-by-step, directive

/**
 * Target audience
 */
export type ScaffoldAudience =
  | 'developers'   // Software engineers working on the codebase
  | 'ai-agents'    // AI assistants using the playbooks
  | 'architects'   // Technical leads and architects
  | 'mixed';       // Multiple audiences

/**
 * A section within a scaffold structure
 */
export interface ScaffoldSection {
  /** Section heading (H2 or H3) */
  heading: string;
  /** Display order (1-based) */
  order: number;
  /** What type of content this section should contain */
  contentType: ScaffoldContentType;
  /** Instructions for AI on what to include */
  guidance: string;
  /** Optional example of expected content */
  exampleContent?: string;
  /** Whether this section is required */
  required: boolean;
  /** Heading level (2 = H2, 3 = H3) */
  headingLevel?: 2 | 3;
  /** Static default content when not autoFilled. Provides useful template content that works for any project. */
  defaultContent?: string;
}

/**
 * Complete scaffold structure definition
 */
export interface ScaffoldStructure {
  /** File type */
  fileType: ScaffoldFileType;
  /** Document identifier (e.g., 'project-overview', 'code-reviewer') */
  documentName: string;
  /** Display title for the document */
  title: string;
  /** Brief description of document purpose */
  description: string;
  /** Writing tone */
  tone: ScaffoldTone;
  /** Target audience */
  audience: ScaffoldAudience;
  /** Ordered sections */
  sections: ScaffoldSection[];
  /** Related documents to cross-link */
  linkTo?: string[];
  /** Additional context for AI generation */
  additionalContext?: string;
}
