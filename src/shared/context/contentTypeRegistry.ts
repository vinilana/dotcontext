/**
 * Content Type Registry
 *
 * Extensible registry for managing different content types in .context/
 * This enables easy addition of new content types (prompts, workflows, etc.)
 * without modifying core export/import logic.
 */

/**
 * Content type definition
 */
export interface ContentType {
  /** Unique identifier (e.g., 'docs', 'agents', 'skills') */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** Path relative to .context/ */
  contextPath: string;
  /** File pattern for discovery (glob pattern) */
  filePattern: string;
  /** Index file name (e.g., 'README.md' for docs) */
  indexFile?: string;
  /** Description of this content type */
  description: string;
  /** Whether this content type supports export */
  supportsExport: boolean;
  /** Whether this content type supports import */
  supportsImport: boolean;
}

/**
 * Registry of all content types
 */
export const CONTENT_TYPE_REGISTRY: ContentType[] = [
  {
    id: 'docs',
    displayName: 'Documentation',
    contextPath: '.context/docs',
    filePattern: '**/*.md',
    indexFile: 'README.md',
    description: 'Project documentation, rules, and guidelines',
    supportsExport: true,
    supportsImport: true,
  },
  {
    id: 'agents',
    displayName: 'Agents',
    contextPath: '.context/agents',
    filePattern: '**/*.md',
    description: 'AI agent playbooks and configurations',
    supportsExport: true,
    supportsImport: true,
  },
  {
    id: 'skills',
    displayName: 'Skills',
    contextPath: '.context/skills',
    filePattern: '**/SKILL.md',
    description: 'On-demand expertise and task-specific instructions',
    supportsExport: true,
    supportsImport: true,
  },
  {
    id: 'plans',
    displayName: 'Plans',
    contextPath: '.context/plans',
    filePattern: '**/*.md',
    description: 'Implementation plans and task breakdowns',
    supportsExport: false,
    supportsImport: false,
  },
  {
    id: 'sensors',
    displayName: 'Harness Sensors',
    contextPath: '.context/harness',
    filePattern: 'sensors.json',
    description: 'Project-specific harness sensor catalog and quality checks',
    supportsExport: false,
    supportsImport: false,
  },
];

/**
 * Get a content type by ID
 */
export function getContentType(id: string): ContentType | undefined {
  return CONTENT_TYPE_REGISTRY.find(ct => ct.id === id);
}

/**
 * Get all content types that support export
 */
export function getExportableContentTypes(): ContentType[] {
  return CONTENT_TYPE_REGISTRY.filter(ct => ct.supportsExport);
}

/**
 * Get all content types that support import
 */
export function getImportableContentTypes(): ContentType[] {
  return CONTENT_TYPE_REGISTRY.filter(ct => ct.supportsImport);
}

/**
 * Get content type IDs
 */
export function getContentTypeIds(): string[] {
  return CONTENT_TYPE_REGISTRY.map(ct => ct.id);
}

/**
 * Check if a content type exists
 */
export function hasContentType(id: string): boolean {
  return CONTENT_TYPE_REGISTRY.some(ct => ct.id === id);
}

/**
 * Register a new content type (for future extensibility)
 * Note: This mutates the registry. Use with caution.
 */
export function registerContentType(contentType: ContentType): void {
  if (hasContentType(contentType.id)) {
    throw new Error(`Content type '${contentType.id}' already exists`);
  }
  CONTENT_TYPE_REGISTRY.push(contentType);
}

/**
 * Get the context path for a content type
 */
export function getContextPath(id: string): string | undefined {
  return getContentType(id)?.contextPath;
}

/**
 * Get the index file for a content type (if any)
 */
export function getIndexFile(id: string): string | undefined {
  return getContentType(id)?.indexFile;
}
