/**
 * Semantic analysis types for codebase understanding
 */

export type SymbolKind = 'class' | 'interface' | 'function' | 'type' | 'variable' | 'enum' | 'method';

export interface SymbolLocation {
  file: string;
  line: number;
  column: number;
}

export interface ParameterInfo {
  name: string;
  type?: string;
  optional?: boolean;
  defaultValue?: string;
}

export interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  location: SymbolLocation;
  exported: boolean;
  documentation?: string;
  extends?: string;
  implements?: string[];
  parameters?: ParameterInfo[];
  returnType?: string;
  members?: ExtractedSymbol[];
  // LSP-enhanced properties (populated when useLSP is enabled)
  typeInfo?: TypeInfo;
  references?: ReferenceLocation[];
  implementations?: ReferenceLocation[];
}

export interface ImportInfo {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  isNamespace: boolean;
  alias?: string;
}

export interface ExportInfo {
  name: string;
  isDefault: boolean;
  isReExport: boolean;
  originalSource?: string;
}

export interface FileAnalysis {
  filePath: string;
  symbols: ExtractedSymbol[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  language: string;
}

export interface ArchitectureLayer {
  name: string;
  description: string;
  directories: string[];
  symbols: ExtractedSymbol[];
  dependsOn: string[];
}

export interface DetectedPattern {
  name: string;
  confidence: number;
  locations: Array<{ file: string; symbol: string }>;
  description: string;
}

/**
 * Functional pattern types for Q&A topic detection
 * These patterns indicate functional capabilities in the codebase
 */
export type FunctionalPatternType =
  | 'auth'
  | 'database'
  | 'api'
  | 'cache'
  | 'queue'
  | 'websocket'
  | 'logging'
  | 'validation'
  | 'error-handling'
  | 'testing';

export interface FunctionalPattern {
  type: FunctionalPatternType;
  confidence: number;
  indicators: PatternIndicator[];
  description: string;
}

export interface PatternIndicator {
  file: string;
  symbol?: string;
  line?: number;
  reason: string;
}

export interface DetectedFunctionalPatterns {
  hasAuthPattern: boolean;
  hasDatabasePattern: boolean;
  hasApiPattern: boolean;
  hasCachePattern: boolean;
  hasQueuePattern: boolean;
  hasWebSocketPattern: boolean;
  hasLoggingPattern: boolean;
  hasValidationPattern: boolean;
  hasErrorHandlingPattern: boolean;
  hasTestingPattern: boolean;
  patterns: FunctionalPattern[];
}

/**
 * Flow tracing types for understanding execution paths
 */
export interface FlowNode {
  file: string;
  symbol: string;
  line: number;
  type: 'entry' | 'call' | 'return' | 'branch';
}

export interface FlowEdge {
  from: FlowNode;
  to: FlowNode;
  label?: string;
}

export interface ExecutionFlow {
  entryPoint: FlowNode;
  nodes: FlowNode[];
  edges: FlowEdge[];
  mermaidDiagram: string;
}

export interface DependencyInfo {
  graph: Map<string, string[]>;
  reverseGraph: Map<string, string[]>;
}

export interface ArchitectureInfo {
  layers: ArchitectureLayer[];
  patterns: DetectedPattern[];
  entryPoints: string[];
  publicAPI: ExtractedSymbol[];
}

export interface SemanticStats {
  totalFiles: number;
  totalSymbols: number;
  languageBreakdown: Record<string, number>;
  analysisTimeMs: number;
}

export interface SemanticContext {
  symbols: {
    classes: ExtractedSymbol[];
    interfaces: ExtractedSymbol[];
    functions: ExtractedSymbol[];
    types: ExtractedSymbol[];
    enums: ExtractedSymbol[];
  };
  dependencies: DependencyInfo;
  architecture: ArchitectureInfo;
  stats: SemanticStats;
}

export interface TypeInfo {
  name: string;
  fullType: string;
  documentation?: string;
}

export interface ReferenceLocation {
  file: string;
  line: number;
  column: number;
  context?: string;
}

export interface AnalyzerOptions {
  useLSP?: boolean;
  languages?: string[];
  exclude?: string[];
  include?: string[];
  maxFiles?: number;
  cacheEnabled?: boolean;
}

export interface LSPServerConfig {
  command: string;
  args: string[];
  rootPatterns?: string[];
}

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python';

export const LANGUAGE_EXTENSIONS: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.pyw': 'python',
  '.pyi': 'python',
};

export const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  'dist',
  'build',
  '.git',
  'vendor',
  '__pycache__',
  '.next',
  '.nuxt',
  'coverage',
  '.cache',
  'target',
  'venv',
  '.venv',
];
