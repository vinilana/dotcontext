/**
 * Get Codebase Map Tool
 *
 * Retrieves specific sections of the codebase-map.json file to allow
 * LLMs to query only the parts they need, reducing token usage.
 */

import { tool } from 'ai';
import * as fs from 'fs-extra';
import * as path from 'path';
import { GetCodebaseMapInputSchema, type GetCodebaseMapInput, type GetCodebaseMapOutput } from '../schemas';
import type { CodebaseMap } from '../../../generators/documentation';

export const getCodebaseMapTool = tool({
  description: 'Get codebase map data (structure, symbols, architecture, keyFiles, navigation) from the pre-generated JSON. Use specific sections to reduce token usage. Available sections: all, stack, structure, architecture, symbols, symbols.*, publicAPI, dependencies, stats, keyFiles, navigation',
  inputSchema: GetCodebaseMapInputSchema,
  execute: async (input: GetCodebaseMapInput): Promise<GetCodebaseMapOutput> => {
    if (!input.repoPath) {
      throw new Error('repoPath is required for getCodebaseMap');
    }
    const repoPath = input.repoPath;

    const section = input.section || 'architecture';
    const defaultSectionApplied = input.section === undefined;

    try {
      const mapPath = path.join(repoPath, '.context', 'docs', 'codebase-map.json');

      if (!await fs.pathExists(mapPath)) {
        return {
          success: false,
          section,
          error: `Codebase map not found at ${mapPath}. Run initialization with --semantic flag first.`
        };
      }

      const codebaseMap: CodebaseMap = await fs.readJson(mapPath);
      const data = extractSection(codebaseMap, section);

      return {
        success: true,
        section,
        defaultSectionApplied,
        explicitAllHint: defaultSectionApplied
          ? 'Request section: "all" only when you need the full map payload.'
          : undefined,
        data,
        mapPath
      };
    } catch (error) {
      return {
        success: false,
        section,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

/**
 * Extract a specific section from the codebase map
 */
function extractSection(map: CodebaseMap, section: string): unknown {
  switch (section) {
    case 'all':
      return map;
    case 'stack':
      return map.stack;
    case 'structure':
      return map.structure;
    case 'architecture':
      return map.architecture;
    case 'symbols':
      return map.symbols;
    case 'symbols.classes':
      return map.symbols.classes;
    case 'symbols.interfaces':
      return map.symbols.interfaces;
    case 'symbols.functions':
      return map.symbols.functions;
    case 'symbols.types':
      return map.symbols.types;
    case 'symbols.enums':
      return map.symbols.enums;
    case 'publicAPI':
      return map.publicAPI;
    case 'dependencies':
      return map.dependencies;
    case 'stats':
      return map.stats;
    case 'keyFiles':
      return map.keyFiles ?? [];
    case 'navigation':
      return map.navigation ?? {};
    default:
      return map.architecture;
  }
}
