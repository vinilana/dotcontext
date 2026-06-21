/**
 * Tree-sitter based code analysis layer
 *
 * Provides fast syntactic analysis using tree-sitter parsers.
 * Falls back to regex-based extraction if tree-sitter is not available.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ExtractedSymbol,
  ImportInfo,
  ExportInfo,
  FileAnalysis,
  LANGUAGE_EXTENSIONS,
  SupportedLanguage,
} from '../types';

interface CacheEntry {
  mtime: number;
  analysis: FileAnalysis;
}

export class TreeSitterLayer {
  private cache: Map<string, CacheEntry> = new Map();
  private treeSitterAvailable: boolean = false;
  private parsers: Map<string, any> = new Map();
  public readonly ready: Promise<void>;

  constructor() {
    this.ready = this.initializeParsers();
  }

  private async initializeParsers(): Promise<void> {
    try {
      // Try to load tree-sitter dynamically
      const Parser = await import('tree-sitter').catch(() => null);
      if (!Parser) {
        this.treeSitterAvailable = false;
        return;
      }

      // Try to load language parsers
      const tsParser = await import('tree-sitter-typescript').catch(() => null);
      if (tsParser && Parser.default) {
        const parser = new Parser.default();
        parser.setLanguage(tsParser.typescript);
        this.parsers.set('typescript', parser);
        this.parsers.set('javascript', parser);
        this.treeSitterAvailable = true;
      }
    } catch {
      this.treeSitterAvailable = false;
    }
  }

  async analyzeFile(filePath: string): Promise<FileAnalysis> {
    // Ensure initialization is complete before checking treeSitterAvailable
    await this.ready;

    const ext = path.extname(filePath);
    const language = LANGUAGE_EXTENSIONS[ext];

    if (!language) {
      return this.emptyAnalysis(filePath, 'unknown');
    }

    try {
      const stat = await fs.stat(filePath);
      const mtime = stat.mtimeMs;

      // Check cache
      const cached = this.cache.get(filePath);
      if (cached && cached.mtime === mtime) {
        return cached.analysis;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      let analysis: FileAnalysis;

      if (this.treeSitterAvailable && this.parsers.has(language)) {
        analysis = this.analyzeWithTreeSitter(filePath, content, language);
      } else {
        analysis = this.analyzeWithRegex(filePath, content, language);
      }

      this.cache.set(filePath, { mtime, analysis });
      return analysis;
    } catch (error) {
      return this.emptyAnalysis(filePath, language);
    }
  }

  private analyzeWithTreeSitter(
    filePath: string,
    content: string,
    language: SupportedLanguage
  ): FileAnalysis {
    const parser = this.parsers.get(language);
    if (!parser) {
      return this.analyzeWithRegex(filePath, content, language);
    }

    const tree = parser.parse(content);
    const symbols: ExtractedSymbol[] = [];
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];

    this.extractFromTreeSitter(tree.rootNode, filePath, symbols, imports, exports);

    return { filePath, symbols, imports, exports, language };
  }

  private extractFromTreeSitter(
    node: any,
    filePath: string,
    symbols: ExtractedSymbol[],
    imports: ImportInfo[],
    exports: ExportInfo[]
  ): void {
    const cursor = node.walk();

    const visit = (): void => {
      const currentNode = cursor.currentNode;

      switch (currentNode.type) {
        case 'class_declaration':
          symbols.push(this.extractClassFromTree(currentNode, filePath));
          break;
        case 'interface_declaration':
          symbols.push(this.extractInterfaceFromTree(currentNode, filePath));
          break;
        case 'function_declaration':
          symbols.push(this.extractFunctionFromTree(currentNode, filePath));
          break;
        case 'type_alias_declaration':
          symbols.push(this.extractTypeFromTree(currentNode, filePath));
          break;
        case 'enum_declaration':
          symbols.push(this.extractEnumFromTree(currentNode, filePath));
          break;
        case 'import_statement':
          imports.push(this.extractImportFromTree(currentNode));
          break;
        case 'export_statement': {
          const exportInfo = this.extractExportFromTree(currentNode);
          if (exportInfo) exports.push(exportInfo);
          break;
        }
      }

      if (cursor.gotoFirstChild()) {
        do {
          visit();
        } while (cursor.gotoNextSibling());
        cursor.gotoParent();
      }
    };

    visit();
  }

  private extractClassFromTree(node: any, filePath: string): ExtractedSymbol {
    const nameNode = node.childForFieldName?.('name');
    return {
      name: nameNode?.text || 'anonymous',
      kind: 'class',
      location: {
        file: filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
      },
      exported: this.isNodeExported(node),
      documentation: this.extractDocComment(node),
    };
  }

  private extractInterfaceFromTree(node: any, filePath: string): ExtractedSymbol {
    const nameNode = node.childForFieldName?.('name');
    return {
      name: nameNode?.text || 'anonymous',
      kind: 'interface',
      location: {
        file: filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
      },
      exported: this.isNodeExported(node),
      documentation: this.extractDocComment(node),
    };
  }

  private extractFunctionFromTree(node: any, filePath: string): ExtractedSymbol {
    const nameNode = node.childForFieldName?.('name');
    return {
      name: nameNode?.text || 'anonymous',
      kind: 'function',
      location: {
        file: filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
      },
      exported: this.isNodeExported(node),
      documentation: this.extractDocComment(node),
    };
  }

  private extractTypeFromTree(node: any, filePath: string): ExtractedSymbol {
    const nameNode = node.childForFieldName?.('name');
    return {
      name: nameNode?.text || 'anonymous',
      kind: 'type',
      location: {
        file: filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
      },
      exported: this.isNodeExported(node),
      documentation: this.extractDocComment(node),
    };
  }

  private extractEnumFromTree(node: any, filePath: string): ExtractedSymbol {
    const nameNode = node.childForFieldName?.('name');
    return {
      name: nameNode?.text || 'anonymous',
      kind: 'enum',
      location: {
        file: filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
      },
      exported: this.isNodeExported(node),
      documentation: this.extractDocComment(node),
    };
  }

  private extractImportFromTree(node: any): ImportInfo {
    const sourceNode = node.children?.find((c: any) => c.type === 'string');
    const source = sourceNode?.text?.replace(/['"]/g, '') || '';

    const specifiers: string[] = [];
    let isDefault = false;
    let isNamespace = false;

    const importClause = node.children?.find((c: any) => c.type === 'import_clause');
    if (importClause) {
      for (const child of importClause.children || []) {
        if (child.type === 'identifier') {
          specifiers.push(child.text);
          isDefault = true;
        } else if (child.type === 'named_imports') {
          for (const spec of child.children || []) {
            if (spec.type === 'import_specifier') {
              const name = spec.childForFieldName?.('name') ||
                spec.children?.find((c: any) => c.type === 'identifier');
              if (name) specifiers.push(name.text);
            }
          }
        } else if (child.type === 'namespace_import') {
          const name = child.children?.find((c: any) => c.type === 'identifier');
          if (name) specifiers.push(name.text);
          isNamespace = true;
        }
      }
    }

    return { source, specifiers, isDefault, isNamespace };
  }

  private extractExportFromTree(node: any): ExportInfo | null {
    const isDefault = node.children?.some((c: any) => c.type === 'default') || false;

    const declaration = node.children?.find((c: any) =>
      ['class_declaration', 'function_declaration', 'interface_declaration',
        'type_alias_declaration', 'enum_declaration', 'variable_declaration'].includes(c.type)
    );

    if (declaration) {
      const nameNode = declaration.childForFieldName?.('name');
      return {
        name: nameNode?.text || 'default',
        isDefault,
        isReExport: false,
      };
    }

    return null;
  }

  private isNodeExported(node: any): boolean {
    let parent = node.parent;
    while (parent) {
      if (parent.type === 'export_statement') return true;
      parent = parent.parent;
    }
    return false;
  }

  private extractDocComment(node: any): string | undefined {
    const prev = node.previousNamedSibling;
    if (prev?.type === 'comment' && prev.text?.startsWith('/**')) {
      return prev.text
        .replace(/^\/\*\*\s*/, '')
        .replace(/\s*\*\/$/, '')
        .replace(/^\s*\*\s?/gm, '')
        .trim();
    }
    return undefined;
  }

  /**
   * Regex-based fallback for when tree-sitter is not available
   */
  private analyzeWithRegex(
    filePath: string,
    content: string,
    language: SupportedLanguage
  ): FileAnalysis {
    if (language === 'typescript' || language === 'javascript') {
      return this.analyzeTypeScriptWithRegex(filePath, content, language);
    }

    if (language === 'python') {
      return this.analyzePythonWithRegex(filePath, content);
    }

    return this.emptyAnalysis(filePath, language);
  }

  private analyzeTypeScriptWithRegex(
    filePath: string,
    content: string,
    language: SupportedLanguage
  ): FileAnalysis {
    const lines = content.split('\n');
    const symbols: ExtractedSymbol[] = [];
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];

    // Patterns for TypeScript/JavaScript
    const classPattern = /^(\s*)(export\s+)?(abstract\s+)?class\s+(\w+)/;
    const interfacePattern = /^(\s*)(export\s+)?interface\s+(\w+)/;
    const functionPattern = /^(\s*)(export\s+)?(async\s+)?function\s+(\w+)/;
    const typePattern = /^(\s*)(export\s+)?type\s+(\w+)/;
    const enumPattern = /^(\s*)(export\s+)?enum\s+(\w+)/;
    const constFunctionPattern = /^(\s*)(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?\(/;
    const arrowFunctionPattern = /^(\s*)(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*(:\s*\w+)?\s*=>/;

    const importPattern = /^import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]+)\})?\s*(?:\*\s+as\s+(\w+))?\s*from\s+['"]([^'"]+)['"]/;
    const exportPattern = /^export\s+(?:default\s+)?(?:class|function|interface|type|enum|const)\s+(\w+)/;
    const reExportPattern = /^export\s+(?:\{([^}]+)\}|\*)\s+from\s+['"]([^'"]+)['"]/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for imports
      const importMatch = line.match(importPattern);
      if (importMatch) {
        const [, defaultImport, namedImports, namespaceImport, source] = importMatch;
        const specifiers: string[] = [];

        if (defaultImport) specifiers.push(defaultImport);
        if (namedImports) {
          namedImports.split(',').forEach((s) => {
            const name = s.trim().split(/\s+as\s+/)[0].trim();
            if (name) specifiers.push(name);
          });
        }
        if (namespaceImport) specifiers.push(namespaceImport);

        imports.push({
          source,
          specifiers,
          isDefault: !!defaultImport,
          isNamespace: !!namespaceImport,
        });
        continue;
      }

      // Check for re-exports
      const reExportMatch = line.match(reExportPattern);
      if (reExportMatch) {
        const [, namedExports, source] = reExportMatch;
        if (namedExports) {
          namedExports.split(',').forEach((s) => {
            const name = s.trim().split(/\s+as\s+/)[0].trim();
            if (name) {
              exports.push({ name, isDefault: false, isReExport: true, originalSource: source });
            }
          });
        }
        continue;
      }

      // Check for classes
      const classMatch = line.match(classPattern);
      if (classMatch) {
        const [, , exportKeyword, , name] = classMatch;
        symbols.push({
          name,
          kind: 'class',
          location: { file: filePath, line: lineNum, column: 0 },
          exported: !!exportKeyword,
        });
        continue;
      }

      // Check for interfaces
      const interfaceMatch = line.match(interfacePattern);
      if (interfaceMatch) {
        const [, , exportKeyword, name] = interfaceMatch;
        symbols.push({
          name,
          kind: 'interface',
          location: { file: filePath, line: lineNum, column: 0 },
          exported: !!exportKeyword,
        });
        continue;
      }

      // Check for functions
      const functionMatch = line.match(functionPattern);
      if (functionMatch) {
        const [, , exportKeyword, , name] = functionMatch;
        symbols.push({
          name,
          kind: 'function',
          location: { file: filePath, line: lineNum, column: 0 },
          exported: !!exportKeyword,
        });
        continue;
      }

      // Check for arrow functions
      const arrowMatch = line.match(arrowFunctionPattern) || line.match(constFunctionPattern);
      if (arrowMatch) {
        const [, , exportKeyword, name] = arrowMatch;
        symbols.push({
          name,
          kind: 'function',
          location: { file: filePath, line: lineNum, column: 0 },
          exported: !!exportKeyword,
        });
        continue;
      }

      // Check for types
      const typeMatch = line.match(typePattern);
      if (typeMatch) {
        const [, , exportKeyword, name] = typeMatch;
        symbols.push({
          name,
          kind: 'type',
          location: { file: filePath, line: lineNum, column: 0 },
          exported: !!exportKeyword,
        });
        continue;
      }

      // Check for enums
      const enumMatch = line.match(enumPattern);
      if (enumMatch) {
        const [, , exportKeyword, name] = enumMatch;
        symbols.push({
          name,
          kind: 'enum',
          location: { file: filePath, line: lineNum, column: 0 },
          exported: !!exportKeyword,
        });
        continue;
      }

      // Check for exports
      const exportMatch = line.match(exportPattern);
      if (exportMatch) {
        const [fullMatch, name] = exportMatch;
        const isDefault = fullMatch.includes('default');
        exports.push({ name, isDefault, isReExport: false });
      }
    }

    return { filePath, symbols, imports, exports, language };
  }

  private analyzePythonWithRegex(filePath: string, content: string): FileAnalysis {
    const lines = content.split('\n');
    const symbols: ExtractedSymbol[] = [];
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];

    const classPattern = /^class\s+(\w+)/;
    const functionPattern = /^(async\s+)?def\s+(\w+)/;
    const importPattern = /^(?:from\s+(\S+)\s+)?import\s+(.+)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for imports
      const importMatch = line.match(importPattern);
      if (importMatch) {
        const [, fromModule, importedItems] = importMatch;
        const specifiers = importedItems
          .split(',')
          .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
          .filter(Boolean);

        imports.push({
          source: fromModule || importedItems.trim(),
          specifiers,
          isDefault: false,
          isNamespace: importedItems.includes('*'),
        });
        continue;
      }

      // Check for classes
      const classMatch = line.match(classPattern);
      if (classMatch) {
        const [, name] = classMatch;
        const isPrivate = name.startsWith('_');
        symbols.push({
          name,
          kind: 'class',
          location: { file: filePath, line: lineNum, column: 0 },
          exported: !isPrivate,
        });
        continue;
      }

      // Check for functions
      const functionMatch = line.match(functionPattern);
      if (functionMatch) {
        const [, , name] = functionMatch;
        const isPrivate = name.startsWith('_');
        symbols.push({
          name,
          kind: 'function',
          location: { file: filePath, line: lineNum, column: 0 },
          exported: !isPrivate,
        });
      }
    }

    return { filePath, symbols, imports, exports, language: 'python' };
  }

  private emptyAnalysis(filePath: string, language: string): FileAnalysis {
    return {
      filePath,
      symbols: [],
      imports: [],
      exports: [],
      language,
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  async isTreeSitterAvailable(): Promise<boolean> {
    await this.ready;
    return this.treeSitterAvailable;
  }
}
