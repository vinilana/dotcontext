/**
 * Harness Docs Service
 *
 * Transport-agnostic listing and content retrieval for `.context/docs/*.md`.
 * Mirrors the shape of `HarnessSkillsService.list()` / `getContent()` so the
 * web dashboard (and any future adapter) can browse generated/filled docs the
 * same way it browses skills. No equivalent listing service exists for docs
 * today, so this is a small, intentionally narrow addition (Phase 3 of the
 * web-interface plan).
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { parseFrontMatter, parseScaffoldFrontMatter } from '../../../utils/frontMatter';
import { PathValidator } from '../../../utils/pathSecurity';

export interface HarnessDocsServiceOptions {
  repoPath: string;
}

export interface HarnessDocEntry {
  name: string;
  title: string;
  description?: string;
  category?: string;
  status: 'filled' | 'unfilled';
}

export interface HarnessDocContent {
  name: string;
  frontMatter: Record<string, unknown>;
  content: string;
}

const DOCS_RELATIVE_DIR = path.join('.context', 'docs');
const MARKDOWN_EXTENSION = '.md';

function deriveTitle(body: string, fallback: string): string {
  const match = body.match(/^#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : fallback;
}

function humanizeName(name: string): string {
  return name
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || name;
}

/**
 * Resolve frontmatter (v2 scaffold format, falling back to legacy v1) plus
 * the markdown body with the frontmatter block stripped.
 */
function readDocFrontMatter(content: string): {
  frontMatter: Record<string, unknown> | null;
  body: string;
} {
  const scaffold = parseScaffoldFrontMatter(content);
  if (scaffold.frontMatter) {
    // ParsedScaffoldFrontmatter has concrete fields (no index signature); this
    // service only ever forwards frontmatter as a generic JSON-serializable
    // bag (see HarnessDocContent), so the widen-to-Record cast is safe here.
    return { frontMatter: scaffold.frontMatter as unknown as Record<string, unknown>, body: scaffold.body };
  }

  const legacy = parseFrontMatter(content);
  return { frontMatter: legacy.frontMatter, body: legacy.body };
}

export class HarnessDocsService {
  constructor(private readonly options: HarnessDocsServiceOptions) {}

  private get repoPath(): string {
    return this.options.repoPath || process.cwd();
  }

  private get docsDir(): string {
    return path.join(this.repoPath, DOCS_RELATIVE_DIR);
  }

  /**
   * List docs directly under `.context/docs/*.md`, mirroring
   * `HarnessSkillsService.list()`'s flat summary shape.
   */
  async list(): Promise<HarnessDocEntry[]> {
    if (!(await fs.pathExists(this.docsDir))) {
      return [];
    }

    const entries = await fs.readdir(this.docsDir, { withFileTypes: true });
    const fileNames = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(MARKDOWN_EXTENSION))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    const docs: HarnessDocEntry[] = [];

    for (const fileName of fileNames) {
      const name = fileName.slice(0, -MARKDOWN_EXTENSION.length);

      let raw: string;
      try {
        raw = await fs.readFile(path.join(this.docsDir, fileName), 'utf-8');
      } catch {
        continue;
      }

      const { frontMatter, body } = readDocFrontMatter(raw);
      const description = typeof frontMatter?.description === 'string' && frontMatter.description.length > 0
        ? frontMatter.description
        : undefined;
      const category = typeof frontMatter?.category === 'string' && frontMatter.category.length > 0
        ? frontMatter.category
        : undefined;
      const titleFallback = typeof frontMatter?.name === 'string' && frontMatter.name.length > 0
        ? frontMatter.name
        : humanizeName(name);

      docs.push({
        name,
        title: deriveTitle(body, titleFallback),
        description,
        category,
        status: frontMatter?.status === 'unfilled' ? 'unfilled' : 'filled',
      });
    }

    return docs;
  }

  /**
   * Get the parsed frontmatter and body content for a single doc by name
   * (file name without the `.md` extension). Resolves the requested doc
   * through `PathValidator` so traversal-style names can never escape
   * `.context/docs`.
   */
  async getContent(name: string): Promise<HarnessDocContent> {
    const validator = new PathValidator(this.docsDir);
    const filePath = validator.validatePath(`${name}${MARKDOWN_EXTENSION}`);

    if (!(await fs.pathExists(filePath))) {
      throw new Error(`Doc not found: ${name}`);
    }

    const raw = await fs.readFile(filePath, 'utf-8');
    const { frontMatter, body } = readDocFrontMatter(raw);

    return {
      name,
      frontMatter: frontMatter ?? {},
      content: body,
    };
  }
}
